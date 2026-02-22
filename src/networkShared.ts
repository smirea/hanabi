import { HanabiGame } from './game';
import type { LobbySettings, NetworkAction } from './network';

export const MAX_PLAYER_NAME_LENGTH = 24;
export const MIN_SEATED_PLAYER_COUNT = 2;
export const MAX_SEATED_PLAYER_COUNT = 5;

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  includeMulticolor: false,
  multicolorShortDeck: false,
  multicolorWildHints: false,
  endlessMode: false
};

export function cloneLobbySettings(settings: LobbySettings = DEFAULT_LOBBY_SETTINGS): LobbySettings {
  return {
    includeMulticolor: settings.includeMulticolor,
    multicolorShortDeck: settings.multicolorShortDeck,
    multicolorWildHints: settings.multicolorWildHints,
    endlessMode: settings.endlessMode
  };
}

export function normalizeSettings(input: Partial<LobbySettings> | undefined): LobbySettings {
  const includeMulticolor = Boolean(input?.includeMulticolor);
  const multicolorWildHints = includeMulticolor && Boolean(input?.multicolorWildHints);
  const multicolorShortDeck = includeMulticolor
    && !multicolorWildHints
    && Boolean(input?.multicolorShortDeck ?? true);
  const endlessMode = Boolean(input?.endlessMode);

  return {
    includeMulticolor,
    multicolorShortDeck,
    multicolorWildHints,
    endlessMode
  };
}

export function areLobbySettingsEqual(left: LobbySettings, right: LobbySettings): boolean {
  return left.includeMulticolor === right.includeMulticolor
    && left.multicolorShortDeck === right.multicolorShortDeck
    && left.multicolorWildHints === right.multicolorWildHints
    && left.endlessMode === right.endlessMode;
}

export function isValidSeatedPlayerCount(count: number): boolean {
  return count >= MIN_SEATED_PLAYER_COUNT && count <= MAX_SEATED_PLAYER_COUNT;
}

export function sanitizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function normalizeUniquePlayerNameKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveUniquePlayerName(baseName: string, used: Set<string>): string {
  const normalizedBase = normalizeUniquePlayerNameKey(baseName);
  if (!used.has(normalizedBase)) {
    return baseName;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const suffixText = ` ${suffix}`;
    const maxBaseLength = Math.max(1, MAX_PLAYER_NAME_LENGTH - suffixText.length);
    const trimmedBase = baseName.slice(0, maxBaseLength).trimEnd();
    const candidate = `${trimmedBase}${suffixText}`;
    const normalizedCandidate = normalizeUniquePlayerNameKey(candidate);
    if (!used.has(normalizedCandidate)) {
      return candidate;
    }
  }

  return `${baseName.slice(0, MAX_PLAYER_NAME_LENGTH - 1).trimEnd()}*`;
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
