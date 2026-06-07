import type { GameHistoryEntry, GameHistoryPlayerStats } from '../utils/types';

export interface PlayerStatsGame {
	roomCode: string;
	endedAt: string;
	players: string[];
	status: GameHistoryEntry['status'];
	score: number;
	turns: number;
	rounds: number;
	livesRemaining: number;
	hintsRemaining: number;
	maxLives: number;
	maxHints: number;
	hintsGiven: number;
	hintsReceived: number;
	plays: number;
	discards: number;
}

export interface PlayerStatsAggregate {
	id: string;
	name: string;
	isCurrentUser: boolean;
	gamesPlayed: number;
	wins: number;
	losses: number;
	finishes: number;
	totalScore: number;
	averageScore: number;
	medianScore: number;
	totalTurns: number;
	averageTurns: number;
	medianTurns: number;
	totalRounds: number;
	averageRounds: number;
	medianRounds: number;
	totalHintsGiven: number;
	averageHintsGiven: number;
	medianHintsGiven: number;
	totalHintsReceived: number;
	averageHintsReceived: number;
	medianHintsReceived: number;
	totalPlays: number;
	averagePlays: number;
	medianPlays: number;
	totalDiscards: number;
	averageDiscards: number;
	medianDiscards: number;
	games: PlayerStatsGame[];
	lastPlayedAt: string;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid];
	return (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function fallbackPlayerStats(game: GameHistoryEntry): GameHistoryPlayerStats[] {
	return game.players.map(name => ({
		id: `name:${name}`,
		name,
		hintsGiven: 0,
		hintsReceived: 0,
		plays: 0,
		discards: 0,
	}));
}

function getPlayerStats(game: GameHistoryEntry): GameHistoryPlayerStats[] {
	const playerStats = (game as { playerStats?: GameHistoryPlayerStats[] }).playerStats;
	return playerStats?.length ? playerStats : fallbackPlayerStats(game);
}

function roundsForGame(game: GameHistoryEntry, playerCount: number): number {
	return Math.max(1, Math.ceil(game.turns / Math.max(1, playerCount)));
}

export function aggregatePlayerStats(
	history: GameHistoryEntry[],
	currentPlayerId: string | null,
): PlayerStatsAggregate[] {
	const byPlayer = new Map<string, { id: string; name: string; games: PlayerStatsGame[] }>();

	for (const game of history) {
		const rows = getPlayerStats(game);
		const rounds = roundsForGame(game, rows.length);

		for (const row of rows) {
			const current = byPlayer.get(row.id) ?? { id: row.id, name: row.name, games: [] };
			current.name = row.name;
			current.games.push({
				roomCode: game.roomCode,
				endedAt: game.endedAt,
				players: [...game.players],
				status: game.status,
				score: game.score,
				turns: game.turns,
				rounds,
				livesRemaining: game.livesRemaining ?? 0,
				hintsRemaining: game.hintsRemaining ?? 0,
				maxLives: game.maxLives ?? 0,
				maxHints: game.maxHints ?? 0,
				hintsGiven: row.hintsGiven,
				hintsReceived: row.hintsReceived,
				plays: row.plays,
				discards: row.discards,
			});
			byPlayer.set(row.id, current);
		}
	}

	return [...byPlayer.values()]
		.map(player => {
			const games = [...player.games].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
			const scores = games.map(game => game.score);
			const turns = games.map(game => game.turns);
			const rounds = games.map(game => game.rounds);
			const hintsGiven = games.map(game => game.hintsGiven);
			const hintsReceived = games.map(game => game.hintsReceived);
			const plays = games.map(game => game.plays);
			const discards = games.map(game => game.discards);

			return {
				id: player.id,
				name: player.name,
				isCurrentUser: player.id === currentPlayerId,
				gamesPlayed: games.length,
				wins: games.filter(game => game.status === 'won').length,
				losses: games.filter(game => game.status === 'lost').length,
				finishes: games.filter(game => game.status === 'finished').length,
				totalScore: sum(scores),
				averageScore: average(scores),
				medianScore: median(scores),
				totalTurns: sum(turns),
				averageTurns: average(turns),
				medianTurns: median(turns),
				totalRounds: sum(rounds),
				averageRounds: average(rounds),
				medianRounds: median(rounds),
				totalHintsGiven: sum(hintsGiven),
				averageHintsGiven: average(hintsGiven),
				medianHintsGiven: median(hintsGiven),
				totalHintsReceived: sum(hintsReceived),
				averageHintsReceived: average(hintsReceived),
				medianHintsReceived: median(hintsReceived),
				totalPlays: sum(plays),
				averagePlays: average(plays),
				medianPlays: median(plays),
				totalDiscards: sum(discards),
				averageDiscards: average(discards),
				medianDiscards: median(discards),
				games,
				lastPlayedAt: games[0]?.endedAt ?? '',
			};
		})
		.sort((a, b) => {
			if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
			if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
			if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
			return a.name.localeCompare(b.name);
		});
}
