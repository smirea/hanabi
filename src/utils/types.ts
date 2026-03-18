import type { CardNumber, HanabiState, PlayerId as GamePlayerId, Suit } from '../game';
import { storageKeys } from './constants';

export type NetworkPeerId = string & { __brand: 'TrysteroPeerId' };
export type NetworkPlayerId = `player:${string}` & { __brand: 'PlayerId' };
export type NetworkRoomId = `room:${string}` & { __brand: 'RoomId' };

export interface NetworkPlayer {
	id: NetworkPlayerId;
	peerId: NetworkPeerId;
	name: string;
	room: NetworkRoomId | null;
}

export interface NetworkingRoomSnapshot<GameState> {
	v: number;
	host: NetworkPeerId | null;
	game: GameState;
}

export interface LobbySettings {
	includeMulticolor: boolean;
	multicolorShortDeck: boolean;
	multicolorWildHints: boolean;
	endlessMode: boolean;
}

export type RoomPhase = 'lobby' | 'playing';

export type GameAction =
	| { type: 'play'; actorId: GamePlayerId; cardId: string }
	| { type: 'discard'; actorId: GamePlayerId; cardId: string }
	| { type: 'hint-color'; actorId: GamePlayerId; targetPlayerId: GamePlayerId; suit: Suit }
	| { type: 'hint-number'; actorId: GamePlayerId; targetPlayerId: GamePlayerId; number: CardNumber };

export interface OnlineRoomState {
	phase: RoomPhase;
	settings: LobbySettings;
	gameState: HanabiState | null;
	spectatorIds: GamePlayerId[];
}

export type OnlineRoomAction =
	| { type: 'set-settings'; actorId: GamePlayerId; next: Partial<LobbySettings> }
	| { type: 'set-spectator'; actorId: GamePlayerId; spectator: boolean }
	| { type: 'start-game'; actorId: GamePlayerId }
	| { type: 'game-action'; actorId: GamePlayerId; action: GameAction };

export interface RoomPresencePlayer {
	id: GamePlayerId;
	peerId: string;
	name: string;
}

export interface RoomMemberView {
	id: GamePlayerId;
	peerId: string;
	name: string;
	isTv: boolean;
}

export interface RoomViewState {
	status: 'idle' | 'connecting' | 'connected';
	selfId: string | null;
	selfPlayerId: GamePlayerId | null;
	hostId: string | null;
	isHost: boolean;
	snapshotVersion: number;
	phase: RoomPhase;
	members: RoomMemberView[];
	settings: LobbySettings;
	gameState: HanabiState | null;
}

export interface RoomDirectoryListing {
	code: string;
	players: string[];
}

export interface DebugScreenEventDetail {
	screen: DebugScreenName;
	state: HanabiState;
}

export type StorageKey = (typeof storageKeys)[keyof typeof storageKeys];
export type SetStateAction<T> = T | ((prev: T) => T);

export interface StorageValueByKey {
	debug_mode: boolean;
	player_name: string;
	dark_mode: boolean;
	negative_color_hints: boolean;
	negative_number_hints: boolean;
	turn_sound_enabled: boolean;
	tibi_mode: boolean;
}

export type DebugScreenName = 'win' | 'lose' | 'game';
