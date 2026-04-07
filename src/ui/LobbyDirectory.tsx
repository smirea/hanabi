import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useSnapshot } from 'valtio/react';
import { withPersistentSearch } from '../navigation';
import { getOnlineNetworking, selectRoomDirectoryListings } from '../onlineGame';
import { createRoomCode, parseRoomCode } from '../roomCodes';

export function LobbyDirectory() {
	const navigate = useNavigate();
	const onlineNetworking = getOnlineNetworking();
	const stateSnapshot = useSnapshot(onlineNetworking.state);
	const directory = useMemo(
		() => selectRoomDirectoryListings(onlineNetworking.rooms),
		[onlineNetworking, stateSnapshot],
	);
	const [joinInput, setJoinInput] = useState('');
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');
	const joinCode = parseRoomCode(joinInput);
	const visiblePlayers = directory.reduce((count, room) => count + (room.players?.length ?? 0), 0);

	useEffect(() => {
		onlineNetworking.leaveGameRoom();
	}, [onlineNetworking]);

	return (
		<main className='app lobby-app' data-testid='room-directory-root'>
			<section className='stats lobby-shell-stats'>
				<div className='stat lobby-shell-stat' data-testid='room-directory-shell-rooms'>
					<span className='lobby-shell-stat-label'>Rooms</span>
					<span className='lobby-shell-stat-value'>{directory.length}</span>
				</div>
				<div className='stat lobby-shell-stat' data-testid='room-directory-shell-players'>
					<span className='lobby-shell-stat-label'>Players</span>
					<span className='lobby-shell-stat-value'>{visiblePlayers}</span>
				</div>
				<div className='stat lobby-shell-stat' data-testid='room-directory-shell-status'>
					<span className='lobby-shell-stat-label'>Status</span>
					<span className='lobby-shell-stat-value'>Online</span>
				</div>
			</section>

			<section className='lobby-shell-body'>
				<section className='lobby-card'>
					<header className='lobby-header'>
						<h2 className='lobby-title'>Join Or Create</h2>
						<button
							type='button'
							className='lobby-button subtle'
							onClick={() => {
								const code = createRoomCode();
								void navigate({
									to: '/',
									search: withPersistentSearch(code),
									hash: currentHash,
								});
							}}
							data-testid='room-directory-create'
						>
							New Room
						</button>
					</header>

					<section className='room-directory-join'>
						<label className='room-directory-label' htmlFor='room-directory-code'>
							Room code
						</label>
						<div className='room-directory-join-row'>
							<input
								id='room-directory-code'
								className='room-directory-input'
								value={joinInput}
								onChange={event => setJoinInput(event.target.value)}
								placeholder='ABCD'
								inputMode='text'
								autoCapitalize='characters'
								spellCheck={false}
								maxLength={8}
								data-testid='room-directory-join-input'
							/>
							<button
								type='button'
								className='lobby-button'
								onClick={() => {
									if (!joinCode) {
										return;
									}

									void navigate({
										to: '/',
										search: withPersistentSearch(joinCode),
										hash: currentHash,
									});
								}}
								disabled={joinCode === null}
								data-testid='room-directory-join-button'
							>
								Join
							</button>
						</div>
						{joinInput.trim().length > 0 && joinCode === null && (
							<p className='lobby-note' data-testid='room-directory-hint'>
								Enter a 4-letter code.
							</p>
						)}
					</section>

					<section className='room-directory-list' data-testid='room-directory-list'>
						<div className='room-directory-list-header'>
							<h2 className='lobby-section-title'>Open Rooms</h2>
							<span className='room-directory-status' data-testid='room-directory-status'>
								{directory.length} found
							</span>
						</div>

						<div className='room-directory-room-list'>
							{directory.length === 0 ? (
								<p className='lobby-note' data-testid='room-directory-empty'>
									No open rooms yet.
								</p>
							) : (
								directory.map(room => (
									<article
										key={room.code}
										className='room-directory-room'
										data-testid={`room-directory-room-${room.code}`}
									>
										<div className='room-directory-room-meta'>
											<div className='room-directory-room-code'>{room.code}</div>
											<div className='room-directory-room-players' aria-label='Players'>
												{!room.players?.length ? 'Waiting…' : room.players.slice(0, 5).join(', ')}
											</div>
										</div>
										<button
											type='button'
											className='lobby-button subtle'
											onClick={() => {
												void navigate({
													to: '/',
													search: withPersistentSearch(room.code),
													hash: currentHash,
												});
											}}
											data-testid={`room-directory-join-${room.code}`}
										>
											Join
										</button>
									</article>
								))
							)}
						</div>
					</section>

					<footer className='room-directory-footer'>
						<p className='lobby-note'>Room codes are 4 letters. Share the URL to invite others.</p>
					</footer>
				</section>
			</section>
		</main>
	);
}
