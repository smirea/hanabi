import createLocalStorage from './createLocalStorage';
import type { NetworkPlayer } from './networking';

export const DEBUG_ID = new URLSearchParams(location.search).get('debug_id') || null;

export const { LS, useLocalStorage } = createLocalStorage({
	namespace: 'hanabi' + (DEBUG_ID ? '-debug_id=' + DEBUG_ID : ''),
	getDefaults: () => ({
		player: null as null | NetworkPlayer,
	}),
});
