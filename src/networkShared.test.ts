import { describe, expect, test } from 'bun:test';
import { HanabiGame } from './game';
import {
  areLobbySettingsEqual,
  applyNetworkAction,
  cloneLobbySettings,
  DEFAULT_LOBBY_SETTINGS,
  isValidSeatedPlayerCount,
  MAX_PLAYER_NAME_LENGTH,
  normalizeSettings,
  normalizeUniquePlayerNameKey,
  resolveUniquePlayerName,
  sanitizePlayerName
} from './networkShared';

describe('networkShared', () => {
  test('normalizeSettings enforces multicolor constraints', () => {
    expect(normalizeSettings({ includeMulticolor: false, multicolorShortDeck: true, multicolorWildHints: true })).toEqual({
      includeMulticolor: false,
      multicolorShortDeck: false,
      multicolorWildHints: false,
      endlessMode: false
    });

    expect(normalizeSettings({ includeMulticolor: true, multicolorShortDeck: true, multicolorWildHints: true })).toEqual({
      includeMulticolor: true,
      multicolorShortDeck: false,
      multicolorWildHints: true,
      endlessMode: false
    });

    expect(normalizeSettings({ includeMulticolor: true })).toEqual({
      includeMulticolor: true,
      multicolorShortDeck: true,
      multicolorWildHints: false,
      endlessMode: false
    });
  });

  test('name sanitization and uniqueness helpers normalize and suffix duplicates', () => {
    expect(sanitizePlayerName('   Alex   Rivera   ')).toBe('Alex Rivera');
    expect(sanitizePlayerName('   ')).toBeNull();
    expect(sanitizePlayerName('A'.repeat(MAX_PLAYER_NAME_LENGTH + 10))?.length).toBe(MAX_PLAYER_NAME_LENGTH);

    const used = new Set<string>();
    const first = resolveUniquePlayerName('Alex', used);
    used.add(normalizeUniquePlayerNameKey(first));
    const second = resolveUniquePlayerName('Alex', used);

    expect(first).toBe('Alex');
    expect(second).toBe('Alex 2');
  });

  test('lobby settings helpers clone and compare values safely', () => {
    const cloned = cloneLobbySettings();
    expect(cloned).toEqual(DEFAULT_LOBBY_SETTINGS);
    expect(cloned).not.toBe(DEFAULT_LOBBY_SETTINGS);

    expect(areLobbySettingsEqual(cloned, DEFAULT_LOBBY_SETTINGS)).toBe(true);
    expect(areLobbySettingsEqual(cloned, { ...cloned, endlessMode: true })).toBe(false);
  });

  test('seated player count helper enforces supported player range', () => {
    expect(isValidSeatedPlayerCount(1)).toBe(false);
    expect(isValidSeatedPlayerCount(2)).toBe(true);
    expect(isValidSeatedPlayerCount(5)).toBe(true);
    expect(isValidSeatedPlayerCount(6)).toBe(false);
  });

  test('applyNetworkAction rejects actions from non-current players', () => {
    const game = new HanabiGame({
      playerIds: ['p1', 'p2'],
      playerNames: ['A', 'B'],
      shuffleSeed: 3
    });

    const wrongActor = game.state.players.find((player) => player.id !== game.state.players[game.state.currentTurnPlayerIndex]?.id)?.id;
    const cardId = game.state.players[0]?.cards[0];
    if (!wrongActor || !cardId) {
      throw new Error('Failed to build invalid action');
    }

    expect(() => applyNetworkAction(game, { type: 'play', actorId: wrongActor, cardId })).toThrow();
  });
});
