import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HanabiGame, type CardNumber, type HanabiState, type Suit } from './game';

const NETWORK_APP_ID = 'hanabi-mobile-web';
const DEFAULT_ROOM_ID = 'default-room';
const SNAPSHOT_NAMESPACE = 'snapshot';
const REQUEST_SNAPSHOT_NAMESPACE = 'request-snapshot';
const HELLO_NAMESPACE = 'hello';
const PLAYER_ACTION_NAMESPACE = 'player-action';
const SNAPSHOT_HEARTBEAT_MS = 4_000;
const SNAPSHOT_SYNC_MS = 2_000;

if (NETWORK_APP_ID.trim().length === 0) {
  throw new Error('NETWORK_APP_ID must not be empty');
}

if (DEFAULT_ROOM_ID.trim().length === 0) {
  throw new Error('DEFAULT_ROOM_ID must not be empty');
}

export type LobbySettings = {
  includeMulticolor: boolean;
  multicolorShortDeck: boolean;
  endlessMode: boolean;
};

export type RoomMember = {
  peerId: string;
  name: string;
  sequence: number;
};

export type RoomPhase = 'lobby' | 'playing';

export type RoomSnapshot = {
  version: number;
  hostId: string;
  phase: RoomPhase;
  members: RoomMember[];
  settings: LobbySettings;
  gameState: HanabiState | null;
};

type TrysteroModule = typeof import('trystero');
type TrysteroRoom = import('trystero').Room;

type HelloMessage = {
  name: string;
};

type SnapshotMessage = {
  snapshot: RoomSnapshot;
};

type SnapshotRequestMessage = {
  knownVersion: number;
};

export type NetworkAction =
  | { type: 'play'; actorId: string; cardId: string }
  | { type: 'discard'; actorId: string; cardId: string }
  | { type: 'hint-color'; actorId: string; targetPlayerId: string; suit: Suit }
  | { type: 'hint-number'; actorId: string; targetPlayerId: string; number: CardNumber };

type PlayerActionMessage = {
  action: NetworkAction;
};

export type OnlineState = {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  roomId: string;
  selfId: string | null;
  hostId: string | null;
  isHost: boolean;
  snapshotVersion: number;
  phase: RoomPhase;
  members: RoomMember[];
  settings: LobbySettings;
  gameState: HanabiState | null;
  error: string | null;
};

const DEFAULT_SETTINGS: LobbySettings = {
  includeMulticolor: false,
  multicolorShortDeck: false,
  endlessMode: false
};

const INITIAL_STATE: OnlineState = {
  status: 'idle',
  roomId: DEFAULT_ROOM_ID,
  selfId: null,
  hostId: null,
  isHost: false,
  snapshotVersion: 0,
  phase: 'lobby',
  members: [],
  settings: DEFAULT_SETTINGS,
  gameState: null,
  error: null
};

function createInitialSnapshot(selfId: string, selfName: string): RoomSnapshot {
  return {
    version: 1,
    hostId: selfId,
    phase: 'lobby',
    members: [{ peerId: selfId, name: selfName, sequence: 1 }],
    settings: DEFAULT_SETTINGS,
    gameState: null
  };
}

function cloneSnapshot(snapshot: RoomSnapshot): RoomSnapshot {
  return structuredClone(snapshot);
}

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

function formatPeerName(peerId: string): string {
  const suffix = peerId.slice(-4).toUpperCase();
  return `Player ${suffix}`;
}

function comparePeerId(a: string, b: string): number {
  return a.localeCompare(b);
}

function getHostFromMembers(connectedPeerIds: Set<string>, members: RoomMember[]): string | null {
  const orderedMembers = members
    .filter((member) => connectedPeerIds.has(member.peerId))
    .sort((a, b) => (a.sequence - b.sequence) || comparePeerId(a.peerId, b.peerId));

  if (orderedMembers.length > 0) {
    return orderedMembers[0].peerId;
  }

  const fallback = [...connectedPeerIds].sort(comparePeerId)[0] ?? null;
  return fallback;
}

function getConnectedPeerIds(selfId: string, room: TrysteroRoom | null): Set<string> {
  const connected = new Set<string>([selfId]);
  if (!room) {
    return connected;
  }

  for (const peerId of Object.keys(room.getPeers())) {
    connected.add(peerId);
  }

  return connected;
}

function assignMembers(
  connectedPeerIds: Set<string>,
  previousMembers: RoomMember[],
  namesByPeerId: Map<string, string>
): RoomMember[] {
  const sequenceByPeerId = new Map(previousMembers.map((member) => [member.peerId, member.sequence]));
  let nextSequence = previousMembers.reduce((max, member) => Math.max(max, member.sequence), 0) + 1;

  for (const peerId of [...connectedPeerIds].sort(comparePeerId)) {
    if (!sequenceByPeerId.has(peerId)) {
      sequenceByPeerId.set(peerId, nextSequence);
      nextSequence += 1;
    }
  }

  const members = [...connectedPeerIds].map((peerId) => ({
    peerId,
    name: namesByPeerId.get(peerId) ?? formatPeerName(peerId),
    sequence: sequenceByPeerId.get(peerId) ?? nextSequence
  }));

  members.sort((a, b) => (a.sequence - b.sequence) || comparePeerId(a.peerId, b.peerId));
  return members;
}

function areMembersEqual(a: RoomMember[], b: RoomMember[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left.peerId !== right.peerId || left.name !== right.name || left.sequence !== right.sequence) {
      return false;
    }
  }

  return true;
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

function isRoomMember(value: unknown): value is RoomMember {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RoomMember>;
  return typeof candidate.peerId === 'string'
    && candidate.peerId.length > 0
    && typeof candidate.name === 'string'
    && candidate.name.trim().length > 0
    && Number.isInteger(candidate.sequence)
    && Number(candidate.sequence) > 0;
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RoomSnapshot>;
  if (!Number.isInteger(candidate.version) || Number(candidate.version) < 1) {
    return false;
  }

  if (typeof candidate.hostId !== 'string' || candidate.hostId.length === 0) {
    return false;
  }

  if (candidate.phase !== 'lobby' && candidate.phase !== 'playing') {
    return false;
  }

  if (!Array.isArray(candidate.members) || candidate.members.length === 0 || !candidate.members.every(isRoomMember)) {
    return false;
  }

  if (!candidate.settings || typeof candidate.settings !== 'object') {
    return false;
  }

  if (candidate.gameState !== null && typeof candidate.gameState !== 'object') {
    return false;
  }

  return true;
}

function shouldAcceptSnapshot(
  incoming: RoomSnapshot,
  current: RoomSnapshot | null,
  connectedPeerIds: Set<string>
): boolean {
  if (!current) {
    return true;
  }

  if (incoming.hostId === current.hostId) {
    return incoming.version >= current.version;
  }

  const electedHost = getHostFromMembers(connectedPeerIds, incoming.members);
  if (electedHost !== incoming.hostId) {
    return false;
  }

  if (incoming.version > current.version) {
    return true;
  }

  return comparePeerId(incoming.hostId, current.hostId) < 0;
}

function toOnlineState(
  roomId: string,
  selfId: string,
  snapshot: RoomSnapshot | null,
  status: OnlineState['status'],
  error: string | null
): OnlineState {
  if (!snapshot) {
    return {
      ...INITIAL_STATE,
      status,
      roomId,
      selfId,
      error
    };
  }

  return {
    status,
    roomId,
    selfId,
    hostId: snapshot.hostId,
    isHost: snapshot.hostId === selfId,
    snapshotVersion: snapshot.version,
    phase: snapshot.phase,
    members: snapshot.members,
    settings: snapshot.settings,
    gameState: snapshot.gameState,
    error
  };
}

export type OnlineSession = {
  state: OnlineState;
  startGame: () => void;
  updateSettings: (next: Partial<LobbySettings>) => void;
  sendAction: (action: NetworkAction) => void;
  requestSync: () => void;
};

export function useOnlineSession(enabled: boolean, roomId = DEFAULT_ROOM_ID): OnlineSession {
  const [state, setState] = useState<OnlineState>(() => ({
    ...INITIAL_STATE,
    roomId
  }));
  const controllerRef = useRef<{
    requestSync: () => void;
    sendAction: (action: NetworkAction) => void;
    updateSettings: (next: Partial<LobbySettings>) => void;
    startGame: () => void;
  } | null>(null);

  useEffect(() => {
    if (!enabled) {
      controllerRef.current = null;
      setState({
        ...INITIAL_STATE,
        roomId
      });
      return;
    }

    let active = true;
    let room: TrysteroRoom | null = null;
    let moduleApi: TrysteroModule | null = null;
    let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
    let syncIntervalId: ReturnType<typeof setInterval> | null = null;
    let selfId = '';
    const peerNames = new Map<string, string>();
    let isHost = false;
    let currentSnapshot: RoomSnapshot | null = null;
    let hostedSnapshot: RoomSnapshot | null = null;
    let sendHello: ((message: HelloMessage, target?: string | string[] | null) => Promise<void[]>) | null = null;
    let sendSnapshot: ((message: SnapshotMessage, target?: string | string[] | null) => Promise<void[]>) | null = null;
    let sendSnapshotRequest: ((message: SnapshotRequestMessage, target?: string | string[] | null) => Promise<void[]>) | null = null;
    let sendPlayerAction: ((message: PlayerActionMessage, target?: string | string[] | null) => Promise<void[]>) | null = null;

    const pushState = (nextStatus: OnlineState['status'], error: string | null = null): void => {
      if (!active) {
        return;
      }

      setState(toOnlineState(roomId, selfId, currentSnapshot, nextStatus, error));
    };

    const publishSnapshot = (target?: string): void => {
      if (!isHost || !hostedSnapshot || !sendSnapshot) {
        return;
      }

      const message: SnapshotMessage = { snapshot: cloneSnapshot(hostedSnapshot) };
      void sendSnapshot(message, target ?? null);
    };

    const updateHostedSnapshot = (mutate: (draft: RoomSnapshot) => void): void => {
      if (!isHost) {
        return;
      }

      const base = hostedSnapshot ?? currentSnapshot ?? createInitialSnapshot(selfId, peerNames.get(selfId) ?? formatPeerName(selfId));
      const draft = cloneSnapshot(base);
      mutate(draft);
      draft.hostId = selfId;
      draft.settings = normalizeSettings(draft.settings);
      draft.version = (base.version ?? 0) + 1;
      hostedSnapshot = draft;
      currentSnapshot = draft;
      publishSnapshot();
      pushState('connected');
    };

    const refreshHostedMembers = (): void => {
      if (!isHost || !room) {
        return;
      }

      const connected = getConnectedPeerIds(selfId, room);
      const baseline = hostedSnapshot ?? currentSnapshot ?? createInitialSnapshot(selfId, peerNames.get(selfId) ?? formatPeerName(selfId));
      const members = assignMembers(connected, baseline.members, peerNames);
      if (areMembersEqual(members, baseline.members)) {
        return;
      }

      updateHostedSnapshot((draft) => {
        draft.members = members;
      });
    };

    const becomeHost = (): void => {
      if (!room) {
        return;
      }

      isHost = true;
      const base = cloneSnapshot(currentSnapshot ?? createInitialSnapshot(selfId, peerNames.get(selfId) ?? formatPeerName(selfId)));
      const connected = getConnectedPeerIds(selfId, room);
      base.members = assignMembers(connected, base.members, peerNames);
      base.hostId = selfId;
      base.version += 1;
      base.settings = normalizeSettings(base.settings);
      hostedSnapshot = base;
      currentSnapshot = base;
      publishSnapshot();
      pushState('connected');
    };

    const stepDownHost = (): void => {
      if (!isHost) {
        return;
      }

      isHost = false;
      hostedSnapshot = null;
    };

    const requestSnapshotFromHost = (): void => {
      if (!room || !sendSnapshotRequest) {
        return;
      }

      const connected = getConnectedPeerIds(selfId, room);
      const electedHost = getHostFromMembers(connected, currentSnapshot?.members ?? []);
      if (!electedHost || electedHost === selfId) {
        return;
      }

      const request: SnapshotRequestMessage = {
        knownVersion: currentSnapshot?.version ?? 0
      };
      void sendSnapshotRequest(request, electedHost);
    };

    const reconcileRole = (): void => {
      if (!room) {
        return;
      }

      const connected = getConnectedPeerIds(selfId, room);
      const electedHost = getHostFromMembers(connected, currentSnapshot?.members ?? []);
      if (!electedHost) {
        return;
      }

      if (electedHost === selfId) {
        if (!isHost) {
          becomeHost();
          return;
        }

        refreshHostedMembers();
        return;
      }

      stepDownHost();
      pushState('connected');
      requestSnapshotFromHost();
    };

    const receiveSnapshot = (snapshot: RoomSnapshot): void => {
      if (!room) {
        return;
      }

      const connected = getConnectedPeerIds(selfId, room);
      if (!shouldAcceptSnapshot(snapshot, currentSnapshot, connected)) {
        return;
      }

      currentSnapshot = cloneSnapshot(snapshot);
      for (const member of currentSnapshot.members) {
        peerNames.set(member.peerId, member.name);
      }

      if (snapshot.hostId !== selfId) {
        stepDownHost();
      }

      pushState('connected');
      reconcileRole();
    };

    const initialize = async (): Promise<void> => {
      if (typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC is unavailable in this runtime');
      }

      moduleApi = await import('trystero');
      if (!active) {
        return;
      }

      selfId = moduleApi.selfId;
      const selfName = formatPeerName(selfId);
      peerNames.set(selfId, selfName);
      setState({
        ...INITIAL_STATE,
        status: 'connecting',
        roomId,
        selfId
      });

      room = moduleApi.joinRoom({ appId: NETWORK_APP_ID }, roomId);
      const [sendHelloAction, getHelloAction] = room.makeAction<HelloMessage>(HELLO_NAMESPACE);
      const [sendSnapshotAction, getSnapshotAction] = room.makeAction<SnapshotMessage>(SNAPSHOT_NAMESPACE);
      const [sendRequestSnapshotAction, getRequestSnapshotAction] = room.makeAction<SnapshotRequestMessage>(
        REQUEST_SNAPSHOT_NAMESPACE
      );
      const [sendPlayerActionImpl, getPlayerActionImpl] = room.makeAction<PlayerActionMessage>(PLAYER_ACTION_NAMESPACE);
      sendHello = sendHelloAction;
      sendSnapshot = sendSnapshotAction;
      sendSnapshotRequest = sendRequestSnapshotAction;
      sendPlayerAction = sendPlayerActionImpl;

      const announceSelf = (target?: string): void => {
        if (!sendHello) {
          return;
        }

        const name = peerNames.get(selfId) ?? selfName;
        void sendHello({ name }, target ?? null);
      };

      getHelloAction((message, peerId) => {
        if (typeof message?.name !== 'string' || message.name.trim().length === 0) {
          return;
        }

        peerNames.set(peerId, message.name.trim());
        if (isHost) {
          refreshHostedMembers();
        }
      });

      getSnapshotAction((message, peerId) => {
        if (!message || typeof message !== 'object') {
          return;
        }

        if (!isRoomSnapshot(message.snapshot)) {
          return;
        }

        if (peerId !== message.snapshot.hostId) {
          return;
        }

        receiveSnapshot(message.snapshot);
      });

      getRequestSnapshotAction((message, peerId) => {
        if (!isHost || !hostedSnapshot || !sendSnapshot) {
          return;
        }

        const knownVersion = Number(message?.knownVersion ?? 0);
        if (knownVersion >= hostedSnapshot.version) {
          return;
        }

        publishSnapshot(peerId);
      });

      getPlayerActionImpl((message, peerId) => {
        if (!isHost || !hostedSnapshot || hostedSnapshot.phase !== 'playing' || hostedSnapshot.gameState === null) {
          return;
        }

        if (!message || typeof message !== 'object' || !message.action || typeof message.action !== 'object') {
          return;
        }

        const action = message.action as NetworkAction;
        if (action.actorId !== peerId) {
          return;
        }

        const game = HanabiGame.fromState(hostedSnapshot.gameState);
        try {
          applyNetworkAction(game, action);
        } catch {
          return;
        }

        updateHostedSnapshot((draft) => {
          draft.phase = 'playing';
          draft.gameState = game.getSnapshot();
        });
      });

      room.onPeerJoin((peerId) => {
        announceSelf(peerId);
        reconcileRole();
      });

      room.onPeerLeave(() => {
        reconcileRole();
      });

      controllerRef.current = {
        requestSync: () => {
          requestSnapshotFromHost();
        },
        sendAction: (action) => {
          if (!sendPlayerAction || !room) {
            return;
          }

          const connected = getConnectedPeerIds(selfId, room);
          const electedHost = getHostFromMembers(connected, currentSnapshot?.members ?? []);
          if (!electedHost) {
            return;
          }

          if (electedHost === selfId) {
            if (!isHost || !hostedSnapshot || hostedSnapshot.phase !== 'playing' || !hostedSnapshot.gameState) {
              return;
            }

            const game = HanabiGame.fromState(hostedSnapshot.gameState);
            try {
              applyNetworkAction(game, action);
            } catch {
              return;
            }

            updateHostedSnapshot((draft) => {
              draft.phase = 'playing';
              draft.gameState = game.getSnapshot();
            });
            return;
          }

          void sendPlayerAction({ action }, electedHost);
        },
        updateSettings: (next) => {
          if (!isHost) {
            return;
          }

          updateHostedSnapshot((draft) => {
            draft.settings = normalizeSettings({
              ...draft.settings,
              ...next
            });
            if (draft.phase === 'playing') {
              draft.phase = 'lobby';
              draft.gameState = null;
            }
          });
        },
        startGame: () => {
          if (!isHost || !hostedSnapshot) {
            return;
          }

          const orderedMembers = [...hostedSnapshot.members].sort(
            (a, b) => (a.sequence - b.sequence) || comparePeerId(a.peerId, b.peerId)
          );

          if (orderedMembers.length < 2 || orderedMembers.length > 5) {
            return;
          }

          const game = new HanabiGame({
            playerIds: orderedMembers.map((member) => member.peerId),
            playerNames: orderedMembers.map((member) => member.name),
            includeMulticolor: hostedSnapshot.settings.includeMulticolor,
            multicolorShortDeck: hostedSnapshot.settings.multicolorShortDeck,
            endlessMode: hostedSnapshot.settings.endlessMode
          });

          updateHostedSnapshot((draft) => {
            draft.phase = 'playing';
            draft.gameState = game.getSnapshot();
          });
        }
      };

      announceSelf();
      reconcileRole();

      heartbeatIntervalId = setInterval(() => {
        if (!isHost) {
          return;
        }

        refreshHostedMembers();
        publishSnapshot();
      }, SNAPSHOT_HEARTBEAT_MS);

      syncIntervalId = setInterval(() => {
        if (isHost) {
          return;
        }

        requestSnapshotFromHost();
      }, SNAPSHOT_SYNC_MS);
    };

    initialize().catch((error: unknown) => {
      if (!active) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown networking error';
      setState((current) => ({
        ...current,
        status: 'error',
        error: message
      }));
    });

    return () => {
      active = false;
      controllerRef.current = null;
      if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
      }

      if (syncIntervalId) {
        clearInterval(syncIntervalId);
      }

      if (room) {
        void room.leave();
      }
    };
  }, [enabled, roomId]);

  const startGame = useCallback(() => {
    controllerRef.current?.startGame();
  }, []);

  const updateSettings = useCallback((next: Partial<LobbySettings>) => {
    controllerRef.current?.updateSettings(next);
  }, []);

  const sendAction = useCallback((action: NetworkAction) => {
    controllerRef.current?.sendAction(action);
  }, []);

  const requestSync = useCallback(() => {
    controllerRef.current?.requestSync();
  }, []);

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

export { DEFAULT_ROOM_ID };
