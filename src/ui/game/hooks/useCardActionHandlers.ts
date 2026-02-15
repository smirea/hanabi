import type { CardId, HanabiState, PlayerId, Suit } from '../../../game';
import type { NetworkAction } from '../../../network';
import { isKnownRedundantPlay, isRedundantHint } from '../utils/hintLogic';

export type PendingCardAction = 'play' | 'discard' | 'hint-color' | 'hint-number' | null;

export type ResolvedCardSelection =
  | { kind: 'noop' }
  | { kind: 'arm-redundant-play'; cardId: CardId }
  | { kind: 'wild-color-picker'; targetPlayerId: PlayerId }
  | { kind: 'redundant-hint'; touchedCardIds: CardId[] }
  | { kind: 'action'; action: NetworkAction };

export function resolveCardSelectionAction({
  state,
  actorId,
  pendingAction,
  playerId,
  cardId,
  redundantPlayConfirmCardId
}: {
  state: HanabiState;
  actorId: PlayerId;
  pendingAction: PendingCardAction;
  playerId: PlayerId;
  cardId: CardId;
  redundantPlayConfirmCardId: CardId | null;
}): ResolvedCardSelection {
  if (!pendingAction) {
    return { kind: 'noop' };
  }

  const currentPlayer = state.players[state.currentTurnPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== actorId) {
    return { kind: 'noop' };
  }

  const selectedCard = state.cards[cardId];
  if (!selectedCard) {
    return { kind: 'noop' };
  }

  if (pendingAction === 'play') {
    if (playerId !== actorId) {
      return { kind: 'noop' };
    }

    if (isKnownRedundantPlay(state, cardId) && redundantPlayConfirmCardId !== cardId) {
      return { kind: 'arm-redundant-play', cardId };
    }

    return {
      kind: 'action',
      action: {
        type: 'play',
        actorId,
        cardId
      }
    };
  }

  if (pendingAction === 'discard') {
    if (playerId !== actorId) {
      return { kind: 'noop' };
    }

    return {
      kind: 'action',
      action: {
        type: 'discard',
        actorId,
        cardId
      }
    };
  }

  if (pendingAction === 'hint-color') {
    if (playerId === actorId) {
      return { kind: 'noop' };
    }

    if (state.settings.multicolorWildHints && selectedCard.suit === 'M') {
      return { kind: 'wild-color-picker', targetPlayerId: playerId };
    }

    const { redundant, touchedCardIds } = isRedundantHint(state, playerId, { hintType: 'color', suit: selectedCard.suit });
    if (redundant) {
      return { kind: 'redundant-hint', touchedCardIds };
    }

    return {
      kind: 'action',
      action: {
        type: 'hint-color',
        actorId,
        targetPlayerId: playerId,
        suit: selectedCard.suit
      }
    };
  }

  if (playerId === actorId) {
    return { kind: 'noop' };
  }

  const { redundant, touchedCardIds } = isRedundantHint(state, playerId, { hintType: 'number', number: selectedCard.number });
  if (redundant) {
    return { kind: 'redundant-hint', touchedCardIds };
  }

  return {
    kind: 'action',
    action: {
      type: 'hint-number',
      actorId,
      targetPlayerId: playerId,
      number: selectedCard.number
    }
  };
}

export type ResolvedDirectColorHint =
  | { kind: 'noop' }
  | { kind: 'redundant-hint'; touchedCardIds: CardId[] }
  | { kind: 'action'; action: NetworkAction };

export function resolveDirectColorHintAction({
  state,
  actorId,
  targetPlayerId,
  suit
}: {
  state: HanabiState;
  actorId: PlayerId;
  targetPlayerId: PlayerId;
  suit: Suit;
}): ResolvedDirectColorHint {
  const currentPlayer = state.players[state.currentTurnPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== actorId || targetPlayerId === actorId) {
    return { kind: 'noop' };
  }

  const { redundant, touchedCardIds } = isRedundantHint(state, targetPlayerId, { hintType: 'color', suit });
  if (redundant) {
    return { kind: 'redundant-hint', touchedCardIds };
  }

  return {
    kind: 'action',
    action: {
      type: 'hint-color',
      actorId,
      targetPlayerId,
      suit
    }
  };
}
