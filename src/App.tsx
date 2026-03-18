import { useEffect, useMemo, useState } from 'react';
import { useWebStorageState } from './hooks/useWebStorageState';
import { parseRoomCode } from './roomCodes';
import { storageKeys } from './utils/constants';
import { createSessionNamespace, getSessionIdFromHash } from './storage';
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

	const [hash, setHash] = useState(() => {
		if (typeof window === 'undefined') {
			return '';
		}

		return window.location.hash;
	});

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		const onHashChange = (): void => {
			setHash(window.location.hash);
		};

		window.addEventListener('hashchange', onHashChange);
		return () => {
			window.removeEventListener('hashchange', onHashChange);
		};
	}, []);

	const storageNamespace = useMemo(() => {
		const sessionId = getSessionIdFromHash(hash);
		return sessionId ? createSessionNamespace(sessionId) : null;
	}, [hash]);
	const [isDarkMode, setIsDarkMode] = useWebStorageState('localStorage', storageKeys.darkMode, false, storageNamespace);

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
			storageNamespace={storageNamespace}
		/>
	);
}

export default App;
