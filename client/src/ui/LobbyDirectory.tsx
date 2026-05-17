import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useWebStorageState } from '../hooks/useWebStorageState';
import { useRoomDirectory } from '../hooks/useGameServer';
import { withPersistentSearch } from '../navigation';
import { sanitizePlayerName } from '../onlineGame';
import { createRoomCode, parseRoomCode } from '../roomCodes';
import { storageKeys } from '../utils/constants';

export function LobbyDirectory() {
	const navigate = useNavigate();
	const { rooms: directory } = useRoomDirectory();
	const [joinInput, setJoinInput] = useState('');
	const [playerName, setPlayerName] = useWebStorageState(
		'localStorage',
		storageKeys.playerName,
		'',
	);
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

	const goToRoom = (code: string) => {
		const name = sanitizePlayerName(playerName);
		if (name && name !== playerName) setPlayerName(name);
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
							<label className='lobby-directory-field-label' htmlFor='lobby-name'>
								Name
							</label>
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

						<button
							type='button'
							className='lobby-button subtle lobby-history-link'
							onClick={() =>
								void navigate({ to: '/history', search: withPersistentSearch(), hash: currentHash })
							}
							data-testid='room-directory-history'
						>
							History
						</button>
					</div>
				</section>
			</section>
		</main>
	);
}
