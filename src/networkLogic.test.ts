import { describe, expect, test } from 'bun:test';
import { assignMembers, isRoomSnapshot, shouldAcceptSnapshot } from './networkLogic';
import type { LobbySettings, RoomSnapshot } from './network';

const DEFAULT_SETTINGS: LobbySettings = {
  includeMulticolor: false,
  multicolorShortDeck: false,
  multicolorWildHints: false,
  endlessMode: false
};

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    version: 1,
    hostId: 'b',
    phase: 'lobby',
    members: [
      { peerId: 'b', name: 'B', isTv: false },
      { peerId: 'c', name: 'C', isTv: false }
    ],
    settings: DEFAULT_SETTINGS,
    gameState: null,
    ...overrides
  };
}

describe('assignMembers', () => {
  test('preserves previous ordering for existing peers and appends new peers sorted by id', () => {
    const connected = new Set(['a', 'b', 'c']);
    const previous = [
      { peerId: 'b', name: 'Bee', isTv: false },
      { peerId: 'a', name: 'Ay', isTv: false }
    ];
    const names = new Map<string, string>([
      ['a', 'Ay'],
      ['b', 'Bee'],
      ['c', 'See']
    ]);
    const tv = new Map<string, boolean>();

    expect(assignMembers(connected, previous, names, tv)).toEqual([
      { peerId: 'b', name: 'Bee', isTv: false },
      { peerId: 'a', name: 'Ay', isTv: false },
      { peerId: 'c', name: 'See', isTv: false }
    ]);
  });

  test('drops disconnected peers and preserves known names', () => {
    const connected = new Set(['b']);
    const previous = [
      { peerId: 'a', name: 'A', isTv: false },
      { peerId: 'b', name: 'B', isTv: false }
    ];
    const names = new Map<string, string>([['b', 'Bravo']]);
    const tv = new Map<string, boolean>();

    expect(assignMembers(connected, previous, names, tv)).toEqual([
      { peerId: 'b', name: 'Bravo', isTv: false }
    ]);
  });

  test('ensures member names are unique by suffixing duplicates', () => {
    const connected = new Set(['a', 'b']);
    const previous = [
      { peerId: 'a', name: 'Alex', isTv: false },
      { peerId: 'b', name: 'Alex', isTv: false }
    ];
    const names = new Map<string, string>([
      ['a', 'Alex'],
      ['b', 'Alex']
    ]);
    const tv = new Map<string, boolean>();

    expect(assignMembers(connected, previous, names, tv)).toEqual([
      { peerId: 'a', name: 'Alex', isTv: false },
      { peerId: 'b', name: 'Alex 2', isTv: false }
    ]);
  });
});

describe('isRoomSnapshot', () => {
  test('accepts a valid snapshot shape', () => {
    expect(isRoomSnapshot(snapshot())).toBeTrue();
  });

  test('rejects invalid versions and missing members', () => {
    expect(isRoomSnapshot(snapshot({ version: 0 }) as any)).toBeFalse();
    expect(isRoomSnapshot(snapshot({ members: [] }) as any)).toBeFalse();
  });

  test('rejects snapshots with invalid host ids and phases', () => {
    expect(isRoomSnapshot(snapshot({ hostId: '' }) as any)).toBeFalse();
    expect(isRoomSnapshot(snapshot({ phase: 'nope' as any }) as any)).toBeFalse();
  });
});

describe('shouldAcceptSnapshot', () => {
  test('accepts when there is no current snapshot', () => {
    expect(shouldAcceptSnapshot(snapshot(), null, new Set(['b']))).toBeTrue();
  });

  test('accepts same-host snapshots only when the version is not older', () => {
    const current = snapshot({ hostId: 'b', version: 5 });
    expect(shouldAcceptSnapshot(snapshot({ hostId: 'b', version: 4 }), current, new Set(['b']))).toBeFalse();
    expect(shouldAcceptSnapshot(snapshot({ hostId: 'b', version: 5 }), current, new Set(['b']))).toBeTrue();
    expect(shouldAcceptSnapshot(snapshot({ hostId: 'b', version: 6 }), current, new Set(['b']))).toBeTrue();
  });

  test('rejects snapshots from a non-elected host', () => {
    const current = snapshot({ hostId: 'b', version: 5 });
    const incoming = snapshot({
      hostId: 'c',
      version: 10,
      members: [
        { peerId: 'b', name: 'B', isTv: false },
        { peerId: 'c', name: 'C', isTv: false }
      ]
    });

    expect(shouldAcceptSnapshot(incoming, current, new Set(['b', 'c']))).toBeFalse();
  });

  test('accepts an elected host taking over even if the version resets, using peer id as a tie-break', () => {
    const current = snapshot({
      hostId: 'b',
      version: 10,
      members: [
        { peerId: 'a', name: 'A', isTv: false },
        { peerId: 'b', name: 'B', isTv: false }
      ]
    });
    const incoming = snapshot({
      hostId: 'a',
      version: 1,
      members: [
        { peerId: 'a', name: 'A', isTv: false },
        { peerId: 'b', name: 'B', isTv: false }
      ]
    });

    expect(shouldAcceptSnapshot(incoming, current, new Set(['a', 'b']))).toBeTrue();
  });

  test('uses the member list as eligibility for election to avoid host flips before membership updates', () => {
    const current = snapshot({ hostId: 'c', version: 10 });
    const incoming = snapshot({
      hostId: 'b',
      version: 1,
      members: [
        { peerId: 'b', name: 'B', isTv: false },
        { peerId: 'c', name: 'C', isTv: false }
      ]
    });

    expect(shouldAcceptSnapshot(incoming, current, new Set(['a', 'b', 'c']))).toBeTrue();
  });

  test('rejects lower-id newcomer snapshots that are not elected by the current membership', () => {
    const current = snapshot({
      hostId: 'b',
      version: 7,
      members: [
        { peerId: 'b', name: 'B', isTv: false },
        { peerId: 'c', name: 'C', isTv: false }
      ]
    });
    const incoming = snapshot({
      hostId: 'a',
      version: 1,
      members: [{ peerId: 'a', name: 'A', isTv: false }]
    });

    expect(shouldAcceptSnapshot(incoming, current, new Set(['a', 'b', 'c']))).toBeFalse();
  });
});
