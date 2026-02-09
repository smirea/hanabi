export const storageKeys = {
  debugNetworkShell: 'debug_network_shell',
  debugNetworkPlayers: 'debug_network_players',
  debugNetworkActivePlayer: 'debug_network_active_player',
  debugMode: 'debug_mode',
  playerName: 'player_name',
  tvMode: 'tv_mode',
  darkMode: 'dark_mode',
  negativeColorHints: 'negative_color_hints',
  negativeNumberHints: 'negative_number_hints'
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
};

const STORAGE_PREFIX = 'hanabi.';

export function createDebugNamespace(debugId: string): string {
  const trimmed = debugId.trim();
  if (trimmed.length === 0) {
    throw new Error('Debug namespace requires a non-empty id');
  }

  return `dbg-${encodeURIComponent(trimmed)}`;
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
  negative_number_hints: (value) => (typeof value === 'boolean' ? value : null)
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
