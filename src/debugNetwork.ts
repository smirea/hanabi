import { useCallback, useEffect, useMemo, useState } from 'react';
import { HanabiGame } from './game';
import {
  DEFAULT_ROOM_ID,
  type LobbySettings,
  type NetworkAction,
  type OnlineSession,
  type OnlineState,
  type RoomMember
} from './network';
import { electHostId } from './hostElection';

const DEBUG_NETWORK_ROOM_STORAGE_KEY = 'hanabi.debug_network.room.v1';
const DEBUG_PLAYER_HASH_PREFIX = '#debug-';

type DebugNetworkRoomState = {
  version: number;
  phase: 'lobby' | 'playing';
  settings: LobbySettings;
  players: string[];
  gameState: ReturnType<HanabiGame['getSnapshot']> | null;
};

const DEFAULT_SETTINGS: LobbySettings = {
  includeMulticolor: false,
  multicolorShortDeck: false,
  endlessMode: false
};

function normalizeSettings(input: Partial<LobbySettings> | undefined): LobbySettings {
  const includeMulticolor = Boolean(input?.includeMulticolor);
  const multicolorShortDeck = includeMulticolor && Boolean(input?.multicolorShortDeck);
  const endlessMode = Boolean(input?.endlessMode);

  return {
    includeMulticolor,
    multicolorShortDeck,
    endlessMode
  };
}

function normalizePlayerIds(input: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawPlayerId of input) {
    if (typeof rawPlayerId !== 'string') {
      continue;
    }

    const playerId = rawPlayerId.trim();
    if (playerId.length === 0 || seen.has(playerId)) {
      continue;
    }

    seen.add(playerId);
    normalized.push(playerId);
  }

  if (normalized.length === 0) {
    normalized.push('1');
  }

  return normalized;
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function createRoomState(players: string[]): DebugNetworkRoomState {
  return {
    version: 1,
    phase: 'lobby',
    settings: DEFAULT_SETTINGS,
    players: normalizePlayerIds(players),
    gameState: null
  };
}

function parseRoomState(raw: string): DebugNetworkRoomState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Partial<DebugNetworkRoomState>;
  if (!Number.isInteger(candidate.version) || Number(candidate.version) < 1) {
    return null;
  }

  if (candidate.phase !== 'lobby' && candidate.phase !== 'playing') {
    return null;
  }

  if (!candidate.settings || typeof candidate.settings !== 'object') {
    return null;
  }

  if (!Array.isArray(candidate.players)) {
    return null;
  }

  const players = normalizePlayerIds(candidate.players);
  const settings = normalizeSettings(candidate.settings);
  const gameState = candidate.gameState ?? null;
  if (gameState !== null && typeof gameState !== 'object') {
    return null;
  }

  return {
    version: Number(candidate.version),
    phase: candidate.phase,
    settings,
    players,
    gameState
  };
}

function readRoomState(): DebugNetworkRoomState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(DEBUG_NETWORK_ROOM_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  return parseRoomState(raw);
}

function writeRoomState(state: DebugNetworkRoomState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DEBUG_NETWORK_ROOM_STORAGE_KEY, JSON.stringify(state));
}

function getRoomStateOrCreate(players: string[]): DebugNetworkRoomState {
  const existing = readRoomState();
  if (existing) {
    return existing;
  }

  const created = createRoomState(players);
  writeRoomState(created);
  return created;
}

function getHostId(players: string[]): string | null {
  return electHostId(players);
}

function buildMembers(players: string[]): RoomMember[] {
  return players.map((peerId, index) => ({
    peerId,
    name: `Player ${index + 1}`
  }));
}

function createIdleState(playerId: string | null): OnlineState {
  return {
    status: playerId ? 'connecting' : 'idle',
    roomId: DEFAULT_ROOM_ID,
    selfId: playerId,
    hostId: null,
    isHost: false,
    snapshotVersion: 0,
    phase: 'lobby',
    members: [],
    settings: DEFAULT_SETTINGS,
    gameState: null,
    error: null
  };
}

function toOnlineState(playerId: string, roomState: DebugNetworkRoomState): OnlineState {
  const members = buildMembers(roomState.players);
  const hostId = getHostId(roomState.players);
  return {
    status: 'connected',
    roomId: DEFAULT_ROOM_ID,
    selfId: playerId,
    hostId,
    isHost: hostId === playerId,
    snapshotVersion: roomState.version,
    phase: roomState.phase,
    members,
    settings: roomState.settings,
    gameState: roomState.gameState,
    error: null
  };
}

function ensurePlayerInRoom(playerId: string): DebugNetworkRoomState {
  const room = getRoomStateOrCreate([playerId]);
  if (room.players.includes(playerId)) {
    return room;
  }

  const nextPlayers = [...room.players, playerId];
  const nextState: DebugNetworkRoomState = {
    ...room,
    version: room.version + 1,
    phase: 'lobby',
    players: nextPlayers,
    gameState: null
  };
  writeRoomState(nextState);
  return nextState;
}

function applyNetworkAction(game: HanabiGame, action: NetworkAction): void {
  const currentPlayer = game.state.players[game.state.currentTurnPlayerIndex];
  if (!currentPlayer) {
    throw new Error('Current turn player is missing');
  }

  if (currentPlayer.id !== action.actorId) {
    throw new Error('Action actor is not the current turn player');
  }

  if (action.type === 'play') {
    game.playCard(action.cardId);
    return;
  }

  if (action.type === 'discard') {
    game.discardCard(action.cardId);
    return;
  }

  if (action.type === 'hint-color') {
    game.giveColorHint(action.targetPlayerId, action.suit);
    return;
  }

  game.giveNumberHint(action.targetPlayerId, action.number);
}

function commitRoomState(
  playerId: string,
  mutate: (draft: DebugNetworkRoomState, hostId: string | null) => boolean
): DebugNetworkRoomState {
  const currentState = ensurePlayerInRoom(playerId);
  const hostId = getHostId(currentState.players);
  const draft = structuredClone(currentState);
  const changed = mutate(draft, hostId);
  if (!changed) {
    return currentState;
  }

  draft.players = normalizePlayerIds(draft.players);
  draft.settings = normalizeSettings(draft.settings);

  if (draft.players.length < 2) {
    draft.phase = 'lobby';
    draft.gameState = null;
  }

  if (draft.phase === 'lobby') {
    draft.gameState = null;
  }

  if (draft.phase === 'playing' && draft.gameState === null) {
    draft.phase = 'lobby';
  }

  draft.version = currentState.version + 1;
  writeRoomState(draft);
  return draft;
}

export function getDebugNetworkPlayerIdFromHash(hash: string): string | null {
  if (!hash.startsWith(DEBUG_PLAYER_HASH_PREFIX)) {
    return null;
  }

  const playerId = hash.slice(DEBUG_PLAYER_HASH_PREFIX.length).trim();
  if (playerId.length === 0) {
    return null;
  }

  return playerId;
}

export function toDebugNetworkPlayerHash(playerId: string): string {
  const normalized = playerId.trim();
  if (normalized.length === 0) {
    throw new Error('Debug network player id must be non-empty');
  }

  return `${DEBUG_PLAYER_HASH_PREFIX}${normalized}`;
}

export function getDebugNetworkPlayersFromRoom(): string[] {
  const room = readRoomState();
  if (!room) {
    return ['1', '2'];
  }

  return room.players;
}

export function syncDebugNetworkRoomPlayers(playerIds: string[]): void {
  const normalizedPlayers = normalizePlayerIds(playerIds);
  const currentState = getRoomStateOrCreate(normalizedPlayers);
  if (arraysEqual(currentState.players, normalizedPlayers) && currentState.phase === 'lobby' && currentState.gameState === null) {
    return;
  }

  const nextState: DebugNetworkRoomState = {
    ...currentState,
    version: currentState.version + 1,
    phase: 'lobby',
    players: normalizedPlayers,
    gameState: null
  };
  writeRoomState(nextState);
}

export function useDebugNetworkSession(playerId: string | null): OnlineSession {
  const [state, setState] = useState<OnlineState>(() => createIdleState(playerId));

  const refreshFromStorage = useCallback(() => {
    if (!playerId) {
      setState(createIdleState(null));
      return;
    }

    const roomState = ensurePlayerInRoom(playerId);
    setState(toOnlineState(playerId, roomState));
  }, [playerId]);

  useEffect(() => {
    if (!playerId) {
      setState(createIdleState(null));
      return;
    }

    refreshFromStorage();

    const onStorage = (event: StorageEvent): void => {
      if (event.key !== DEBUG_NETWORK_ROOM_STORAGE_KEY) {
        return;
      }

      refreshFromStorage();
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [playerId, refreshFromStorage]);

  const startGame = useCallback(() => {
    if (!playerId) {
      return;
    }

    const nextState = commitRoomState(playerId, (draft, hostId) => {
      if (hostId !== playerId) {
        return false;
      }

      if (draft.players.length < 2 || draft.players.length > 5) {
        return false;
      }

      const memberNames = buildMembers(draft.players).map((member) => member.name);
      const game = new HanabiGame({
        playerIds: draft.players,
        playerNames: memberNames,
        includeMulticolor: draft.settings.includeMulticolor,
        multicolorShortDeck: draft.settings.multicolorShortDeck,
        endlessMode: draft.settings.endlessMode
      });

      draft.phase = 'playing';
      draft.gameState = game.getSnapshot();
      return true;
    });

    setState(toOnlineState(playerId, nextState));
  }, [playerId]);

  const updateSettings = useCallback((next: Partial<LobbySettings>) => {
    if (!playerId) {
      return;
    }

    const nextState = commitRoomState(playerId, (draft, hostId) => {
      if (hostId !== playerId || draft.phase !== 'lobby') {
        return false;
      }

      const previous = normalizeSettings(draft.settings);
      const resolved = normalizeSettings({
        ...draft.settings,
        ...next
      });

      if (
        previous.includeMulticolor === resolved.includeMulticolor
        && previous.multicolorShortDeck === resolved.multicolorShortDeck
        && previous.endlessMode === resolved.endlessMode
      ) {
        return false;
      }

      draft.settings = resolved;
      return true;
    });

    setState(toOnlineState(playerId, nextState));
  }, [playerId]);

  const sendAction = useCallback((action: NetworkAction) => {
    if (!playerId) {
      return;
    }

    const nextState = commitRoomState(playerId, (draft) => {
      if (action.actorId !== playerId) {
        return false;
      }

      if (draft.phase !== 'playing' || draft.gameState === null) {
        return false;
      }

      const game = HanabiGame.fromState(draft.gameState);
      try {
        applyNetworkAction(game, action);
      } catch {
        return false;
      }

      draft.gameState = game.getSnapshot();
      return true;
    });

    setState(toOnlineState(playerId, nextState));
  }, [playerId]);

  const requestSync = useCallback(() => {
    refreshFromStorage();
  }, [refreshFromStorage]);

  return useMemo(
    () => ({
      state,
      startGame,
      updateSettings,
      sendAction,
      requestSync
    }),
    [requestSync, sendAction, startGame, state, updateSettings]
  );
}
