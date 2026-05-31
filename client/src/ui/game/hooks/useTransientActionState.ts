import { useCallback, useState } from 'react';
import type { PlayerId } from '../../../game';
import type { PendingCardAction } from './useCardActionHandlers';

export function useTransientActionState(): {
	pendingAction: PendingCardAction;
	setPendingAction: (next: PendingCardAction) => void;
	wildColorHintTargetPlayerId: PlayerId | null;
	setWildColorHintTargetPlayerId: (next: PlayerId | null) => void;
	clearActionDraft: () => void;
	clearHintDraft: () => void;
} {
	const [pendingAction, setPendingAction] = useState<PendingCardAction>(null);
	const [wildColorHintTargetPlayerId, setWildColorHintTargetPlayerId] = useState<PlayerId | null>(
		null,
	);

	const clearHintDraft = useCallback(() => {
		setWildColorHintTargetPlayerId(null);
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
		clearActionDraft,
		clearHintDraft,
	};
}
