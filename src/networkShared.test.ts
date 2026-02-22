import { describe, expect, test } from 'bun:test';
import { HanabiGame } from './game';
import {
  applyNetworkAction,
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

    const used = new Set<string>();
    const first = resolveUniquePlayerName('Alex', used);
    used.add(normalizeUniquePlayerNameKey(first));
    const second = resolveUniquePlayerName('Alex', used);

    expect(first).toBe('Alex');
    expect(second).toBe('Alex 2');
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
