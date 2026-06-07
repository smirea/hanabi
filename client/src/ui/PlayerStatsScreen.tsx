import {
	ArrowLeft,
	CalendarBlank,
	ChartBar,
	ClockCounterClockwise,
	Fire,
	LightbulbFilament,
	Medal,
	Trophy,
} from '@phosphor-icons/react';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useGameHistory } from '../hooks/useGameServer';
import { withPersistentSearch } from '../navigation';
import { playerIdForUser } from '../onlineGame';
import { storageKeys } from '../utils/constants';
import { LS } from '../utils/utils';
import { getScoreFlavor } from './scoreFlavor';
import { aggregatePlayerStats, type PlayerStatsAggregate } from './playerStats';

type MetricDirection = 'higher' | 'lower';
type ComparisonKind = 'best' | 'top' | 'up' | 'neutral' | 'down' | 'bottom' | 'worst';
type MetricColumn = 'total' | 'average' | 'median' | 'best' | 'worst';

interface MetricCell {
	value: number;
	comparison: MetricComparison | null;
}

interface MetricRow {
	key: string;
	label: string;
	cells: Record<MetricColumn, MetricCell>;
}

interface MetricComparison {
	kind: ComparisonKind;
	label: string;
	note: string;
}

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) return '0';
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(1);
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	}).format(date);
}

function getCurrentPlayerId(): string | null {
	const userId = LS.get(storageKeys.serverUserId);
	return typeof userId === 'number' ? playerIdForUser(userId) : null;
}

function outcomeLabel(status: PlayerStatsAggregate['games'][number]['status']): string {
	if (status === 'won') return 'Win';
	if (status === 'lost') return 'Loss';
	return 'Done';
}

function medianNumber(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid];
	return (sorted[mid - 1] + sorted[mid]) / 2;
}

function bestMetricValue(values: number[], direction: MetricDirection): number {
	if (values.length === 0) return 0;
	return direction === 'higher' ? Math.max(...values) : Math.min(...values);
}

function worstMetricValue(values: number[], direction: MetricDirection): number {
	if (values.length === 0) return 0;
	return direction === 'higher' ? Math.min(...values) : Math.max(...values);
}

function isBetterThan(value: number, other: number, direction: MetricDirection): boolean {
	return direction === 'higher' ? value > other : value < other;
}

function comparisonLabel(kind: ComparisonKind): string {
	switch (kind) {
		case 'best':
			return '★';
		case 'top':
			return '⇈';
		case 'up':
			return '↑';
		case 'down':
			return '↓';
		case 'bottom':
			return '⇊';
		case 'worst':
			return '';
		default:
			return '•';
	}
}

function detailTitle(playerName: string | undefined): string {
	return playerName ? `${playerName}'s stats` : 'Player stats';
}

function metricComparison({
	label,
	value,
	values,
	direction,
}: {
	label: string;
	value: number;
	values: number[];
	direction: MetricDirection;
}): MetricComparison | null {
	const finiteValues = values.filter(Number.isFinite);
	if (finiteValues.length < 2 || !Number.isFinite(value)) return null;

	const allEqual = finiteValues.every(nextValue => nextValue === finiteValues[0]);
	if (allEqual) {
		return {
			kind: 'neutral',
			label: comparisonLabel('neutral'),
			note: `${label}: even with everyone.`,
		};
	}

	const best = bestMetricValue(finiteValues, direction);
	const worst = worstMetricValue(finiteValues, direction);
	const comparableValues = finiteValues.filter(nextValue => nextValue !== value);
	const denominator = Math.max(1, comparableValues.length);
	const betterThan = comparableValues.filter(otherValue =>
		isBetterThan(value, otherValue, direction),
	).length;
	const worseThan = comparableValues.filter(otherValue =>
		isBetterThan(otherValue, value, direction),
	).length;
	const betterPercent = Math.round((betterThan / denominator) * 100);
	const worsePercent = Math.round((worseThan / denominator) * 100);
	const globalMedian = medianNumber(finiteValues);
	const baseNote = `${label}: ${formatNumber(value)}. Median: ${formatNumber(globalMedian)}.`;

	if (value === best) {
		return {
			kind: 'best',
			label: comparisonLabel('best'),
			note: `Best. ${baseNote}`,
		};
	}

	if (value === worst) {
		return {
			kind: 'worst',
			label: 'Worst',
			note: `Worst. ${baseNote}`,
		};
	}

	if (betterPercent >= 75) {
		return {
			kind: 'top',
			label: comparisonLabel('top'),
			note: `Better than ${betterPercent}%. ${baseNote}`,
		};
	}

	if (betterPercent >= 55) {
		return {
			kind: 'up',
			label: comparisonLabel('up'),
			note: `Better than ${betterPercent}%. ${baseNote}`,
		};
	}

	if (worsePercent >= 75) {
		return {
			kind: 'bottom',
			label: comparisonLabel('bottom'),
			note: `Worse than ${worsePercent}%. ${baseNote}`,
		};
	}

	if (worsePercent >= 45) {
		return {
			kind: 'down',
			label: comparisonLabel('down'),
			note: `Worse than ${worsePercent}%. ${baseNote}`,
		};
	}

	return {
		kind: 'neutral',
		label: comparisonLabel('neutral'),
		note: `Middle. ${baseNote}`,
	};
}

function metricCell({
	label,
	value,
	values,
	direction,
}: {
	label: string;
	value: number;
	values: number[];
	direction: MetricDirection;
}): MetricCell {
	return {
		value,
		comparison: metricComparison({ label, value, values, direction }),
	};
}

function makeMetricRow({
	key,
	label,
	player,
	players,
	direction,
	total,
	average,
	median,
	values,
}: {
	key: string;
	label: string;
	player: PlayerStatsAggregate;
	players: PlayerStatsAggregate[];
	direction: MetricDirection;
	total: (player: PlayerStatsAggregate) => number;
	average: (player: PlayerStatsAggregate) => number;
	median: (player: PlayerStatsAggregate) => number;
	values: (player: PlayerStatsAggregate) => number[];
}): MetricRow {
	const currentValues = values(player);
	const best = (nextPlayer: PlayerStatsAggregate) => bestMetricValue(values(nextPlayer), direction);
	const worst = (nextPlayer: PlayerStatsAggregate) =>
		worstMetricValue(values(nextPlayer), direction);

	return {
		key,
		label,
		cells: {
			total: metricCell({
				label,
				value: total(player),
				values: players.map(total),
				direction,
			}),
			average: metricCell({
				label,
				value: average(player),
				values: players.map(average),
				direction,
			}),
			median: metricCell({
				label,
				value: median(player),
				values: players.map(median),
				direction,
			}),
			best: metricCell({
				label,
				value: bestMetricValue(currentValues, direction),
				values: players.map(best),
				direction,
			}),
			worst: metricCell({
				label,
				value: worstMetricValue(currentValues, direction),
				values: players.map(worst),
				direction,
			}),
		},
	};
}

export function PlayerStatsScreen({ playerId }: { playerId?: string }) {
	const navigate = useNavigate();
	const { history } = useGameHistory();
	const currentPlayerId = getCurrentPlayerId();
	const players = useMemo(
		() => aggregatePlayerStats(history, currentPlayerId),
		[history, currentPlayerId],
	);
	const selectedPlayer = playerId ? players.find(player => player.id === playerId) : null;
	const bestAverageScore = Math.max(0, ...players.map(player => player.averageScore));
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

	function goHome(): void {
		void navigate({ to: '/', search: withPersistentSearch(), hash: currentHash });
	}

	function goStats(): void {
		void navigate({ to: '/stats', search: withPersistentSearch(), hash: currentHash });
	}

	function goPlayer(nextPlayerId: string): void {
		void navigate({
			to: '/stats/$playerId',
			params: { playerId: nextPlayerId },
			search: withPersistentSearch(),
			hash: currentHash,
		});
	}

	if (playerId) {
		return (
			<main className='app lobby-app player-stats-app' data-testid='player-stats-detail-root'>
				<section className='lobby-shell-body lobby-shell-body-full'>
					<section className='lobby-card player-stats-card detail'>
						<div className='history-topbar'>
							<button
								type='button'
								className='lobby-leave-btn'
								onClick={goStats}
								data-testid='player-stats-back'
							>
								<ArrowLeft size={14} weight='bold' aria-hidden />
								Stats
							</button>
							<h1 className='history-title'>{detailTitle(selectedPlayer?.name)}</h1>
						</div>

						{selectedPlayer ? (
							<PlayerStatsDetail player={selectedPlayer} players={players} />
						) : (
							<section className='history-empty' data-testid='player-stats-missing'>
								Player stats not found.
							</section>
						)}
					</section>
				</section>
			</main>
		);
	}

	return (
		<main className='app lobby-app player-stats-app' data-testid='player-stats-root'>
			<section className='lobby-shell-body lobby-shell-body-full'>
				<section className='lobby-card player-stats-card'>
					<div className='history-topbar'>
						<button
							type='button'
							className='lobby-leave-btn'
							onClick={goHome}
							data-testid='player-stats-home'
						>
							<ArrowLeft size={14} weight='bold' aria-hidden />
							Back
						</button>
						<h1 className='history-title'>Player Stats</h1>
					</div>

					{players.length === 0 ? (
						<section className='history-empty' data-testid='player-stats-empty'>
							No finished games yet.
						</section>
					) : (
						<section className='player-stats-summary' data-testid='player-stats-summary'>
							<div className='player-stats-totals'>
								<StatTile
									icon={<ChartBar size={15} weight='bold' />}
									label='games'
									value={history.length}
								/>
								<StatTile
									icon={<Medal size={15} weight='bold' />}
									label='players'
									value={players.length}
								/>
								<StatTile
									icon={<Trophy size={15} weight='bold' />}
									label='best avg'
									value={formatNumber(bestAverageScore)}
								/>
							</div>

							<div className='player-stats-table' data-testid='player-stats-table'>
								<div className='player-stats-row header'>
									<span>player</span>
									<span>games</span>
									<span>avg</span>
									<span>median</span>
								</div>
								{players.map(player => (
									<button
										key={player.id}
										type='button'
										className={`player-stats-row ${player.isCurrentUser ? 'you' : ''}`}
										onClick={() => goPlayer(player.id)}
										data-testid={`player-stats-row-${player.id}`}
									>
										<span className='player-stats-name'>
											{player.name}
											{player.isCurrentUser ? <span className='you-tag'>you</span> : null}
										</span>
										<span>{player.gamesPlayed}</span>
										<span>{formatNumber(player.averageScore)}</span>
										<span>{formatNumber(player.medianScore)}</span>
									</button>
								))}
							</div>
						</section>
					)}
				</section>
			</section>
		</main>
	);
}

function PlayerStatsDetail({
	player,
	players,
}: {
	player: PlayerStatsAggregate;
	players: PlayerStatsAggregate[];
}) {
	const metricRows: MetricRow[] = [
		makeMetricRow({
			key: 'score',
			label: 'score',
			direction: 'higher',
			player,
			players,
			total: row => row.totalScore,
			average: row => row.averageScore,
			median: row => row.medianScore,
			values: row => row.games.map(game => game.score),
		}),
		makeMetricRow({
			key: 'turns',
			label: 'turns',
			direction: 'lower',
			player,
			players,
			total: row => row.totalTurns,
			average: row => row.averageTurns,
			median: row => row.medianTurns,
			values: row => row.games.map(game => game.turns),
		}),
		makeMetricRow({
			key: 'rounds',
			label: 'rounds',
			direction: 'lower',
			player,
			players,
			total: row => row.totalRounds,
			average: row => row.averageRounds,
			median: row => row.medianRounds,
			values: row => row.games.map(game => game.rounds),
		}),
		makeMetricRow({
			key: 'given',
			label: 'given',
			direction: 'higher',
			player,
			players,
			total: row => row.totalHintsGiven,
			average: row => row.averageHintsGiven,
			median: row => row.medianHintsGiven,
			values: row => row.games.map(game => game.hintsGiven),
		}),
		makeMetricRow({
			key: 'received',
			label: 'received',
			direction: 'lower',
			player,
			players,
			total: row => row.totalHintsReceived,
			average: row => row.averageHintsReceived,
			median: row => row.medianHintsReceived,
			values: row => row.games.map(game => game.hintsReceived),
		}),
		makeMetricRow({
			key: 'played',
			label: 'played',
			direction: 'higher',
			player,
			players,
			total: row => row.totalPlays,
			average: row => row.averagePlays,
			median: row => row.medianPlays,
			values: row => row.games.map(game => game.plays),
		}),
		makeMetricRow({
			key: 'discard',
			label: 'discard',
			direction: 'lower',
			player,
			players,
			total: row => row.totalDiscards,
			average: row => row.averageDiscards,
			median: row => row.medianDiscards,
			values: row => row.games.map(game => game.discards),
		}),
	];

	return (
		<section className='player-stats-detail' data-testid='player-stats-detail'>
			<div className='player-stats-totals'>
				<StatTile
					icon={<ChartBar size={15} weight='bold' />}
					label='games'
					value={player.gamesPlayed}
				/>
				<StatTile icon={<Trophy size={15} weight='bold' />} label='wins' value={player.wins} />
				<StatTile icon={<Fire size={15} weight='fill' />} label='losses' value={player.losses} />
				<StatTile
					icon={<LightbulbFilament size={15} weight='fill' />}
					label='hints'
					value={formatNumber(player.averageHintsGiven)}
				/>
			</div>

			<section className='player-stats-metric-table' data-testid='player-stats-metric-table'>
				<div className='player-stats-metric-row header'>
					<span>stat</span>
					<span>total</span>
					<span>avg</span>
					<span>median</span>
					<span>best</span>
					<span>worst</span>
				</div>
				{metricRows.map(row => (
					<div key={row.key} className='player-stats-metric-row'>
						<span>{row.label}</span>
						<MetricValueCell row={row} column='total' />
						<MetricValueCell row={row} column='average' />
						<MetricValueCell row={row} column='median' />
						<MetricValueCell row={row} column='best' />
						<MetricValueCell row={row} column='worst' />
					</div>
				))}
			</section>

			<section className='player-stats-recent' data-testid='player-stats-recent'>
				<h3 className='history-day-title'>recent games</h3>
				{player.games.slice(0, 8).map(game => {
					const gameFlavor = getScoreFlavor(game.score, game.score > 25 ? 30 : 25);
					const gameStyle = { '--history-accent': gameFlavor.accent } as CSSProperties;

					return (
						<article
							key={`${game.roomCode}-${game.endedAt}`}
							className='player-stats-game-row'
							style={gameStyle}
						>
							<div className='player-stats-game-score'>
								<span className='history-badge player-stats-game-badge' title={gameFlavor.label}>
									<img
										className='history-badge-image'
										src={gameFlavor.image}
										alt={gameFlavor.label}
									/>
								</span>
								<div className='history-score'>
									<span className='history-score-value'>{game.score}</span>
								</div>
							</div>
							<div className='history-main'>
								<div className='history-players'>{outcomeLabel(game.status)}</div>
								<div className='player-stats-game-meta'>
									<GameRowStat
										icon={<CalendarBlank size={12} weight='bold' />}
										value={formatDate(game.endedAt)}
										label='date'
									/>
									<GameRowStat
										icon={<ClockCounterClockwise size={12} weight='bold' />}
										value={game.turns}
										label='turns'
									/>
									<GameRowStat
										icon={<LightbulbFilament size={12} weight='fill' />}
										value={game.hintsGiven}
										label='hints given'
									/>
								</div>
							</div>
							<div className='player-stats-game-resources'>
								<GameRowStat
									icon={<Fire size={12} weight='fill' />}
									value={`${game.livesRemaining}/${game.maxLives}`}
									label='lives'
								/>
								<GameRowStat
									icon={<LightbulbFilament size={12} weight='fill' />}
									value={`${game.hintsRemaining}/${game.maxHints}`}
									label='hints'
								/>
							</div>
						</article>
					);
				})}
			</section>
		</section>
	);
}

function MetricValueCell({ row, column }: { row: MetricRow; column: MetricColumn }) {
	const cell = row.cells[column];
	return (
		<span className='player-stats-metric-value'>
			<span>{formatNumber(cell.value)}</span>
			<ComparisonIndicator
				comparison={cell.comparison}
				testId={`player-stats-comparison-${row.key}-${column}`}
			/>
		</span>
	);
}

function GameRowStat({
	icon,
	value,
	label,
}: {
	icon: ReactNode;
	value: string | number;
	label: string;
}) {
	return (
		<span className='player-stats-game-stat' title={label} aria-label={`${label}: ${value}`}>
			<span className='player-stats-game-stat-icon' aria-hidden>
				{icon}
			</span>
			<span>{value}</span>
		</span>
	);
}

function ComparisonIndicator({
	comparison,
	testId,
}: {
	comparison: MetricComparison | null;
	testId: string;
}) {
	if (!comparison) {
		return (
			<span
				className='player-stats-comparison neutral'
				aria-label='No comparison'
				data-testid={testId}
			>
				•
			</span>
		);
	}

	return (
		<span
			className={`player-stats-comparison ${comparison.kind}`}
			data-tooltip={comparison.note}
			tabIndex={0}
			aria-label={comparison.note}
			data-testid={testId}
		>
			{comparison.kind === 'worst' ? (
				<img src='/score-badges/poo.png' alt='' className='player-stats-comparison-poo' />
			) : (
				comparison.label
			)}
		</span>
	);
}

function StatTile({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: string | number;
}) {
	return (
		<div className='player-stats-tile'>
			<span className='player-stats-tile-icon'>{icon}</span>
			<span className='player-stats-tile-value'>{value}</span>
			<span className='player-stats-tile-label'>{label}</span>
		</div>
	);
}
