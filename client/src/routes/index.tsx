import { createFileRoute } from '@tanstack/react-router';
import { resolveHomeRoom, type AppSearch } from '../navigation';
import { LobbyDirectory } from '../ui/LobbyDirectory';
import { RoomScreen } from '../ui/RoomScreen';

export const Route = createFileRoute('/')({
	validateSearch: search => search as AppSearch,
	component: HomeRoute,
});

function HomeRoute() {
	const { room } = Route.useSearch();
	const restoredRoom = resolveHomeRoom(room);

	if (restoredRoom) {
		return <RoomScreen code={restoredRoom} />;
	}

	return <LobbyDirectory />;
}
