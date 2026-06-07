import {
	ArrowLeft,
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

function comparisonNote(kind: ComparisonKind): string {
	switch (kind) {
		case 'best':
			return 'best';
		case 'top':
			return 'top 25%';
		case 'up':
			return 'top 45%';
		case 'down':
			return 'bottom 55%';
		case 'bottom':
			return 'bottom 25%';
		case 'worst':
			return 'worst';
		default:
			return 'middle';
	}
}

function comparisonTooltip(comparison: MetricComparison | null): string | undefined {
	if (!comparison || comparison.kind === 'neutral') return undefined;
	return comparison.note;
}

function detailTitle(playerName: string | undefined): string {
	return playerName ? `${playerName}'s stats` : 'Player stats';
}

function metricComparison({
	value,
	values,
	direction,
}: {
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
			note: comparisonNote('neutral'),
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
	if (value === best) {
		return {
			kind: 'best',
			label: comparisonLabel('best'),
			note: comparisonNote('best'),
		};
	}

	if (value === worst) {
		return {
			kind: 'worst',
			label: 'Worst',
			note: comparisonNote('worst'),
		};
	}

	if (betterPercent >= 75) {
		return {
			kind: 'top',
			label: comparisonLabel('top'),
			note: comparisonNote('top'),
		};
	}

	if (betterPercent >= 55) {
		return {
			kind: 'up',
			label: comparisonLabel('up'),
			note: comparisonNote('up'),
		};
	}

	if (worsePercent >= 75) {
		return {
			kind: 'bottom',
			label: comparisonLabel('bottom'),
			note: comparisonNote('bottom'),
		};
	}

	if (worsePercent >= 45) {
		return {
			kind: 'down',
			label: comparisonLabel('down'),
			note: comparisonNote('down'),
		};
	}

	return {
		kind: 'neutral',
		label: comparisonLabel('neutral'),
		note: comparisonNote('neutral'),
	};
}

function otherPlayersLabel(
	game: PlayerStatsAggregate['games'][number],
	playerName: string,
): string {
	const others = game.players.filter(name => name !== playerName);
	return others.length > 0 ? others.join(', ') : 'solo';
}

function bestScoreGame(player: PlayerStatsAggregate): PlayerStatsAggregate['games'][number] | null {
	return player.games.reduce<PlayerStatsAggregate['games'][number] | null>((best, game) => {
		if (!best) return game;
		if (game.score !== best.score) return game.score > best.score ? game : best;
		return game.endedAt > best.endedAt ? game : best;
	}, null);
}

function bestScoreValue(player: PlayerStatsAggregate): number {
	return bestScoreGame(player)?.score ?? 0;
}

function metricCell({
	value,
	values,
	direction,
}: {
	value: number;
	values: number[];
	direction: MetricDirection;
}): MetricCell {
	return {
		value,
		comparison: metricComparison({ value, values, direction }),
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
				value: total(player),
				values: players.map(total),
				direction,
			}),
			average: metricCell({
				value: average(player),
				values: players.map(average),
				direction,
			}),
			median: metricCell({
				value: median(player),
				values: players.map(median),
				direction,
			}),
			best: metricCell({
				value: bestMetricValue(currentValues, direction),
				values: players.map(best),
				direction,
			}),
			worst: metricCell({
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
									<span>best</span>
								</div>
								{players.map(player => {
									const bestGame = bestScoreGame(player);
									const bestFlavor = bestGame
										? getScoreFlavor(bestGame.score, bestGame.score > 25 ? 30 : 25)
										: null;

									return (
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
											<SummaryStatCell
												label='games'
												value={player.gamesPlayed}
												comparison={metricComparison({
													value: player.gamesPlayed,
													values: players.map(row => row.gamesPlayed),
													direction: 'higher',
												})}
												testId={`player-stats-summary-games-${player.id}`}
											/>
											<SummaryStatCell
												label='avg'
												value={formatNumber(player.averageScore)}
												comparison={metricComparison({
													value: player.averageScore,
													values: players.map(row => row.averageScore),
													direction: 'higher',
												})}
												testId={`player-stats-summary-avg-${player.id}`}
											/>
											<SummaryStatCell
												label='median'
												value={formatNumber(player.medianScore)}
												comparison={metricComparison({
													value: player.medianScore,
													values: players.map(row => row.medianScore),
													direction: 'higher',
												})}
												testId={`player-stats-summary-median-${player.id}`}
											/>
											<SummaryBestScoreCell
												game={bestGame}
												flavor={bestFlavor}
												comparison={metricComparison({
													value: bestScoreValue(player),
													values: players.map(bestScoreValue),
													direction: 'higher',
												})}
												testId={`player-stats-summary-best-${player.id}`}
											/>
										</button>
									);
								})}
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
			key: 'given',
			label: 'hints given',
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
			label: 'hints received',
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
			label: 'cards played',
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
								<div className='history-players'>
									{outcomeLabel(game.status)} · {otherPlayersLabel(game, player.name)}
								</div>
								<div className='player-stats-game-date'>{formatDate(game.endedAt)}</div>
							</div>
							<div className='player-stats-game-stats'>
								<GameRowStat
									icon={<ClockCounterClockwise size={12} weight='bold' />}
									value={game.turns}
									label='turns'
									tone='turns'
								/>
								<GameRowStat
									icon={<LightbulbFilament size={12} weight='fill' />}
									value={game.hintsGiven}
									label='hints given'
									tone='hints'
								/>
								<GameRowStat
									icon={<Fire size={12} weight='fill' />}
									value={`${game.livesRemaining}/${game.maxLives}`}
									label='lives'
									tone='lives'
								/>
								<GameRowStat
									icon={<LightbulbFilament size={12} weight='fill' />}
									value={`${game.hintsRemaining}/${game.maxHints}`}
									label='hints'
									tone='hints'
								/>
							</div>
						</article>
					);
				})}
			</section>
		</section>
	);
}

function SummaryStatCell({
	label,
	value,
	comparison,
	testId,
}: {
	label: string;
	value: string | number;
	comparison: MetricComparison | null;
	testId: string;
}) {
	const tooltip = comparison ? comparisonTooltip(comparison) : `${label}: ${value}`;
	return (
		<span className='player-stats-summary-stat' data-tooltip={tooltip} data-testid={testId}>
			<span>{value}</span>
			<ComparisonIndicator comparison={comparison} testId={`${testId}-comparison`} />
		</span>
	);
}

function SummaryBestScoreCell({
	game,
	flavor,
	comparison,
	testId,
}: {
	game: PlayerStatsAggregate['games'][number] | null;
	flavor: ReturnType<typeof getScoreFlavor> | null;
	comparison: MetricComparison | null;
	testId: string;
}) {
	const score = game?.score ?? 0;
	const tooltip = comparison ? comparisonTooltip(comparison) : `best: ${score}`;
	return (
		<span className='player-stats-summary-best' data-tooltip={tooltip} data-testid={testId}>
			<span className='player-stats-summary-best-value'>{score}</span>
			<ComparisonIndicator comparison={comparison} testId={`${testId}-comparison`} />
			{flavor ? (
				<span className='player-stats-summary-badge' aria-hidden>
					<img src={flavor.image} alt='' />
				</span>
			) : null}
		</span>
	);
}

function MetricValueCell({ row, column }: { row: MetricRow; column: MetricColumn }) {
	const cell = row.cells[column];
	const value = formatNumber(cell.value);
	const tooltip = comparisonTooltip(cell.comparison);
	return (
		<span
			className='player-stats-metric-value'
			data-tooltip={tooltip}
			tabIndex={tooltip ? 0 : undefined}
		>
			<span>{value}</span>
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
	tone,
}: {
	icon: ReactNode;
	value: string | number;
	label: string;
	tone: 'turns' | 'hints' | 'lives';
}) {
	const tooltip = `${label}: ${value}`;
	return (
		<span
			className={`player-stats-game-stat ${tone}`}
			data-tooltip={tooltip}
			tabIndex={0}
			aria-label={tooltip}
		>
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
			aria-label={comparison.note}
			data-testid={testId}
		>
			{comparison.kind === 'worst' ? <PoopIcon size={10} /> : comparison.label}
		</span>
	);
}

function PoopIcon({ size }: { size: number }) {
	return (
		<svg
			className='player-stats-poop-icon'
			width={size}
			height={size}
			viewBox='0 0 256 270'
			fill='currentColor'
			aria-hidden
			focusable='false'
		>
			<path d='M127.4 18c29.8 21.2 44.8 44.8 44.8 70.8 0 7.4-1.5 14.2-4.4 20.4 26.8 8.2 45.6 28.8 45.6 53.2 0 5.5-.9 10.8-2.8 15.8 19.3 7.7 31.4 22 31.4 38.4 0 25.1-28.3 45.4-63.2 45.4H77.2C42.3 262 14 241.7 14 216.6c0-16.4 12.1-30.7 31.4-38.4a45.5 45.5 0 0 1-2.8-15.8c0-25.8 21-47.4 50.2-54.2-5.1-7.1-7.7-15.5-7.7-25.1 0-24.1 18.8-42.9 52.3-65.1Z' />
			<path
				fill='#fff'
				d='M86 162c0-8.8 6.7-15 15.1-15s15.1 6.2 15.1 15-6.7 15-15.1 15S86 170.8 86 162Zm53.8 0c0-8.8 6.7-15 15.1-15s15.1 6.2 15.1 15-6.7 15-15.1 15-15.1-6.2-15.1-15Zm-42.5 37.5c5.8 7.1 16 11.4 30.7 11.4s24.9-4.3 30.7-11.4c2.6-3.2 7.3-3.7 10.5-1.1s3.7 7.3 1.1 10.5c-9 11-23.3 16.9-42.3 16.9s-33.3-5.9-42.3-16.9c-2.6-3.2-2.1-7.9 1.1-10.5s7.9-2.1 10.5 1.1Z'
			/>
		</svg>
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
