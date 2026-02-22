import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HanabiGame, type CardNumber, type HanabiState, type Suit } from './game';
import { electHostId } from './hostElection';
import { getScopedNetworkAppId } from './networkConstants';
import { applyNetworkAction, normalizeSettings, sanitizePlayerName } from './networkShared';
import {
  assignMembers,
  areMembersEqual,
  formatPeerName,
  isRoomSnapshot,
  shouldAcceptSnapshot
} from './networkLogic';

const DEFAULT_ROOM_ID = 'default-room';
const SNAPSHOT_NAMESPACE = 'snapshot';
const REQUEST_SNAPSHOT_NAMESPACE = 'snap-req';
const HELLO_NAMESPACE = 'hello';
const PLAYER_ACTION_NAMESPACE = 'ply-act';
const SNAPSHOT_HEARTBEAT_MS = 4_000;
const SNAPSHOT_SYNC_MS = 2_000;
const INITIAL_SNAPSHOT_WAIT_MS = 1_500;

const TRYSTERO_ACTION_NAME_MAX_BYTES = 12;

if (DEFAULT_ROOM_ID.trim().length === 0) {
  throw new Error('DEFAULT_ROOM_ID must not be empty');
}

const actionTypeEncoder = new TextEncoder();
const actionTypeNames = [SNAPSHOT_NAMESPACE, REQUEST_SNAPSHOT_NAMESPACE, HELLO_NAMESPACE, PLAYER_ACTION_NAMESPACE];
for (const name of actionTypeNames) {
  const byteLength = actionTypeEncoder.encode(name).length;
  if (byteLength > TRYSTERO_ACTION_NAME_MAX_BYTES) {
    throw new Error(`Trystero action type "${name}" is ${byteLength} bytes; must be <= ${TRYSTERO_ACTION_NAME_MAX_BYTES}`);
  }
}

export type LobbySettings = {
  includeMulticolor: boolean;
  multicolorShortDeck: boolean;
  multicolorWildHints: boolean;
  endlessMode: boolean;
};

export type RoomMember = {
  peerId: string;
  name: string;
  isTv: boolean;
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
  isTv: boolean;
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
  multicolorWildHints: false,
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
    members: [{ peerId: selfId, name: selfName, isTv: false }],
    settings: DEFAULT_SETTINGS,
    gameState: null
  };
}

function cloneSnapshot(snapshot: RoomSnapshot): RoomSnapshot {
  return structuredClone(snapshot);
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
  setSelfName: (name: string) => void;
  setSelfIsTv: (isTv: boolean) => void;
};

export function useOnlineSession(enabled: boolean, roomId = DEFAULT_ROOM_ID): OnlineSession {
  const [state, setState] = useState<OnlineState>(() => ({
    ...INITIAL_STATE,
    roomId
  }));
  const desiredSelfNameRef = useRef('');
  const desiredSelfIsTvRef = useRef(false);
  const controllerRef = useRef<{
    requestSync: () => void;
    sendAction: (action: NetworkAction) => void;
    updateSettings: (next: Partial<LobbySettings>) => void;
    startGame: () => void;
    setSelfName: (name: string) => void;
    setSelfIsTv: (isTv: boolean) => void;
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
    const scopedAppId = getScopedNetworkAppId();
    let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
    let syncIntervalId: ReturnType<typeof setInterval> | null = null;
    let selfId = '';
    const peerNames = new Map<string, string>();
    const peerIsTv = new Map<string, boolean>();
    let isHost = false;
    let currentSnapshot: RoomSnapshot | null = null;
    let hostedSnapshot: RoomSnapshot | null = null;
    let sendHello: ((message: HelloMessage, target?: string | string[] | null) => Promise<void[]>) | null = null;
    let sendSnapshot: ((message: SnapshotMessage, target?: string | string[] | null) => Promise<void[]>) | null = null;
    let sendSnapshotRequest: ((message: SnapshotRequestMessage, target?: string | string[] | null) => Promise<void[]>) | null = null;
    let sendPlayerAction: ((message: PlayerActionMessage, target?: string | string[] | null) => Promise<void[]>) | null = null;
    const effectStartedAt = Date.now();

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
      const members = assignMembers(connected, baseline.members, peerNames, peerIsTv);
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
      base.members = assignMembers(connected, base.members, peerNames, peerIsTv);
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

      const request: SnapshotRequestMessage = {
        knownVersion: currentSnapshot?.version ?? 0
      };
      if (!currentSnapshot) {
        void sendSnapshotRequest(request, null);
        return;
      }

      const connected = getConnectedPeerIds(selfId, room);
      const electedHost = electHostId(connected, currentSnapshot?.members.map((member) => member.peerId));
      if (!electedHost || electedHost === selfId) {
        return;
      }

      void sendSnapshotRequest(request, electedHost);
    };

    const reconcileRole = (): void => {
      if (!room) {
        return;
      }

      const connected = getConnectedPeerIds(selfId, room);
      if (!currentSnapshot) {
        const lowestConnected = electHostId(connected);
        if (!lowestConnected) {
          return;
        }

        if (lowestConnected !== selfId) {
          stepDownHost();
          pushState('connected');
          requestSnapshotFromHost();
          return;
        }

        if (Date.now() - effectStartedAt < INITIAL_SNAPSHOT_WAIT_MS) {
          stepDownHost();
          pushState('connecting');
          requestSnapshotFromHost();
          return;
        }

        if (!isHost) {
          becomeHost();
          return;
        }

        refreshHostedMembers();
        return;
      }

      const electedHost = electHostId(connected, currentSnapshot?.members.map((member) => member.peerId));
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
        peerIsTv.set(member.peerId, member.isTv);
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
      const defaultSelfName = formatPeerName(selfId);
      const selfName = sanitizePlayerName(desiredSelfNameRef.current) ?? defaultSelfName;
      peerNames.set(selfId, selfName);
      peerIsTv.set(selfId, Boolean(desiredSelfIsTvRef.current));
      setState({
        ...INITIAL_STATE,
        status: 'connecting',
        roomId,
        selfId
      });

      room = moduleApi.joinRoom({ appId: scopedAppId }, roomId);
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

      const broadcastHello = (target?: string): void => {
        if (!sendHello) {
          return;
        }

        const name = peerNames.get(selfId) ?? selfName;
        const isTv = peerIsTv.get(selfId) ?? false;
        void sendHello({ name, isTv }, target ?? null);
      };

      const announceSelf = (target?: string): void => {
        broadcastHello(target);
      };

      getHelloAction((message, peerId) => {
        if (typeof message?.name !== 'string' || message.name.trim().length === 0) {
          return;
        }

        peerNames.set(peerId, message.name.trim());
        if (typeof message?.isTv === 'boolean') {
          peerIsTv.set(peerId, message.isTv);
        }
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
          const electedHost = electHostId(connected, currentSnapshot?.members.map((member) => member.peerId));
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

          const orderedPlayers = hostedSnapshot.members.filter((member) => !member.isTv);

          if (orderedPlayers.length < 2 || orderedPlayers.length > 5) {
            return;
          }

          const game = new HanabiGame({
            playerIds: orderedPlayers.map((member) => member.peerId),
            playerNames: orderedPlayers.map((member) => member.name),
            includeMulticolor: hostedSnapshot.settings.includeMulticolor,
            multicolorShortDeck: hostedSnapshot.settings.multicolorShortDeck,
            multicolorWildHints: hostedSnapshot.settings.multicolorWildHints,
            endlessMode: hostedSnapshot.settings.endlessMode
          });

          updateHostedSnapshot((draft) => {
            draft.phase = 'playing';
            draft.gameState = game.getSnapshot();
          });
        },
        setSelfName: (name) => {
          const resolvedName = sanitizePlayerName(name) ?? defaultSelfName;
          const currentName = peerNames.get(selfId) ?? defaultSelfName;
          if (resolvedName === currentName) {
            return;
          }

          peerNames.set(selfId, resolvedName);
          broadcastHello();

          if (isHost) {
            refreshHostedMembers();
          }
        },
        setSelfIsTv: (isTv) => {
          const resolved = Boolean(isTv);
          const current = peerIsTv.get(selfId) ?? false;
          if (resolved === current) {
            return;
          }

          peerIsTv.set(selfId, resolved);
          broadcastHello();

          if (isHost) {
            refreshHostedMembers();
          }
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

        reconcileRole();
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

  const setSelfName = useCallback((name: string) => {
    desiredSelfNameRef.current = name;
    controllerRef.current?.setSelfName(name);
  }, []);

  const setSelfIsTv = useCallback((isTv: boolean) => {
    desiredSelfIsTvRef.current = Boolean(isTv);
    controllerRef.current?.setSelfIsTv(Boolean(isTv));
  }, []);

  return useMemo(
    () => ({
      state,
      startGame,
      updateSettings,
      sendAction,
      requestSync,
      setSelfName,
      setSelfIsTv
    }),
    [requestSync, sendAction, setSelfIsTv, setSelfName, startGame, state, updateSettings]
  );
}

export { DEFAULT_ROOM_ID };
