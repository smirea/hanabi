import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useSnapshot } from 'valtio/react';
import { useWebStorageState } from '../hooks/useWebStorageState';
import { withPersistentSearch } from '../navigation';
import { getOnlineNetworking, sanitizePlayerName, selectRoomDirectoryListings } from '../onlineGame';
import { createRoomCode, parseRoomCode } from '../roomCodes';
import { storageKeys } from '../utils/constants';

export function LobbyDirectory() {
	const navigate = useNavigate();
	const onlineNetworking = getOnlineNetworking();
	const stateSnapshot = useSnapshot(onlineNetworking.state);
	const directory = useMemo(
		() => selectRoomDirectoryListings(onlineNetworking.rooms),
		[onlineNetworking, stateSnapshot],
	);
	const [joinInput, setJoinInput] = useState('');
	const networkName = onlineNetworking.state.self.name;
	const [playerName, setPlayerName] = useWebStorageState(
		'localStorage',
		storageKeys.playerName,
		networkName && networkName !== 'unnamed' ? networkName : '',
	);
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

	useEffect(() => {
		const storedRoom = onlineNetworking.state.self.room;
		if (storedRoom) {
			const code = storedRoom.replace(/^room:/, '');
			void navigate({
				to: '/',
				search: withPersistentSearch(code),
				hash: currentHash,
				replace: true,
			});
			return;
		}
		onlineNetworking.leaveGameRoom();
	}, [onlineNetworking, navigate, currentHash]);
	const joinCode = parseRoomCode(joinInput);

	const goToRoom = (code: string) => {
		const name = sanitizePlayerName(playerName);
		if (name && onlineNetworking.state.self.name !== name) {
			onlineNetworking.updateSelf({ name });
		}
		void navigate({
			to: '/',
			search: withPersistentSearch(code),
			hash: currentHash,
		});
	};

	return (
		<main className='app lobby-app' data-testid='room-directory-root'>
			<section className='lobby-shell-body lobby-shell-body-full'>
				<section className='lobby-card lobby-directory-card'>
					<h1 className='lobby-directory-title'>Hanabi</h1>

					<div className='lobby-directory-body'>
						<div className='lobby-directory-name-field'>
							<label className='lobby-directory-field-label' htmlFor='lobby-name'>Name</label>
							<input
								id='lobby-name'
								className='lobby-directory-name-input'
								value={playerName}
								onChange={e => setPlayerName(e.target.value)}
								placeholder='Judy Hopps'
								maxLength={16}
								spellCheck={false}
								autoComplete='off'
								data-testid='room-directory-name-input'
							/>
						</div>

						<button
							type='button'
							className='lobby-directory-create-btn'
							onClick={() => goToRoom(createRoomCode())}
							data-testid='room-directory-create'
						>
							Create Room
						</button>

						<div className='lobby-directory-divider'>
							<span>or join room</span>
						</div>

						<input
							className='lobby-directory-code-input'
							value={joinInput}
							onChange={e => {
								const val = e.target.value;
								setJoinInput(val);
								const code = parseRoomCode(val);
								if (code) goToRoom(code);
							}}
							placeholder='BWBS'
							inputMode='text'
							autoCapitalize='characters'
							spellCheck={false}
							maxLength={4}
							data-testid='room-directory-join-input'
						/>

						{directory.length > 0 && (
							<div className='lobby-directory-rooms' data-testid='room-directory-list'>
								{directory.map(room => (
									<button
										key={room.code}
										type='button'
										className='lobby-directory-room'
										onClick={() => goToRoom(room.code)}
										data-testid={`room-directory-room-${room.code}`}
									>
										<div className='lobby-directory-room-code'>{room.code}</div>
										<div className='lobby-directory-room-players'>
											{!room.players?.length ? 'Empty' : room.players.slice(0, 5).join(', ')}
										</div>
										<div className='lobby-directory-room-join'>Join</div>
									</button>
								))}
							</div>
						)}
					</div>
				</section>
			</section>
		</main>
	);
}
