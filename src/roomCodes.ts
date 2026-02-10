const ROOM_CODE_LENGTH = 4;
const ROOM_CODE_PATTERN = /^[A-Z]{4}$/;
const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function normalizeRoomCode(raw: string): string {
  if (typeof raw !== 'string') {
    return '';
  }

  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
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
    code += ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length];
  }

  return code;
}
