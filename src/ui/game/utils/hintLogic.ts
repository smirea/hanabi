import type { CardId, CardNumber, HanabiState, PlayerId, Suit } from '../../../game';
import { areArraysEqual } from '../../../utils/arrays';

function doesCardMatchColorHint(settings: HanabiState['settings'], cardSuit: Suit, hintSuit: Suit): boolean {
  if (cardSuit === hintSuit) {
    return true;
  }

  return settings.multicolorWildHints && cardSuit === 'M' && hintSuit !== 'M';
}

export type HintRedundancy =
  | { hintType: 'number'; number: CardNumber }
  | { hintType: 'color'; suit: Suit };

function getHintTouchedCardIds(state: HanabiState, targetPlayerId: PlayerId, hint: HintRedundancy): CardId[] {
  const target = state.players.find((player) => player.id === targetPlayerId);
  if (!target) {
    return [];
  }

  if (hint.hintType === 'number') {
    return target.cards.filter((cardId) => state.cards[cardId]?.number === hint.number);
  }

  return target.cards.filter((cardId) => {
    const card = state.cards[cardId];
    if (!card) {
      return false;
    }

    return doesCardMatchColorHint(state.settings, card.suit, hint.suit);
  });
}

export function isRedundantHint(state: HanabiState, targetPlayerId: PlayerId, hint: HintRedundancy): { redundant: boolean; touchedCardIds: CardId[] } {
  const target = state.players.find((player) => player.id === targetPlayerId);
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

  if (state.settings.multicolorWildHints && hint.suit !== 'M') {
    const allowedSuits: Suit[] = [hint.suit, 'M'];
    for (const cardId of target.cards) {
      const card = state.cards[cardId];
      if (!card) {
        continue;
      }

      const touched = touchedSet.has(cardId);
      const currentPossibleSuits = card.hints.color !== null
        ? [card.hints.color]
        : state.settings.activeSuits.filter((suit) => !card.hints.notColors.includes(suit));
      const nextPossibleSuits = touched
        ? currentPossibleSuits.filter((candidate) => allowedSuits.includes(candidate))
        : currentPossibleSuits.filter((candidate) => !allowedSuits.includes(candidate));

      if (!areArraysEqual(currentPossibleSuits, nextPossibleSuits)) {
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
      if (card.hints.color !== hint.suit || card.hints.notColors.includes(hint.suit)) {
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

export function isKnownRedundantPlay(state: HanabiState, cardId: CardId): boolean {
  const card = state.cards[cardId];
  if (!card) {
    return false;
  }

  const knownColor = card.hints.color;
  const knownNumber = card.hints.number;
  if (knownColor === null || knownNumber === null) {
    return false;
  }

  return state.fireworks[knownColor].length >= knownNumber;
}
