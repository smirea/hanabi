export function comparePeerId(a: string, b: string): number {
  return a.localeCompare(b);
}

function normalizePeerIds(ids: Iterable<string>): string[] {
  const normalized: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string') {
      continue;
    }

    const trimmed = id.trim();
    if (trimmed.length === 0) {
      continue;
    }

    normalized.push(trimmed);
  }

  return [...new Set(normalized)].sort(comparePeerId);
}

export function electHostId(
  connectedPeerIds: Iterable<string>,
  memberPeerIds?: Iterable<string>
): string | null {
  const connected = normalizePeerIds(connectedPeerIds);
  if (connected.length === 0) {
    return null;
  }

  if (memberPeerIds) {
    const memberSet = new Set(normalizePeerIds(memberPeerIds));
    const eligible = connected.filter((peerId) => memberSet.has(peerId));
    if (eligible.length > 0) {
      return eligible[0];
    }
  }

  return connected[0] ?? null;
}

