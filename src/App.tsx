import { useEffect } from 'react';
import { useWebStorageState } from './hooks/useWebStorageState';
import { parseRoomCode } from './roomCodes';
import { storageKeys } from './utils/constants';
import GameClient from './ui/game/GameClient';

interface AppProps {
	roomCode: string;
	onLeaveRoom?: () => void;
}

function App({ roomCode, onLeaveRoom }: AppProps) {
	const parsedRoomCode = parseRoomCode(roomCode);
	if (!parsedRoomCode) {
		throw new Error(`Invalid room code "${roomCode}". Room codes must be 4 letters.`);
	}

	const [isDarkMode, setIsDarkMode] = useWebStorageState('localStorage', storageKeys.darkMode, false);

	useEffect(() => {
		if (typeof document === 'undefined') {
			return;
		}

		document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';

		const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
		meta?.setAttribute('content', isDarkMode ? '#0b0d14' : '#f5f7fc');
	}, [isDarkMode]);

	return (
		<GameClient
			isDarkMode={isDarkMode}
			onToggleDarkMode={() => setIsDarkMode(current => !current)}
			roomId={parsedRoomCode}
			onLeaveRoom={onLeaveRoom ?? null}
		/>
	);
}

export default App;
