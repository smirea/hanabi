export const storageKeys = {
  debugNetworkShell: 'debug_network_shell',
  debugNetworkPlayers: 'debug_network_players',
  debugNetworkActivePlayer: 'debug_network_active_player',
  debugMode: 'debug_mode',
  playerName: 'player_name',
  tvMode: 'tv_mode',
  darkMode: 'dark_mode',
  negativeColorHints: 'negative_color_hints',
  negativeNumberHints: 'negative_number_hints',
  turnSoundEnabled: 'turn_sound_enabled'
} as const;

export type StorageKey = typeof storageKeys[keyof typeof storageKeys];

export type StorageValueByKey = {
  debug_network_shell: boolean;
  debug_network_players: string[];
  debug_network_active_player: string;
  debug_mode: boolean;
  player_name: string;
  tv_mode: boolean;
  dark_mode: boolean;
  negative_color_hints: boolean;
  negative_number_hints: boolean;
  turn_sound_enabled: boolean;
};

const STORAGE_PREFIX = 'hanabi.';
const SESSION_HASH_PREFIX = '#session_';

export function createDebugNamespace(debugId: string): string {
  const trimmed = debugId.trim();
  if (trimmed.length === 0) {
    throw new Error('Debug namespace requires a non-empty id');
  }

  return `dbg-${encodeURIComponent(trimmed)}`;
}

export function getSessionIdFromHash(hash: string): string | null {
  if (typeof hash !== 'string') {
    return null;
  }

  if (!hash.startsWith(SESSION_HASH_PREFIX)) {
    return null;
  }

  const value = hash.slice(1).trim();
  if (value.length <= SESSION_HASH_PREFIX.length - 1) {
    return null;
  }

  return value.slice(0, 64);
}

export function createSessionNamespace(sessionId: string): string {
  const trimmed = sessionId.trim();
  if (trimmed.length === 0) {
    throw new Error('Session namespace requires a non-empty id');
  }

  return `sess-${encodeURIComponent(trimmed)}`;
}

export function resolveStorageKey(key: StorageKey, namespace?: string | null): string {
  const base = `${STORAGE_PREFIX}${key}`;
  if (!namespace) {
    return base;
  }

  return `${base}.${namespace}`;
}

const storageParsers: { [K in StorageKey]: (value: unknown) => StorageValueByKey[K] | null } = {
  debug_network_shell: (value) => (typeof value === 'boolean' ? value : null),
  debug_network_players: (value) => (Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null),
  debug_network_active_player: (value) => (typeof value === 'string' ? value : null),
  debug_mode: (value) => (typeof value === 'boolean' ? value : null),
  player_name: (value) => (typeof value === 'string' ? value : null),
  tv_mode: (value) => (typeof value === 'boolean' ? value : null),
  dark_mode: (value) => (typeof value === 'boolean' ? value : null),
  negative_color_hints: (value) => (typeof value === 'boolean' ? value : null),
  negative_number_hints: (value) => (typeof value === 'boolean' ? value : null),
  turn_sound_enabled: (value) => (typeof value === 'boolean' ? value : null)
};

export function parseStoredValue<K extends StorageKey>(key: K, raw: string): StorageValueByKey[K] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return storageParsers[key](parsed);
}
