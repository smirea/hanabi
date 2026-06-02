import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { leaveRoomForStoredUser, useCurrentRoomResume } from '../hooks/useGameServer';
import {
	clearStoredRoomCode,
	getStoredRoomCode,
	resolveHomeRoom,
	type AppSearch,
} from '../navigation';
import { LobbyDirectory } from '../ui/LobbyDirectory';
import { RoomScreen } from '../ui/RoomScreen';

export const Route = createFileRoute('/')({
	validateSearch: search => search as AppSearch,
	component: HomeRoute,
});

function HomeRoute() {
	const { room } = Route.useSearch();
	const restoredRoom = resolveHomeRoom(room);
	const storedRoom = restoredRoom ? null : getStoredRoomCode();
	const shouldResumeFromServer = !restoredRoom && !storedRoom;
	const serverResume = useCurrentRoomResume(shouldResumeFromServer);
	const serverRoom = serverResume.roomCode;
	const [dismissedResumeRoom, setDismissedResumeRoom] = useState<string | null>(null);
	const resumeRoomCode = useMemo(() => {
		const code = storedRoom ?? serverRoom;
		if (!code || code === dismissedResumeRoom) return null;
		return code;
	}, [dismissedResumeRoom, serverRoom, storedRoom]);

	if (restoredRoom) {
		return <RoomScreen code={restoredRoom} />;
	}

	return (
		<LobbyDirectory
			resumeRoomCode={resumeRoomCode}
			onLeaveResumeRoom={code => {
				clearStoredRoomCode();
				setDismissedResumeRoom(code);
				void leaveRoomForStoredUser(code).catch(() => {});
			}}
		/>
	);
}
