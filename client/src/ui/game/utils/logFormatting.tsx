import type { ReactNode } from 'react';
import type { GameLogEntry } from '../../../game';
import { LogCardChip, LogHintChipNumber, LogHintChipSuit } from '../components/LogChips';

export function renderLogMessage(log: GameLogEntry): ReactNode {
	if (log.type === 'hint') {
		const touchedCount = log.touchedCardIds.length;
		if (log.hintType === 'number') {
			if (log.number === null) return `${log.actorName} gave a number hint to ${log.targetName}`;
			return (
				<>
					{log.actorName} {log.free ? 'bonus hinted' : 'hinted'} {touchedCount}x{' '}
					<LogHintChipNumber number={log.number} /> to {log.targetName}
				</>
			);
		}

		if (log.suit === null) return `${log.actorName} gave a color hint to ${log.targetName}`;
		return (
			<>
				{log.actorName} {log.free ? 'bonus hinted' : 'hinted'} {touchedCount}x{' '}
				<LogHintChipSuit suit={log.suit} /> to {log.targetName}
			</>
		);
	}

	if (log.type === 'play') {
		if (log.success) {
			return (
				<>
					{log.actorName} played <LogCardChip suit={log.suit} number={log.number} />
				</>
			);
		}

		return (
			<>
				{log.actorName} misplayed <LogCardChip suit={log.suit} number={log.number} /> and burned a
				fuse
			</>
		);
	}

	if (log.type === 'discard') {
		if (log.gainedHint) {
			return (
				<>
					{log.actorName} discarded <LogCardChip suit={log.suit} number={log.number} /> and regained
					a hint
				</>
			);
		}

		return (
			<>
				{log.actorName} discarded <LogCardChip suit={log.suit} number={log.number} />
			</>
		);
	}

	if (log.type === 'draw') {
		return `${log.actorName} drew a card (${log.remainingDeck} left)`;
	}

	if (log.type === 'bonus') {
		if (log.skipped) {
			return `${log.actorName} revealed a bonus with no effect`;
		}

		if (log.effect === 'gain-hint') {
			return log.gainedHint
				? `${log.actorName} gained a bonus hint`
				: `${log.actorName} revealed a bonus hint at max`;
		}

		if (log.effect === 'recover-fuse-and-gain-hint') {
			if (log.recoveredFuse && log.gainedHint) {
				return `${log.actorName} recovered a fuse and gained a hint`;
			}
			if (log.recoveredFuse) return `${log.actorName} recovered a fuse`;
			if (log.gainedHint) return `${log.actorName} gained a bonus hint`;
			return `${log.actorName} revealed a recovery bonus at max`;
		}

		if (log.effect === 'shuffle-discard' && log.suit && log.number) {
			return (
				<>
					{log.actorName} shuffled <LogCardChip suit={log.suit} number={log.number} /> back
				</>
			);
		}

		if (log.effect === 'play-discard' && log.suit && log.number) {
			return (
				<>
					{log.actorName} replayed <LogCardChip suit={log.suit} number={log.number} />
				</>
			);
		}

		return `${log.actorName} resolved a bonus`;
	}

	if (log.status === 'won') {
		return `Game won with score ${log.score}`;
	}

	if (log.status === 'lost') {
		return `Game lost with score ${log.score}`;
	}

	if (log.reason === 'final_round_complete') {
		return `Final round complete with score ${log.score}`;
	}

	if (log.reason === 'no_valid_plays_left') {
		return `No valid plays left with score ${log.score}`;
	}

	return `Game finished with score ${log.score}`;
}

export function getLogBadge(log: GameLogEntry): string {
	if (log.type === 'hint') return 'Hint';
	if (log.type === 'play') return 'Play';
	if (log.type === 'discard') return 'Discard';
	if (log.type === 'draw') return 'Draw';
	if (log.type === 'bonus') return 'Bonus';
	return 'Status';
}
