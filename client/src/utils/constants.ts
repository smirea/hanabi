import type { Suit } from '../game';
export {
	DEFAULT_LOBBY_SETTINGS,
	MAX_PLAYER_NAME_LENGTH,
	MAX_SEATED_PLAYER_COUNT,
	MIN_SEATED_PLAYER_COUNT,
	ROOM_CODE_LENGTH,
} from '../../../shared/onlineGame';

export const DEBUG_SCREEN_EVENT = 'hanabi:debug-screen';
export const NETWORK_APP_ID = 'hanabi-mobile-web';

export const storageKeys = {
	debugMode: 'debug_mode',
	playerName: 'player_name',
	serverUserId: 'server_user_id',
	serverClientKey: 'server_client_key',
	currentRoom: 'current_room',
	darkMode: 'dark_mode',
	negativeColorHints: 'negative_color_hints',
	negativeNumberHints: 'negative_number_hints',
	turnSoundEnabled: 'turn_sound_enabled',
	tibiMode: 'tibi_mode',
	tvMode: 'tv_mode',
} as const;

export const suitColors: Record<Suit, string> = {
	R: '#e64d5f',
	Y: '#f4c21b',
	G: '#2dc96d',
	B: '#4f8eff',
	W: '#ff7e2e',
	M: '#8b5cf6',
	K: '#1f232d',
};

export const suitBadgeForeground: Record<Suit, string> = {
	R: '#fff',
	Y: '#101114',
	G: '#101114',
	B: '#fff',
	W: '#101114',
	M: '#fff',
	K: '#fff',
};

export const suitNames: Record<Suit, string> = {
	R: 'red',
	Y: 'yellow',
	G: 'green',
	B: 'blue',
	W: 'orange',
	M: 'multicolor',
	K: 'black',
};
