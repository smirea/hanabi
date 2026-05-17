import { afterEach, describe, expect, mock, test } from 'bun:test';
import { installDebugServerNamespace } from './debugServer';

type DebugWindow = Window & {
	DEBUG?: {
		server?: {
			deleteRoom: (roomCode: string) => Promise<unknown>;
			deleteUser: (input: { name: string }) => Promise<unknown>;
		};
	};
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
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

		expect(requests).toEqual([
			{ url: '/api/admin/delete-room', body: { roomCode: 'ABCD' } },
			{ url: '/api/admin/delete-user', body: { name: 'Alex' } },
		]);
	});
});
