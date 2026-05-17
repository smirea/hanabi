import { storageKeys } from './constants';

export type {
	DirectoryResponse,
	GameAction,
	GameHistoryEntry,
	HistoryResponse,
	LobbySettings,
	OnlineRoomAction,
	OnlineRoomState,
	RoomDirectoryListing,
	RoomMember,
	RoomMemberView,
	RoomPhase,
	RoomResponse,
	RoomViewState,
	UserRecord,
	UserResponse,
} from '../../../shared/onlineGame';

export type StorageKey = (typeof storageKeys)[keyof typeof storageKeys];
export type SetStateAction<T> = T | ((prev: T) => T);

export interface StorageValueByKey {
	debug_mode: boolean;
	player_name: string;
	server_user_id: number | null;
	server_client_key: string;
	current_room: string | null;
	dark_mode: boolean;
	negative_color_hints: boolean;
	negative_number_hints: boolean;
	turn_sound_enabled: boolean;
	tibi_mode: boolean;
	tv_mode: boolean;
}

export interface DebugScreenEventDetail {
	screen: DebugScreenName;
	state: import('../../../shared/game').HanabiState;
}

export type DebugScreenName = 'win' | 'lose' | 'game';
