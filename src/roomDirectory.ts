import { useEffect, useMemo, useRef, useState } from 'react';
import { getScopedNetworkAppId } from './networkConstants';
import { isValidRoomCode } from './roomCodes';

const DIRECTORY_ROOM_ID = 'hanabi-room-directory-v1';
const DIRECTORY_ACTION_NAMESPACE = 'dir-ann';
const DIRECTORY_TTL_MS = 15_000;
const DIRECTORY_HEARTBEAT_MS = 3_000;

if (DIRECTORY_ROOM_ID.trim().length === 0) {
  throw new Error('DIRECTORY_ROOM_ID must not be empty');
}

if (DIRECTORY_ACTION_NAMESPACE.trim().length === 0) {
  throw new Error('DIRECTORY_ACTION_NAMESPACE must not be empty');
}

type TrysteroModule = typeof import('trystero');
type TrysteroRoom = import('trystero').Room;

export type DirectoryMember = {
  name: string;
  isTv: boolean;
};

export type DirectoryRoomListing = {
  code: string;
  members: DirectoryMember[];
  seatedCount: number;
  tvCount: number;
  updatedAt: number;
};

type DirectoryAnnouncement = {
  v: 1;
  code: string;
  phase: 'lobby';
  members: DirectoryMember[];
  snapshotVersion: number;
};

function isDirectoryAnnouncement(value: unknown): value is DirectoryAnnouncement {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<DirectoryAnnouncement>;
  return candidate.v === 1
    && candidate.phase === 'lobby'
    && typeof candidate.code === 'string'
    && isValidRoomCode(candidate.code)
    && typeof candidate.snapshotVersion === 'number'
    && Array.isArray(candidate.members)
    && candidate.members.every((member) => Boolean(member) && typeof member === 'object'
      && typeof (member as DirectoryMember).name === 'string'
      && typeof (member as DirectoryMember).isTv === 'boolean'
    );
}

function toListing(message: DirectoryAnnouncement, updatedAt: number): DirectoryRoomListing {
  const members = message.members
    .map((member) => ({
      name: member.name.trim().slice(0, 24),
      isTv: Boolean(member.isTv)
    }))
    .filter((member) => member.name.length > 0);

  const seatedCount = members.filter((member) => !member.isTv).length;
  const tvCount = members.length - seatedCount;

  return {
    code: message.code,
    members,
    seatedCount,
    tvCount,
    updatedAt
  };
}

export function useRoomDirectoryListing(enabled: boolean): {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  rooms: DirectoryRoomListing[];
  error: string | null;
} {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>(enabled ? 'connecting' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const roomsRef = useRef(new Map<string, { listing: DirectoryRoomListing; snapshotVersion: number }>());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      setError(null);
      roomsRef.current.clear();
      setVersion((v) => v + 1);
      return;
    }

    let active = true;
    let room: TrysteroRoom | null = null;
    let pruneIntervalId: ReturnType<typeof setInterval> | null = null;
    const scopedAppId = getScopedNetworkAppId();

    const now = () => Date.now();

    const prune = (): void => {
      const cutoff = now() - DIRECTORY_TTL_MS;
      let changed = false;
      for (const [code, entry] of roomsRef.current.entries()) {
        if (entry.listing.updatedAt < cutoff) {
          roomsRef.current.delete(code);
          changed = true;
        }
      }

      if (changed) {
        setVersion((v) => v + 1);
      }
    };

    const initialize = async (): Promise<void> => {
      if (typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC is unavailable in this runtime');
      }

      setStatus('connecting');
      setError(null);

      const moduleApi: TrysteroModule = await import('trystero');
      if (!active) {
        return;
      }

      room = moduleApi.joinRoom({ appId: scopedAppId }, DIRECTORY_ROOM_ID);
      const [, getAnnouncement] = room.makeAction<DirectoryAnnouncement>(DIRECTORY_ACTION_NAMESPACE);
      getAnnouncement((message) => {
        if (!active) {
          return;
        }

        if (!isDirectoryAnnouncement(message)) {
          return;
        }

        const updatedAt = now();
        const existing = roomsRef.current.get(message.code);
        if (existing && existing.snapshotVersion > message.snapshotVersion) {
          return;
        }

        roomsRef.current.set(message.code, {
          listing: toListing(message, updatedAt),
          snapshotVersion: message.snapshotVersion
        });
        setVersion((v) => v + 1);
      });

      pruneIntervalId = setInterval(prune, 1_000);
      setStatus('connected');
    };

    initialize().catch((err: unknown) => {
      if (!active) {
        return;
      }

      const message = err instanceof Error ? err.message : 'Unknown directory error';
      setStatus('error');
      setError(message);
    });

    return () => {
      active = false;
      if (pruneIntervalId) {
        clearInterval(pruneIntervalId);
      }
      if (room) {
        void room.leave();
      }
    };
  }, [enabled]);

  const rooms = useMemo(() => {
    void version;
    return [...roomsRef.current.values()]
      .map((entry) => entry.listing)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [version]);

  return { status, rooms, error };
}

export function useRoomDirectoryAdvertiser({
  enabled,
  code,
  snapshotVersion,
  members
}: {
  enabled: boolean;
  code: string;
  snapshotVersion: number;
  members: DirectoryMember[];
}): void {
  const announcementRef = useRef<DirectoryAnnouncement | null>(null);

  useEffect(() => {
    if (!enabled) {
      announcementRef.current = null;
      return;
    }

    announcementRef.current = {
      v: 1,
      code,
      phase: 'lobby',
      members,
      snapshotVersion
    };
  }, [code, enabled, members, snapshotVersion]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!isValidRoomCode(code)) {
      throw new Error(`Cannot advertise invalid room code: ${code}`);
    }

    if (typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'undefined') {
      return;
    }

    let active = true;
    let room: TrysteroRoom | null = null;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    const scopedAppId = getScopedNetworkAppId();

    const sendCurrent = (send: ((message: DirectoryAnnouncement, target?: string | string[] | null) => Promise<void[]>) | null): void => {
      if (!send) {
        return;
      }

      const payload = announcementRef.current;
      if (!payload) {
        return;
      }

      void send(payload, null);
    };

    const initialize = async (): Promise<void> => {
      const moduleApi: TrysteroModule = await import('trystero');
      if (!active) {
        return;
      }

      room = moduleApi.joinRoom({ appId: scopedAppId }, DIRECTORY_ROOM_ID);
      const [sendAnnouncement] = room.makeAction<DirectoryAnnouncement>(DIRECTORY_ACTION_NAMESPACE);
      sendCurrent(sendAnnouncement);

      heartbeatId = setInterval(() => {
        sendCurrent(sendAnnouncement);
      }, DIRECTORY_HEARTBEAT_MS);
    };

    initialize().catch(() => {
    });

    return () => {
      active = false;
      if (heartbeatId) {
        clearInterval(heartbeatId);
      }
      if (room) {
        void room.leave();
      }
    };
  }, [code, enabled]);
}
