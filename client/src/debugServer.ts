interface DebugServerNamespace {
	deleteRoom: (roomCode: string) => Promise<unknown>;
	deleteUser: (input: { name: string }) => Promise<unknown>;
}

type DebugRoot = Window & {
	DEBUG?: Record<string, unknown> & {
		server?: DebugServerNamespace;
	};
};

async function postAdmin(path: string, body: unknown): Promise<unknown> {
	const response = await fetch(`/api/admin/${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const payload = (await response.json()) as unknown;
	if (!response.ok) {
		const message =
			typeof payload === 'object' && payload !== null && 'error' in payload
				? String(payload.error)
				: `Admin request failed with ${response.status}`;
		throw new Error(message);
	}

	return payload;
}

export function installDebugServerNamespace(): void {
	if (typeof window === 'undefined') return;

	const root = window as DebugRoot;
	root.DEBUG ??= {};
	root.DEBUG.server = {
		deleteRoom: roomCode => postAdmin('delete-room', { roomCode }),
		deleteUser: input => postAdmin('delete-user', input),
	};
}
