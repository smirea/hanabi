const NETWORK_APP_ID = 'hanabi-mobile-web';

if (NETWORK_APP_ID.trim().length === 0) {
  throw new Error('NETWORK_APP_ID must not be empty');
}

function normalizeDomainScope(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error('Network domain scope must not be empty');
  }

  return normalized;
}

export function getNetworkDomainScope(hostname?: string): string {
  if (hostname !== undefined) {
    return normalizeDomainScope(hostname);
  }

  if (typeof window === 'undefined') {
    return 'server';
  }

  return normalizeDomainScope(window.location.hostname);
}

export function getScopedNetworkAppId(hostname?: string): string {
  const scope = getNetworkDomainScope(hostname);
  return `${NETWORK_APP_ID}.${scope}`;
}

export { NETWORK_APP_ID };
