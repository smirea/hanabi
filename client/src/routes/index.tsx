import { createFileRoute } from '@tanstack/react-router';
import { useCurrentRoomResume } from '../hooks/useGameServer';
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
	const shouldResumeFromServer = !room?.trim() && !restoredRoom;
	const serverResume = useCurrentRoomResume(shouldResumeFromServer);
	const serverRoom = serverResume.roomCode;

	if (restoredRoom) {
		return <RoomScreen code={restoredRoom} />;
	}

	if (serverRoom) {
		return <RoomScreen code={serverRoom} />;
	}

	if (serverResume.isLoading) {
		return (
			<main className='app lobby-app' data-testid='room-resume-root'>
				<section className='lobby-shell-body lobby-shell-body-full'>
					<section className='lobby-card lobby-card-compact'>
						<p className='lobby-note warning'>Rejoining room...</p>
					</section>
				</section>
			</main>
		);
	}

	return <LobbyDirectory />;
}
