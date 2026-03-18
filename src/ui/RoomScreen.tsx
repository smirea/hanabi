import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import App from '../App';
import { withPersistentSearch } from '../navigation';
import { parseRoomCode } from '../roomCodes';

interface RoomScreenProps {
	code: string;
}

export function RoomScreen({ code }: RoomScreenProps) {
	const navigate = useNavigate();
	const normalized = parseRoomCode(code);
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

	useEffect(() => {
		if (!normalized) {
			return;
		}

		if (typeof window === 'undefined') {
			return;
		}

		const searchRoom = new URLSearchParams(window.location.search).get('room');
		const isCanonicalPath = window.location.pathname === '/' && searchRoom === normalized;
		if (isCanonicalPath) {
			return;
		}

		void navigate({
			to: '/',
			search: withPersistentSearch(normalized),
			hash: currentHash,
			replace: true,
		});
	}, [currentHash, navigate, normalized]);

	if (!normalized) {
		return (
			<main className='app lobby-app' data-testid='room-invalid-root'>
				<section className='stats lobby-shell-stats'>
					<div className='stat lobby-shell-stat' data-testid='room-invalid-shell-room'>
						<span className='lobby-shell-stat-label'>Room</span>
						<span className='lobby-shell-stat-value'>{code.trim().toUpperCase() || 'Unknown'}</span>
					</div>
					<div className='stat lobby-shell-stat' data-testid='room-invalid-shell-status'>
						<span className='lobby-shell-stat-label'>Status</span>
						<span className='lobby-shell-stat-value'>Invalid</span>
					</div>
					<div className='stat lobby-shell-stat' data-testid='room-invalid-shell-format'>
						<span className='lobby-shell-stat-label'>Format</span>
						<span className='lobby-shell-stat-value'>4 letters</span>
					</div>
				</section>
				<section className='lobby-shell-banner'>
					<p className='lobby-shell-kicker'>Hanabi Online</p>
					<h1 className='lobby-shell-title'>Invalid Room</h1>
					<p className='lobby-shell-subtitle'>Room codes must be 4 letters (A-Z).</p>
				</section>
				<section className='lobby-shell-body'>
					<section className='lobby-card lobby-card-compact'>
						<p className='lobby-note error'>Room codes must be 4 letters (A-Z).</p>
						<button
							type='button'
							className='lobby-button'
							onClick={() => void navigate({ to: '/', search: withPersistentSearch(), hash: currentHash })}
							data-testid='room-invalid-back'
						>
							Back
						</button>
					</section>
				</section>
			</main>
		);
	}

	return (
		<App
			roomCode={normalized}
			onLeaveRoom={() => {
				void navigate({ to: '/', search: withPersistentSearch(), hash: currentHash });
			}}
		/>
	);
}
