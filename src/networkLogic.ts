import { HanabiGame } from './game';
import { comparePeerId, electHostId } from './hostElection';
import type { LobbySettings, NetworkAction, RoomMember, RoomSnapshot } from './network';

export function normalizeSettings(input: Partial<LobbySettings> | undefined): LobbySettings {
  const includeMulticolor = Boolean(input?.includeMulticolor);
  const multicolorWildHints = includeMulticolor && Boolean(input?.multicolorWildHints);
  const multicolorShortDeck = includeMulticolor && !multicolorWildHints && Boolean(input?.multicolorShortDeck);
  const endlessMode = Boolean(input?.endlessMode);

  return {
    includeMulticolor,
    multicolorShortDeck,
    multicolorWildHints,
    endlessMode
  };
}

export function formatPeerName(peerId: string): string {
  const suffix = peerId.slice(-4).toUpperCase();
  return `Player ${suffix}`;
}

export function assignMembers(
  connectedPeerIds: Set<string>,
  previousMembers: RoomMember[],
  namesByPeerId: Map<string, string>,
  isTvByPeerId: Map<string, boolean>
): RoomMember[] {
  const orderedPeerIds: string[] = [];
  const seen = new Set<string>();
  const previousByPeerId = new Map(previousMembers.map((member) => [member.peerId, member]));

  for (const member of previousMembers) {
    if (connectedPeerIds.has(member.peerId) && !seen.has(member.peerId)) {
      orderedPeerIds.push(member.peerId);
      seen.add(member.peerId);
    }
  }

  for (const peerId of [...connectedPeerIds].sort(comparePeerId)) {
    if (!seen.has(peerId)) {
      orderedPeerIds.push(peerId);
      seen.add(peerId);
    }
  }

  const used = new Set<string>();
  return orderedPeerIds.map((peerId) => {
    const fallback = formatPeerName(peerId);
    const baseName = sanitizeMemberName(namesByPeerId.get(peerId)) ?? fallback;
    const uniqueName = resolveUniqueName(baseName, used);
    used.add(normalizeUniqueKey(uniqueName));

    return {
      peerId,
      name: uniqueName,
      isTv: isTvByPeerId.get(peerId) ?? previousByPeerId.get(peerId)?.isTv ?? false
    };
  });
}

export function areMembersEqual(a: RoomMember[], b: RoomMember[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left.peerId !== right.peerId || left.name !== right.name || left.isTv !== right.isTv) {
      return false;
    }
  }

  return true;
}

export function applyNetworkAction(game: HanabiGame, action: NetworkAction): void {
  const currentPlayer = game.state.players[game.state.currentTurnPlayerIndex];
  if (!currentPlayer) {
    throw new Error('Current turn player is missing');
  }

  if (currentPlayer.id !== action.actorId) {
    throw new Error('Action actor is not the current turn player');
  }

  if (action.type === 'play') {
    game.playCard(action.cardId);
    return;
  }

  if (action.type === 'discard') {
    game.discardCard(action.cardId);
    return;
  }

  if (action.type === 'hint-color') {
    game.giveColorHint(action.targetPlayerId, action.suit);
    return;
  }

  game.giveNumberHint(action.targetPlayerId, action.number);
}

export function isRoomMember(value: unknown): value is RoomMember {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RoomMember>;
  return typeof candidate.peerId === 'string'
    && candidate.peerId.length > 0
    && typeof candidate.name === 'string'
    && candidate.name.trim().length > 0
    && typeof candidate.isTv === 'boolean';
}

export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RoomSnapshot>;
  if (!Number.isInteger(candidate.version) || Number(candidate.version) < 1) {
    return false;
  }

  if (typeof candidate.hostId !== 'string' || candidate.hostId.length === 0) {
    return false;
  }

  if (candidate.phase !== 'lobby' && candidate.phase !== 'playing') {
    return false;
  }

  if (!Array.isArray(candidate.members) || candidate.members.length === 0 || !candidate.members.every(isRoomMember)) {
    return false;
  }

  if (!candidate.settings || typeof candidate.settings !== 'object') {
    return false;
  }

  if (candidate.gameState !== null && typeof candidate.gameState !== 'object') {
    return false;
  }

  return true;
}

export function shouldAcceptSnapshot(
  incoming: RoomSnapshot,
  current: RoomSnapshot | null,
  connectedPeerIds: Set<string>
): boolean {
  if (!current) {
    return true;
  }

  if (incoming.hostId === current.hostId) {
    return incoming.version >= current.version;
  }

  const electedHost = electHostId(connectedPeerIds, incoming.members.map((member) => member.peerId));
  if (electedHost !== incoming.hostId) {
    return false;
  }

  if (incoming.version > current.version) {
    return true;
  }

  return comparePeerId(incoming.hostId, current.hostId) < 0;
}

const MAX_MEMBER_NAME_LENGTH = 24;

function sanitizeMemberName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, MAX_MEMBER_NAME_LENGTH);
}

function normalizeUniqueKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function resolveUniqueName(baseName: string, used: Set<string>): string {
  const normalizedBase = normalizeUniqueKey(baseName);
  if (!used.has(normalizedBase)) {
    return baseName;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const suffixText = ` ${suffix}`;
    const maxBaseLength = Math.max(1, MAX_MEMBER_NAME_LENGTH - suffixText.length);
    const trimmedBase = baseName.slice(0, maxBaseLength).trimEnd();
    const candidate = `${trimmedBase}${suffixText}`;
    const normalizedCandidate = normalizeUniqueKey(candidate);
    if (!used.has(normalizedCandidate)) {
      return candidate;
    }
  }

  return `${baseName.slice(0, MAX_MEMBER_NAME_LENGTH - 1).trimEnd()}*`;
}
