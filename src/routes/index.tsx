import { createFileRoute } from '@tanstack/react-router';
import type { AppSearch } from '../navigation';
import { LobbyDirectory } from '../ui/LobbyDirectory';
import { RoomScreen } from '../ui/RoomScreen';

export const Route = createFileRoute('/')({
	validateSearch: search => search as AppSearch,
	component: HomeRoute,
});

function HomeRoute() {
	const { room } = Route.useSearch();

	if (room?.trim()) {
		return <RoomScreen code={room} />;
	}

	return <LobbyDirectory />;
}
