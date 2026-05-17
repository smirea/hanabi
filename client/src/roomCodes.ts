import { ROOM_CODE_LENGTH } from './utils/constants';

export function parseRoomCode(raw: string): string | null {
	const candidate = raw.trim();
	if (!/^[A-Za-z]{4}$/.test(candidate)) {
		return null;
	}

	return candidate.toUpperCase();
}

export function createRoomCode(): string {
	const bytes = new Uint8Array(ROOM_CODE_LENGTH);

	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes);
	} else {
		for (let index = 0; index < bytes.length; index += 1) {
			bytes[index] = Math.floor(Math.random() * 256);
		}
	}

	let code = '';
	for (const value of bytes) {
		code += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[value % 26];
	}

	return code;
}
