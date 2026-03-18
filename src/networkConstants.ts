import { NETWORK_APP_ID } from './utils/constants';

if (NETWORK_APP_ID.trim().length === 0) {
	throw new Error('NETWORK_APP_ID must not be empty');
}

export function getScopedNetworkAppId(hostname?: string): string {
	const scope = (hostname ?? (typeof window === 'undefined' ? 'server' : window.location.hostname))
		.trim()
		.toLowerCase();
	if (scope.length === 0) {
		throw new Error('Network domain scope must not be empty');
	}

	return `${NETWORK_APP_ID}.${scope}`;
}
