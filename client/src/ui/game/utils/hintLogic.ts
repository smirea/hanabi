import type { CardId, CardNumber, HanabiState, PlayerId, Suit } from '../../../game';

function doesCardMatchColorHint(
	settings: HanabiState['settings'],
	cardSuit: Suit,
	hintSuit: Suit,
): boolean {
	if (cardSuit === 'K' || hintSuit === 'K') {
		return false;
	}

	if (cardSuit === hintSuit) {
		return true;
	}

	return settings.includeMulticolor && cardSuit === 'M' && hintSuit !== 'M';
}

function nextKnownColorForTouchedHint(
	knownColor: Suit | null,
	hintSuit: Suit,
	includeMulticolor: boolean,
): Suit {
	if (knownColor === null) {
		return hintSuit;
	}

	if (knownColor === hintSuit || knownColor === 'M') {
		return knownColor;
	}

	return includeMulticolor ? 'M' : hintSuit;
}

export type HintRedundancy =
	| { hintType: 'number'; number: CardNumber }
	| { hintType: 'color'; suit: Suit };

function getHintTouchedCardIds(
	state: HanabiState,
	targetPlayerId: PlayerId,
	hint: HintRedundancy,
): CardId[] {
	const target = state.players.find(player => player.id === targetPlayerId);
	if (!target) {
		return [];
	}

	if (hint.hintType === 'number') {
		return target.cards.filter(cardId => state.cards[cardId]?.number === hint.number);
	}

	return target.cards.filter(cardId => {
		const card = state.cards[cardId];
		if (!card) {
			return false;
		}

		return doesCardMatchColorHint(state.settings, card.suit, hint.suit);
	});
}

export function isRedundantHint(
	state: HanabiState,
	targetPlayerId: PlayerId,
	hint: HintRedundancy,
): { redundant: boolean; touchedCardIds: CardId[] } {
	const target = state.players.find(player => player.id === targetPlayerId);
	if (!target) {
		return { redundant: false, touchedCardIds: [] };
	}

	const touchedCardIds = getHintTouchedCardIds(state, targetPlayerId, hint);
	const touchedSet = new Set(touchedCardIds);

	let wouldChange = false;
	if (hint.hintType === 'number') {
		for (const cardId of target.cards) {
			const card = state.cards[cardId];
			if (!card) {
				continue;
			}

			if (touchedSet.has(cardId)) {
				if (card.hints.number !== hint.number || card.hints.notNumbers.includes(hint.number)) {
					wouldChange = true;
					break;
				}
			} else if (!card.hints.notNumbers.includes(hint.number)) {
				wouldChange = true;
				break;
			}
		}

		return { redundant: !wouldChange, touchedCardIds };
	}

	for (const cardId of target.cards) {
		const card = state.cards[cardId];
		if (!card) {
			continue;
		}

		if (touchedSet.has(cardId)) {
			const nextColor = nextKnownColorForTouchedHint(
				card.hints.color,
				hint.suit,
				state.settings.includeMulticolor,
			);
			if (nextColor !== card.hints.color || card.hints.notColors.includes(hint.suit)) {
				wouldChange = true;
				break;
			}
		} else if (!card.hints.notColors.includes(hint.suit)) {
			wouldChange = true;
			break;
		}
	}

	return { redundant: !wouldChange, touchedCardIds };
}
