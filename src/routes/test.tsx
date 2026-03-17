import { createFileRoute } from '@tanstack/react-router';

import { useSnapshot } from 'valtio';

import Networking from '../utils/networking';

const networking = new Networking({
	appId: 'stf.lol:hanabi',
	applyAction: (game, action) => {
		game.actions.push(action);
	},
	getNewGameState: () => ({ actions: [] as any[] }),
});

window.networking?.lobbyRoom?.leave();
window.networking = networking;

export const Route = createFileRoute('/test')({
	component: () => {
		const playerRoom = useSnapshot(networking.playerRoom.state);
		const gameRoom = useSnapshot(networking.state.gameRoom);
		const ownRoom = networking.gameRoom?.roomId;
		return (
			<div style={{ color: 'white', padding: '2rem' }}>
				player: {playerRoom.self.id}{' '}
				<input
					type='text'
					value={playerRoom.self.name}
					onChange={e => networking.playerRoom.updateSelf({ name: e.target.value })}
				/>
				<button onClick={() => networking.joinRoom({ roomId: ('room:AAAA_' + location.search) as any, isHost: true })}>
					create
				</button>
				<button disabled={!playerRoom.self.room} onClick={() => networking.leaveRoom()}>
					leave room
				</button>
				{networking.gameRoom && (
					<>
						<button
							onClick={() =>
								networking.gameRoom?.act({
									type: 'test',
									i: gameRoom.game.actions.length,
								})
							}
						>
							act()
						</button>
						<hr />
					</>
				)}
				<div>
					{networking.lobbies.map(room =>
						room.id === ownRoom && gameRoom.host === playerRoom.self.peerId ? null : (
							<div key={room.id} style={{ padding: '.5rem', border: '1px solid white' }}>
								{room.id}
								<button onClick={() => networking.joinRoom({ isHost: false, roomId: room.id })}>join</button> players(
								{room.players.length}): {room.players.map(x => x.name).join(', ')}
							</div>
						),
					)}
				</div>
				<pre>game = {JSON.stringify(gameRoom, null, 4)}</pre>
				<pre>lobby = {JSON.stringify(networking.lobbies, null, 4)}</pre>
				<pre>players = {JSON.stringify(playerRoom, null, 4)}</pre>
			</div>
		);
	},
});
