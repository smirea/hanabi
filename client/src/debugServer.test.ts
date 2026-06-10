import { afterEach, describe, expect, mock, test } from 'bun:test';
import { installDebugServerNamespace } from './debugServer';

type DebugWindow = Window & {
	DEBUG?: {
		admin?: () => void;
		server?: {
			deleteRoom: (roomCode: string) => Promise<unknown>;
			deleteUser: (input: { userId?: number | null; name?: string | null }) => Promise<unknown>;
			deleteGame: (gameId: string) => Promise<unknown>;
		};
	};
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	window.history.replaceState(null, '', '/');
	delete (window as DebugWindow).DEBUG;
});

describe('installDebugServerNamespace', () => {
	test('installs server admin helpers that post to admin endpoints', async () => {
		const requests: Array<{ body: unknown; url: string }> = [];
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
			requests.push({ url, body });
			return Response.json({ ok: true });
		}) as unknown as typeof fetch;

		installDebugServerNamespace();
		const debug = (window as DebugWindow).DEBUG;

		await debug?.server?.deleteRoom('ABCD');
		await debug?.server?.deleteUser({ name: 'Alex' });
		await debug?.server?.deleteGame('ABCD:10:42');

		expect(requests).toEqual([
			{ url: '/api/admin/delete-room', body: { roomCode: 'ABCD' } },
			{ url: '/api/admin/delete-user', body: { name: 'Alex' } },
			{ url: '/api/admin/delete-game', body: { gameId: 'ABCD:10:42' } },
		]);
	});

	test('installs an admin screen opener', () => {
		const popstates: string[] = [];
		window.history.replaceState(null, '', '/?debug_id=tab-1#tv');
		window.addEventListener('popstate', () => popstates.push(window.location.href), {
			once: true,
		});

		installDebugServerNamespace();
		(window as DebugWindow).DEBUG?.admin?.();

		expect(window.location.pathname).toBe('/admin');
		expect(window.location.search).toBe('?debug_id=tab-1');
		expect(window.location.hash).toBe('#tv');
		expect(popstates).toEqual(['http://localhost/admin?debug_id=tab-1#tv']);
	});
});
