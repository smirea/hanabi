import { deleteAdminGame, deleteAdminRoom, deleteAdminUser } from './adminDebugApi';

export const ADMIN_DEBUG_EVENT = 'hanabi:admin-debug';

interface DebugServerNamespace {
	deleteRoom: (roomCode: string) => Promise<unknown>;
	deleteUser: (input: { userId?: number | null; name?: string | null }) => Promise<unknown>;
	deleteGame: (gameId: string) => Promise<unknown>;
}

type DebugRoot = Window & {
	DEBUG?: Record<string, unknown> & {
		admin?: () => void;
		server?: DebugServerNamespace;
	};
};

export function installDebugServerNamespace(): void {
	if (typeof window === 'undefined') return;

	const root = window as DebugRoot;
	root.DEBUG ??= {};
	root.DEBUG.admin = () => window.dispatchEvent(new Event(ADMIN_DEBUG_EVENT));
	root.DEBUG.server = {
		deleteRoom: deleteAdminRoom,
		deleteUser: deleteAdminUser,
		deleteGame: deleteAdminGame,
	};
}
