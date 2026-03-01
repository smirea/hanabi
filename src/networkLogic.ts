import { comparePeerId, electHostId } from './hostElection';
import type { HanabiState } from './game';
import type { RoomMember, RoomSnapshot } from './network';
import {
  normalizeUniquePlayerNameKey,
  resolveUniquePlayerName,
  sanitizePlayerName
} from './networkShared';

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
    const baseName = sanitizePlayerName(namesByPeerId.get(peerId)) ?? fallback;
    const uniqueName = resolveUniquePlayerName(baseName, used);
    used.add(normalizeUniquePlayerNameKey(uniqueName));

    return {
      peerId,
      name: uniqueName,
      isTv: isTvByPeerId.get(peerId) ?? previousByPeerId.get(peerId)?.isTv ?? false
    };
  });
}

function clearMemberPlayerIds(members: RoomMember[]): RoomMember[] {
  return members.map((member) => ({
    ...member,
    playerId: null
  }));
}

function normalizeValidPlayerId(value: unknown, validPlayerIds: Set<string>): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  return validPlayerIds.has(value) ? value : null;
}

export function assignMemberPlayerIds(
  members: RoomMember[],
  previousMembers: RoomMember[],
  gameState: HanabiState | null
): RoomMember[] {
  if (!gameState) {
    return clearMemberPlayerIds(members);
  }

  const validPlayerIds = new Set(gameState.players.map((player) => player.id));
  const previousByPeerId = new Map(previousMembers.map((member) => [member.peerId, member]));
  const connectedPeerIds = new Set(members.map((member) => member.peerId));
  const claimedPlayerIds = new Set<string>();

  const nextMembers = members.map((member) => {
    if (member.isTv) {
      return {
        ...member,
        playerId: null
      };
    }

    const preservedPlayerId = normalizeValidPlayerId(previousByPeerId.get(member.peerId)?.playerId, validPlayerIds);
    if (preservedPlayerId && !claimedPlayerIds.has(preservedPlayerId)) {
      claimedPlayerIds.add(preservedPlayerId);
      return {
        ...member,
        playerId: preservedPlayerId
      };
    }

    const directPlayerId = normalizeValidPlayerId(member.peerId, validPlayerIds);
    if (directPlayerId && !claimedPlayerIds.has(directPlayerId)) {
      claimedPlayerIds.add(directPlayerId);
      return {
        ...member,
        playerId: directPlayerId
      };
    }

    return {
      ...member,
      playerId: null
    };
  });

  const disconnectedPlayerIdsByName = new Map<string, string[]>();
  for (const previousMember of previousMembers) {
    if (previousMember.isTv || connectedPeerIds.has(previousMember.peerId)) {
      continue;
    }

    const previousPlayerId = normalizeValidPlayerId(previousMember.playerId, validPlayerIds);
    if (!previousPlayerId || claimedPlayerIds.has(previousPlayerId)) {
      continue;
    }

    const key = normalizeUniquePlayerNameKey(previousMember.name);
    const existing = disconnectedPlayerIdsByName.get(key);
    if (existing) {
      existing.push(previousPlayerId);
      continue;
    }

    disconnectedPlayerIdsByName.set(key, [previousPlayerId]);
  }

  const playerIdsByName = new Map<string, string[]>();
  for (const player of gameState.players) {
    if (claimedPlayerIds.has(player.id)) {
      continue;
    }

    const key = normalizeUniquePlayerNameKey(player.name);
    const existing = playerIdsByName.get(key);
    if (existing) {
      existing.push(player.id);
      continue;
    }

    playerIdsByName.set(key, [player.id]);
  }

  return nextMembers.map((member) => {
    if (member.isTv || member.playerId !== null) {
      return member;
    }

    const key = normalizeUniquePlayerNameKey(member.name);
    const disconnectedCandidates = disconnectedPlayerIdsByName.get(key);
    const reclaimedDisconnectedPlayerId = disconnectedCandidates?.shift() ?? null;
    if (reclaimedDisconnectedPlayerId) {
      if (!disconnectedCandidates || disconnectedCandidates.length === 0) {
        disconnectedPlayerIdsByName.delete(key);
      }

      claimedPlayerIds.add(reclaimedDisconnectedPlayerId);
      return {
        ...member,
        playerId: reclaimedDisconnectedPlayerId
      };
    }

    const candidates = playerIdsByName.get(key);
    const reclaimedPlayerId = candidates?.shift() ?? null;
    if (!reclaimedPlayerId) {
      return member;
    }

    if (!candidates || candidates.length === 0) {
      playerIdsByName.delete(key);
    }

    claimedPlayerIds.add(reclaimedPlayerId);
    return {
      ...member,
      playerId: reclaimedPlayerId
    };
  });
}

export function resolveMemberPlayerId(
  members: RoomMember[],
  gameState: Pick<HanabiState, 'players'> | null,
  peerId: string
): string | null {
  if (!gameState) {
    return null;
  }

  const member = members.find((entry) => entry.peerId === peerId);
  if (!member || member.isTv) {
    return null;
  }

  const validPlayerIds = new Set(gameState.players.map((player) => player.id));
  const explicitPlayerId = normalizeValidPlayerId(member.playerId, validPlayerIds);
  if (explicitPlayerId) {
    return explicitPlayerId;
  }

  const directPlayerId = normalizeValidPlayerId(peerId, validPlayerIds);
  if (directPlayerId) {
    return directPlayerId;
  }

  const normalizedName = normalizeUniquePlayerNameKey(member.name);
  let matchedPlayerId: string | null = null;
  for (const player of gameState.players) {
    if (normalizeUniquePlayerNameKey(player.name) !== normalizedName) {
      continue;
    }

    if (matchedPlayerId !== null) {
      return null;
    }

    matchedPlayerId = player.id;
  }

  return matchedPlayerId;
}

export function areMembersEqual(a: RoomMember[], b: RoomMember[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.peerId !== right.peerId
      || left.name !== right.name
      || left.isTv !== right.isTv
      || (left.playerId ?? null) !== (right.playerId ?? null)
    ) {
      return false;
    }
  }

  return true;
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
    && typeof candidate.isTv === 'boolean'
    && (
      candidate.playerId === undefined
      || candidate.playerId === null
      || (typeof candidate.playerId === 'string' && candidate.playerId.length > 0)
    );
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

export function electSnapshotHostId(
  connectedPeerIds: Set<string>,
  current: Pick<RoomSnapshot, 'hostId' | 'members'> | null
): string | null {
  if (current && connectedPeerIds.has(current.hostId)) {
    return current.hostId;
  }

  return electHostId(connectedPeerIds, current?.members.map((member) => member.peerId));
}

export function shouldBootstrapWithoutSnapshot(selfId: string, connectedPeerIds: Set<string>): boolean {
  return electHostId(connectedPeerIds) === selfId;
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

  const electedHost = electSnapshotHostId(connectedPeerIds, current);
  if (electedHost !== incoming.hostId) {
    return false;
  }

  if (incoming.version > current.version) {
    return true;
  }

  return comparePeerId(incoming.hostId, current.hostId) < 0;
}
