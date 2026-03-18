import type { Suit } from '../game';
import type { LobbySettings } from './types';

export const DEBUG_SCREEN_EVENT = 'hanabi:debug-screen';
export const NETWORK_APP_ID = 'hanabi-mobile-web';
export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYER_NAME_LENGTH = 24;
export const MIN_SEATED_PLAYER_COUNT = 2;
export const MAX_SEATED_PLAYER_COUNT = 5;

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
	includeMulticolor: false,
	multicolorShortDeck: false,
	multicolorWildHints: false,
	endlessMode: false,
};

export const storageKeys = {
	debugMode: 'debug_mode',
	playerName: 'player_name',
	darkMode: 'dark_mode',
	negativeColorHints: 'negative_color_hints',
	negativeNumberHints: 'negative_number_hints',
	turnSoundEnabled: 'turn_sound_enabled',
	tibiMode: 'tibi_mode',
} as const;

export const suitColors: Record<Suit, string> = {
	R: '#e64d5f',
	Y: '#f4c21b',
	G: '#2dc96d',
	B: '#4f8eff',
	W: '#ff7e2e',
	M: '#8b5cf6',
};

export const suitBadgeForeground: Record<Suit, string> = {
	R: '#fff',
	Y: '#101114',
	G: '#101114',
	B: '#fff',
	W: '#101114',
	M: '#fff',
};

export const suitNames: Record<Suit, string> = {
	R: 'red',
	Y: 'yellow',
	G: 'green',
	B: 'blue',
	W: 'orange',
	M: 'multicolor',
};
