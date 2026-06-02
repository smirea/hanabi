import { normalizeSettings, type LobbySettings } from './onlineGame';
import { parseRoomCode } from './roomCodes';
import { storageKeys } from './utils/constants';
import { LS } from './utils/utils';

export function getStoredLobbySettings(): LobbySettings | null {
	const stored = LS.get(storageKeys.lastLobbySettings);
	if (!stored || typeof stored !== 'object') return null;
	return normalizeSettings(stored);
}

export function setStoredLobbySettings(settings: Partial<LobbySettings>): void {
	LS.set({ [storageKeys.lastLobbySettings]: normalizeSettings(settings) });
}

export function areLobbySettingsSame(
	left: Partial<LobbySettings>,
	right: Partial<LobbySettings>,
): boolean {
	const normalizedLeft = normalizeSettings(left);
	const normalizedRight = normalizeSettings(right);

	return (
		normalizedLeft.includeMulticolor === normalizedRight.includeMulticolor &&
		normalizedLeft.includeBlack === normalizedRight.includeBlack &&
		normalizedLeft.includeFlamboyants === normalizedRight.includeFlamboyants &&
		normalizedLeft.multicolorShortDeck === normalizedRight.multicolorShortDeck &&
		normalizedLeft.multicolorWildHints === normalizedRight.multicolorWildHints &&
		normalizedLeft.endlessMode === normalizedRight.endlessMode
	);
}

export function markPendingCreatedRoomCode(roomCode: string): void {
	const code = parseRoomCode(roomCode);
	if (!code) return;
	LS.set({ [storageKeys.pendingCreatedRoom]: code });
}

export function getPendingCreatedRoomCode(): string | null {
	return parseRoomCode(LS.get(storageKeys.pendingCreatedRoom) ?? '');
}

export function clearPendingCreatedRoomCode(): void {
	LS.delete(storageKeys.pendingCreatedRoom);
}
