import { useCallback, useState } from 'react';
import type { CardId, PlayerId } from '../../../game';
import type { PendingCardAction } from './useCardActionHandlers';

export function useTransientActionState(): {
  pendingAction: PendingCardAction;
  setPendingAction: (next: PendingCardAction) => void;
  wildColorHintTargetPlayerId: PlayerId | null;
  setWildColorHintTargetPlayerId: (next: PlayerId | null) => void;
  redundantPlayConfirmCardId: CardId | null;
  setRedundantPlayConfirmCardId: (next: CardId | null) => void;
  clearActionDraft: () => void;
  clearHintDraft: () => void;
} {
  const [pendingAction, setPendingAction] = useState<PendingCardAction>(null);
  const [wildColorHintTargetPlayerId, setWildColorHintTargetPlayerId] = useState<PlayerId | null>(null);
  const [redundantPlayConfirmCardId, setRedundantPlayConfirmCardId] = useState<CardId | null>(null);

  const clearHintDraft = useCallback(() => {
    setWildColorHintTargetPlayerId(null);
    setRedundantPlayConfirmCardId(null);
  }, []);

  const clearActionDraft = useCallback(() => {
    setPendingAction(null);
    clearHintDraft();
  }, [clearHintDraft]);

  return {
    pendingAction,
    setPendingAction,
    wildColorHintTargetPlayerId,
    setWildColorHintTargetPlayerId,
    redundantPlayConfirmCardId,
    setRedundantPlayConfirmCardId,
    clearActionDraft,
    clearHintDraft
  };
}
