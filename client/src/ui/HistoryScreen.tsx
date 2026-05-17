import { ArrowLeft } from '@phosphor-icons/react';
import { useNavigate } from '@tanstack/react-router';
import { useGameHistory } from '../hooks/useGameServer';
import { withPersistentSearch } from '../navigation';

function formatDate(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	}).format(date);
}

function formatSettings(settings: { includeMulticolor: boolean; endlessMode: boolean }) {
	const parts = [];
	if (settings.includeMulticolor) parts.push('Multicolor');
	if (settings.endlessMode) parts.push('Endless');
	return parts.length ? parts.join(', ') : 'Standard';
}

export function HistoryScreen() {
	const navigate = useNavigate();
	const { history } = useGameHistory();
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

	return (
		<main className='app lobby-app history-app' data-testid='history-root'>
			<section className='lobby-shell-body lobby-shell-body-full'>
				<section className='lobby-card history-card'>
					<div className='history-topbar'>
						<button
							type='button'
							className='lobby-leave-btn'
							onClick={() =>
								void navigate({ to: '/', search: withPersistentSearch(), hash: currentHash })
							}
							data-testid='history-back'
						>
							<ArrowLeft size={14} weight='bold' aria-hidden />
							Back
						</button>
						<h1 className='history-title'>History</h1>
					</div>

					{history.length === 0 ? (
						<p className='history-empty' data-testid='history-empty'>
							No finished games yet.
						</p>
					) : (
						<div className='history-list' data-testid='history-list'>
							{history.map(game => (
								<article key={`${game.roomCode}-${game.endedAt}`} className='history-row'>
									<div className='history-score'>
										<span className='history-score-value'>{game.score}</span>
										<span className='history-score-label'>pts</span>
									</div>
									<div className='history-main'>
										<div className='history-meta'>
											<span>{game.roomCode}</span>
											<span>{formatDate(game.endedAt)}</span>
											<span>{game.turns} turns</span>
										</div>
										<div className='history-players'>{game.players.join(', ')}</div>
										<div className='history-config'>{formatSettings(game.settings)}</div>
									</div>
								</article>
							))}
						</div>
					)}
				</section>
			</section>
		</main>
	);
}
