import { describe, expect, test } from 'bun:test';
import { HanabiGame } from './game';
import {
	assignMemberPlayerIds,
	assignMembers,
	isRoomSnapshot,
	resolveMemberPlayerId,
	shouldAcceptSnapshot,
	shouldBootstrapWithoutSnapshot,
} from './networkLogic';
import type { LobbySettings, RoomSnapshot } from './network';

const DEFAULT_SETTINGS: LobbySettings = {
	includeMulticolor: false,
	multicolorShortDeck: false,
	multicolorWildHints: false,
	endlessMode: false,
};

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
	return {
		version: 1,
		hostId: 'b',
		phase: 'lobby',
		members: [
			{ peerId: 'b', name: 'B', isTv: false },
			{ peerId: 'c', name: 'C', isTv: false },
		],
		settings: DEFAULT_SETTINGS,
		gameState: null,
		...overrides,
	};
}

describe('assignMembers', () => {
	test('preserves previous ordering for existing peers and appends new peers sorted by id', () => {
		const connected = new Set(['a', 'b', 'c']);
		const previous = [
			{ peerId: 'b', name: 'Bee', isTv: false },
			{ peerId: 'a', name: 'Ay', isTv: false },
		];
		const names = new Map<string, string>([
			['a', 'Ay'],
			['b', 'Bee'],
			['c', 'See'],
		]);
		const tv = new Map<string, boolean>();

		expect(assignMembers(connected, previous, names, tv)).toEqual([
			{ peerId: 'b', name: 'Bee', isTv: false },
			{ peerId: 'a', name: 'Ay', isTv: false },
			{ peerId: 'c', name: 'See', isTv: false },
		]);
	});

	test('drops disconnected peers and preserves known names', () => {
		const connected = new Set(['b']);
		const previous = [
			{ peerId: 'a', name: 'A', isTv: false },
			{ peerId: 'b', name: 'B', isTv: false },
		];
		const names = new Map<string, string>([['b', 'Bravo']]);
		const tv = new Map<string, boolean>();

		expect(assignMembers(connected, previous, names, tv)).toEqual([{ peerId: 'b', name: 'Bravo', isTv: false }]);
	});

	test('ensures member names are unique by suffixing duplicates', () => {
		const connected = new Set(['a', 'b']);
		const previous = [
			{ peerId: 'a', name: 'Alex', isTv: false },
			{ peerId: 'b', name: 'Alex', isTv: false },
		];
		const names = new Map<string, string>([
			['a', 'Alex'],
			['b', 'Alex'],
		]);
		const tv = new Map<string, boolean>();

		expect(assignMembers(connected, previous, names, tv)).toEqual([
			{ peerId: 'a', name: 'Alex', isTv: false },
			{ peerId: 'b', name: 'Alex 2', isTv: false },
		]);
	});
});

describe('assignMemberPlayerIds', () => {
	test('keeps prior seat ownership for still-connected peers and reclaims by matching name', () => {
		const game = new HanabiGame({
			playerIds: ['seat-a', 'seat-b'],
			playerNames: ['Alex', 'Blair'],
			shuffleSeed: 2,
		});

		const previous = [
			{ peerId: 'old-a', name: 'Alex', isTv: false, playerId: 'seat-a' },
			{ peerId: 'peer-b', name: 'Blair', isTv: false, playerId: 'seat-b' },
		];
		const connected = [
			{ peerId: 'peer-b', name: 'Blair', isTv: false },
			{ peerId: 'new-a', name: 'Alex', isTv: false },
		];

		expect(assignMemberPlayerIds(connected, previous, game.getSnapshot())).toEqual([
			{ peerId: 'peer-b', name: 'Blair', isTv: false, playerId: 'seat-b' },
			{ peerId: 'new-a', name: 'Alex', isTv: false, playerId: 'seat-a' },
		]);
	});

	test('reclaims seat from disconnected membership history when active-game member names diverge from game names', () => {
		const game = new HanabiGame({
			playerIds: ['seat-a', 'seat-b'],
			playerNames: ['Alex', 'Blair'],
			shuffleSeed: 2,
		});

		const previous = [
			{ peerId: 'old-a', name: 'Ace', isTv: false, playerId: 'seat-a' },
			{ peerId: 'peer-b', name: 'Blair', isTv: false, playerId: 'seat-b' },
		];
		const connected = [
			{ peerId: 'peer-b', name: 'Blair', isTv: false },
			{ peerId: 'new-a', name: 'Ace', isTv: false },
		];

		expect(assignMemberPlayerIds(connected, previous, game.getSnapshot())).toEqual([
			{ peerId: 'peer-b', name: 'Blair', isTv: false, playerId: 'seat-b' },
			{ peerId: 'new-a', name: 'Ace', isTv: false, playerId: 'seat-a' },
		]);
	});

	test('clears seat assignments when no game state is active', () => {
		const connected = [{ peerId: 'peer-a', name: 'Alex', isTv: false }];
		const previous = [{ peerId: 'peer-a', name: 'Alex', isTv: false, playerId: 'seat-a' }];

		expect(assignMemberPlayerIds(connected, previous, null)).toEqual([
			{ peerId: 'peer-a', name: 'Alex', isTv: false, playerId: null },
		]);
	});
});

describe('shouldBootstrapWithoutSnapshot', () => {
	test('elects only the lowest connected peer to bootstrap', () => {
		expect(shouldBootstrapWithoutSnapshot('self', new Set(['self']))).toBeTrue();
		expect(shouldBootstrapWithoutSnapshot('a', new Set(['a', 'b']))).toBeTrue();
		expect(shouldBootstrapWithoutSnapshot('b', new Set(['a', 'b']))).toBeFalse();
		expect(shouldBootstrapWithoutSnapshot('self', new Set(['peer']))).toBeFalse();
	});
});

describe('resolveMemberPlayerId', () => {
	const game = new HanabiGame({
		playerIds: ['seat-a', 'seat-b'],
		playerNames: ['Alex', 'Blair'],
		shuffleSeed: 2,
	});

	test('uses explicit member seat mapping when available', () => {
		const members = [
			{ peerId: 'peer-a', name: 'Alex', isTv: false, playerId: 'seat-a' },
			{ peerId: 'peer-b', name: 'Blair', isTv: false, playerId: 'seat-b' },
		];

		expect(resolveMemberPlayerId(members, game.getSnapshot(), 'peer-a')).toBe('seat-a');
	});

	test('falls back to direct peer id when player ids match peer ids', () => {
		const directIdGame = new HanabiGame({
			playerIds: ['peer-a', 'peer-b'],
			playerNames: ['Alex', 'Blair'],
			shuffleSeed: 2,
		});
		const members = [
			{ peerId: 'peer-a', name: 'Alex', isTv: false },
			{ peerId: 'peer-b', name: 'Blair', isTv: false },
		];

		expect(resolveMemberPlayerId(members, directIdGame.getSnapshot(), 'peer-a')).toBe('peer-a');
	});

	test('falls back to unique name match for rejoined peers', () => {
		const members = [
			{ peerId: 'peer-new', name: 'Alex', isTv: false },
			{ peerId: 'peer-b', name: 'Blair', isTv: false, playerId: 'seat-b' },
		];

		expect(resolveMemberPlayerId(members, game.getSnapshot(), 'peer-new')).toBe('seat-a');
	});

	test('returns null for tv or unknown peers', () => {
		const members = [
			{ peerId: 'peer-tv', name: 'TV', isTv: true },
			{ peerId: 'peer-a', name: 'Alex', isTv: false, playerId: 'seat-a' },
		];

		expect(resolveMemberPlayerId(members, game.getSnapshot(), 'peer-tv')).toBeNull();
		expect(resolveMemberPlayerId(members, game.getSnapshot(), 'missing')).toBeNull();
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
				{ peerId: 'c', name: 'C', isTv: false },
			],
		});

		expect(shouldAcceptSnapshot(incoming, current, new Set(['b', 'c']))).toBeFalse();
	});

	test('keeps the current host authoritative while that host is still connected', () => {
		const current = snapshot({
			hostId: 'b',
			version: 10,
			members: [
				{ peerId: 'b', name: 'B', isTv: false },
				{ peerId: 'c', name: 'C', isTv: false },
			],
		});
		const incoming = snapshot({
			hostId: 'a',
			version: 99,
			members: [
				{ peerId: 'a', name: 'A', isTv: false },
				{ peerId: 'b', name: 'B', isTv: false },
				{ peerId: 'c', name: 'C', isTv: false },
			],
		});

		expect(shouldAcceptSnapshot(incoming, current, new Set(['a', 'b', 'c']))).toBeFalse();
	});

	test('accepts an elected host taking over when the prior host disconnects, even if the version resets', () => {
		const current = snapshot({
			hostId: 'b',
			version: 10,
			members: [
				{ peerId: 'a', name: 'A', isTv: false },
				{ peerId: 'b', name: 'B', isTv: false },
			],
		});
		const incoming = snapshot({
			hostId: 'a',
			version: 1,
			members: [
				{ peerId: 'a', name: 'A', isTv: false },
				{ peerId: 'b', name: 'B', isTv: false },
			],
		});

		expect(shouldAcceptSnapshot(incoming, current, new Set(['a']))).toBeTrue();
	});

	test('uses the member list as eligibility for election during host failover', () => {
		const current = snapshot({ hostId: 'c', version: 10 });
		const incoming = snapshot({
			hostId: 'b',
			version: 1,
			members: [
				{ peerId: 'b', name: 'B', isTv: false },
				{ peerId: 'c', name: 'C', isTv: false },
			],
		});

		expect(shouldAcceptSnapshot(incoming, current, new Set(['a', 'b']))).toBeTrue();
	});

	test('rejects lower-id newcomer snapshots that are not elected by the current membership', () => {
		const current = snapshot({
			hostId: 'b',
			version: 7,
			members: [
				{ peerId: 'b', name: 'B', isTv: false },
				{ peerId: 'c', name: 'C', isTv: false },
			],
		});
		const incoming = snapshot({
			hostId: 'a',
			version: 1,
			members: [{ peerId: 'a', name: 'A', isTv: false }],
		});

		expect(shouldAcceptSnapshot(incoming, current, new Set(['a', 'b', 'c']))).toBeFalse();
	});
});
