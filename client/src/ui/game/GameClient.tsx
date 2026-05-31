import { CardsThree, Fire, LightbulbFilament, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
	BASE_SUITS,
	HanabiGame,
	type CardId,
	type HanabiState,
	type HanabiPerspectiveState,
	type PerspectiveCard,
	type PlayerId,
	type Suit,
	getFireworkCardNumbers,
	getNextFireworkNumber,
	isFireworkCardPlayed,
} from '../../game';
import { useDebugScreensController } from '../../debugScreens';
import { cloneLobbySettings, playerIdForUser, sanitizePlayerName } from '../../onlineGame';
import { useAppVersion, useOnlineRoom } from '../../hooks/useGameServer';
import { storageKeys, suitColors, suitNames } from '../../utils/constants';
import { useLocalStorage } from '../../utils/utils';
import type { GameAction, LobbySettings, RoomViewState } from '../../utils/types';
import { CardView } from './components/CardView';
import { DeckCount } from './components/DeckCount';
import { LastActionTicker } from './components/LastActionTicker';
import { PegPips, getPegPipStates } from './components/PegPips';
import { RulesDrawer } from './components/RulesDrawer';
import { SuitSymbol } from './components/SuitSymbol';
import { EndgameOverlay } from './screens/EndgameOverlay';
import { LobbyScreen } from './screens/LobbyScreen';
import { LobbyWaitingForSnapshot } from './screens/LobbyWaitingForSnapshot';
import { TvScreen } from './screens/TvScreen';
import {
	type PendingCardAction,
	resolveCardSelectionAction,
	resolveDirectColorHintAction,
} from './hooks/useCardActionHandlers';
import { useGameAnimations } from './hooks/useGameAnimations';
import { useTransientActionState } from './hooks/useTransientActionState';
import { getLogBadge, renderLogMessage } from './utils/logFormatting';

const LOCAL_DEBUG_SETUP = {
	playerNames: ['Ari', 'Blair', 'Casey'],
	playerIds: ['p1', 'p2', 'p3'],
	shuffleSeed: 17,
};

const DISCONNECTED_ROOM_VIEW_STATE: RoomViewState = {
	status: 'idle',
	selfId: null,
	selfPlayerId: null,
	snapshotVersion: 0,
	phase: 'lobby',
	members: [],
	settings: cloneLobbySettings(),
	gameState: null,
};

function isTerminalStatus(status: HanabiPerspectiveState['status']): boolean {
	return status === 'won' || status === 'lost' || status === 'finished';
}

function isBonusHintEffect(effect: string): boolean {
	return effect === 'free-color-hint' || effect === 'free-number-hint';
}

async function writeToClipboard(text: string): Promise<void> {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	if (typeof document === 'undefined') {
		throw new Error('Clipboard is unavailable in this runtime');
	}

	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', 'true');
	textarea.style.position = 'fixed';
	textarea.style.opacity = '0';
	textarea.style.left = '-9999px';
	textarea.style.top = '0';
	document.body.appendChild(textarea);
	textarea.select();
	textarea.setSelectionRange(0, textarea.value.length);
	const ok = document.execCommand('copy');
	textarea.remove();
	if (!ok) {
		throw new Error('Failed to copy to clipboard');
	}
}

function parseHanabiStatePayload(rawText: string): HanabiState {
	const parsed = JSON.parse(rawText) as HanabiState | { state: HanabiState };
	return HanabiGame.fromState(
		(parsed as { state?: HanabiState }).state ?? (parsed as HanabiState),
	).getSnapshot();
}

function GameClient({
	roomId,
	isDarkMode,
	onToggleDarkMode,
	onLeaveRoom,
}: {
	roomId: string;
	isDarkMode: boolean;
	onToggleDarkMode: () => void;
	onLeaveRoom: (() => void) | null;
}) {
	const gameRef = useRef<HanabiGame | null>(null);
	if (!gameRef.current) {
		gameRef.current = new HanabiGame(LOCAL_DEBUG_SETUP);
	}

	const debugGame = gameRef.current;
	const [debugGameState, setDebugGameState] = useState(() => debugGame.getSnapshot());
	const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
	const [isLogDrawerMounted, setIsLogDrawerMounted] = useState(false);
	const [isRulesDrawerOpen, setIsRulesDrawerOpen] = useState(false);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isLeaveGameArmed, setIsLeaveGameArmed] = useState(false);
	const [endgamePanel, setEndgamePanel] = useState<'summary' | 'log'>('summary');
	const [dismissedEndgameKey, setDismissedEndgameKey] = useState<string | null>(null);
	const {
		pendingAction,
		setPendingAction,
		wildColorHintTargetPlayerId,
		setWildColorHintTargetPlayerId,
		clearActionDraft,
		clearHintDraft,
	} = useTransientActionState();
	const [isDebugMode, setIsDebugMode] = useLocalStorage(storageKeys.debugMode, false);
	const [playerName, setPlayerName] = useLocalStorage(storageKeys.playerName, '');
	const [showNegativeColorHints, setShowNegativeColorHints] = useLocalStorage(
		storageKeys.negativeColorHints,
		true,
	);
	const [showNegativeNumberHints, setShowNegativeNumberHints] = useLocalStorage(
		storageKeys.negativeNumberHints,
		true,
	);
	const [turnSoundEnabled, setTurnSoundEnabled] = useLocalStorage(
		storageKeys.turnSoundEnabled,
		true,
	);
	const [isTibiMode, setIsTibiMode] = useLocalStorage(storageKeys.tibiMode, false);
	const [storedTvMode, setStoredTvMode] = useLocalStorage(storageKeys.tvMode, false);
	const { versionText } = useAppVersion();
	const logListRef = useRef<HTMLDivElement | null>(null);
	const logDrawerTokenRef = useRef(0);
	const logDrawerCloseTimeoutRef = useRef<number | null>(null);

	const isLocalDebugMode = isDebugMode;
	const onlineRoom = useOnlineRoom(roomId, playerName, !isLocalDebugMode);
	const connectionState = useMemo(() => {
		if (isLocalDebugMode) return DISCONNECTED_ROOM_VIEW_STATE;
		if (onlineRoom.room) return onlineRoom.room;
		return {
			...DISCONNECTED_ROOM_VIEW_STATE,
			status: 'connecting' as const,
			selfId: onlineRoom.user ? String(onlineRoom.user.id) : null,
			selfPlayerId: onlineRoom.user ? playerIdForUser(onlineRoom.user.id) : null,
		};
	}, [isLocalDebugMode, onlineRoom.room, onlineRoom.user]);
	const leaveOnlineRoom = useCallback(() => {
		const actorId = connectionState.selfPlayerId;
		if (isLocalDebugMode || !actorId) {
			onLeaveRoom?.();
			return;
		}

		void onlineRoom
			.sendAction({ type: 'leave', actorId })
			.finally(() => {
				onLeaveRoom?.();
			});
	}, [connectionState.selfPlayerId, isLocalDebugMode, onLeaveRoom, onlineRoom]);

	useEffect(() => {
		if (!isLocalDebugMode && onlineRoom.wasKicked) {
			onLeaveRoom?.();
		}
	}, [isLocalDebugMode, onLeaveRoom, onlineRoom.wasKicked]);

	useEffect(() => {
		if (isLocalDebugMode || !connectionState.selfPlayerId) {
			return;
		}

		if (connectionState.phase !== 'lobby') {
			return;
		}

		const memberName =
			connectionState.members.find(member => member.id === connectionState.selfPlayerId)?.name ??
			null;
		if (!memberName) {
			return;
		}

		const sanitizedLocalName = sanitizePlayerName(playerName);
		if (!sanitizedLocalName) {
			if (memberName !== playerName) {
				setPlayerName(memberName);
			}
			return;
		}

		if (memberName === sanitizedLocalName || memberName === playerName) {
			return;
		}

		const normalizedMemberName = memberName.trim().replace(/\s+/g, ' ').toLowerCase();
		const normalizedDesiredName = sanitizedLocalName.trim().replace(/\s+/g, ' ').toLowerCase();
		const disambiguated = normalizedMemberName.match(/^(.*) (\d+)$/);
		if (!disambiguated) {
			return;
		}

		const base = disambiguated[1]?.trim() ?? '';
		if (base.length === 0) {
			return;
		}

		if (normalizedDesiredName === base) {
			setPlayerName(memberName);
		}
	}, [
		connectionState.members,
		connectionState.phase,
		connectionState.selfPlayerId,
		isLocalDebugMode,
		playerName,
		setPlayerName,
	]);

	useEffect(() => {
		if (
			isLocalDebugMode ||
			!storedTvMode ||
			!connectionState.selfPlayerId ||
			connectionState.status !== 'connected'
		) {
			return;
		}
		if (connectionState.phase !== 'lobby') {
			return;
		}
		const current =
			connectionState.members.find(member => member.id === connectionState.selfPlayerId)?.isTv ??
			false;
		if (current !== storedTvMode) {
			toggleOnlineSpectator(storedTvMode);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [connectionState.members, connectionState.selfPlayerId, connectionState.status, storedTvMode]);

	const onlineGameState = useMemo(() => {
		if (!connectionState.gameState) {
			return null;
		}

		return JSON.parse(JSON.stringify(connectionState.gameState)) as HanabiState;
	}, [connectionState.gameState]);
	const activeGameState = isLocalDebugMode ? debugGameState : onlineGameState;
	const terminalStatusLogId = useMemo(() => {
		if (!activeGameState) {
			return null;
		}

		for (let index = activeGameState.logs.length - 1; index >= 0; index -= 1) {
			const log = activeGameState.logs[index];
			if (log.type === 'status') {
				return log.id;
			}
		}

		return null;
	}, [activeGameState]);
	const endgameStatsByPlayerId = useMemo(() => {
		const stats = new Map<
			PlayerId,
			{ hintsGiven: number; hintsReceived: number; plays: number; discards: number }
		>();
		if (!activeGameState) {
			return stats;
		}

		for (const player of activeGameState.players) {
			stats.set(player.id, { hintsGiven: 0, hintsReceived: 0, plays: 0, discards: 0 });
		}

		for (const log of activeGameState.logs) {
			if (log.type === 'hint') {
				const actor = stats.get(log.actorId);
				const target = stats.get(log.targetId);
				if (actor) actor.hintsGiven += 1;
				if (target) target.hintsReceived += 1;
				continue;
			}

			if (log.type === 'play') {
				const actor = stats.get(log.actorId);
				if (actor) actor.plays += 1;
				continue;
			}

			if (log.type === 'discard') {
				const actor = stats.get(log.actorId);
				if (actor) actor.discards += 1;
			}
		}

		return stats;
	}, [activeGameState]);
	useEffect(() => {
		setEndgamePanel('summary');
		setDismissedEndgameKey(null);
	}, [terminalStatusLogId]);
	const discardCounts = useMemo(() => {
		const counts = new Map<string, number>();
		if (!activeGameState) {
			return counts;
		}

		for (const cardId of activeGameState.discardPile) {
			const card = activeGameState.cards[cardId];
			if (!card) {
				continue;
			}

			const key = `${card.suit}-${card.number}`;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}

		return counts;
	}, [activeGameState]);
	const finalHands = useMemo(() => {
		if (!activeGameState) {
			return [];
		}

		return activeGameState.players.map(player => ({
			id: player.id,
			name: player.name,
			cards: player.cards.map(cardId => {
				const card = activeGameState.cards[cardId];
				if (!card) {
					throw new Error(`Unknown final hand card: ${cardId}`);
				}

				return {
					id: card.id,
					suit: card.suit,
					number: card.number,
					hints: {
						...card.hints,
						notColors: [...card.hints.notColors],
						notNumbers: [...card.hints.notNumbers],
					},
					isHiddenFromViewer: false,
				} satisfies PerspectiveCard;
			}),
		}));
	}, [activeGameState]);
	const activeGame = useMemo(() => {
		if (isLocalDebugMode) {
			return debugGame;
		}

		if (!onlineGameState) {
			return null;
		}

		return HanabiGame.fromState(onlineGameState);
	}, [debugGame, isLocalDebugMode, onlineGameState]);

	const onlineSelfPlayerId = useMemo(() => {
		if (isLocalDebugMode || !connectionState.selfPlayerId || !onlineGameState) {
			return null;
		}

		const isActivePlayer = onlineGameState.players.some(
			player => player.id === connectionState.selfPlayerId,
		);
		if (!isActivePlayer) {
			return null;
		}

		const isSpectator =
			connectionState.members.find(member => member.id === connectionState.selfPlayerId)?.isTv ??
			false;
		return isSpectator ? null : connectionState.selfPlayerId;
	}, [connectionState.members, connectionState.selfPlayerId, isLocalDebugMode, onlineGameState]);

	const isOnlineParticipant = useMemo(() => {
		return onlineSelfPlayerId !== null;
	}, [onlineSelfPlayerId]);

	const isOnlineTvMember = useMemo(() => {
		if (isLocalDebugMode || !connectionState.selfPlayerId) {
			return false;
		}

		return (
			connectionState.members.find(member => member.id === connectionState.selfPlayerId)?.isTv ??
			false
		);
	}, [connectionState.members, connectionState.selfPlayerId, isLocalDebugMode]);

	const isTvClient = !isLocalDebugMode && isOnlineTvMember;
	const showTv =
		isTvClient &&
		!isOnlineParticipant &&
		connectionState.phase === 'playing' &&
		onlineGameState !== null;

	const showLobby =
		!isLocalDebugMode &&
		connectionState.status === 'connected' &&
		(connectionState.phase === 'lobby' ||
			connectionState.gameState === null ||
			(!isOnlineParticipant && !showTv));

	const perspectivePlayerId = useMemo(() => {
		if (!activeGameState) {
			return null;
		}

		if (isLocalDebugMode) {
			return activeGameState.players[activeGameState.currentTurnPlayerIndex]?.id ?? null;
		}

		if (!connectionState.selfPlayerId) {
			return null;
		}

		return onlineSelfPlayerId;
	}, [activeGameState, connectionState.selfPlayerId, isLocalDebugMode, onlineSelfPlayerId]);

	const perspective = useMemo(() => {
		if (!activeGame || !perspectivePlayerId) {
			return null;
		}

		return activeGame.getPerspectiveState(perspectivePlayerId);
	}, [activeGame, activeGameState, perspectivePlayerId]);
	const visibleOtherHandCounts = useMemo(() => {
		const counts = new Map<string, number>();
		if (!perspective) {
			return counts;
		}

		for (const player of perspective.players) {
			if (player.isViewer) {
				continue;
			}

			for (const card of player.cards) {
				if (card.suit === null || card.number === null) {
					continue;
				}

				const key = `${card.suit}-${card.number}`;
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}

		return counts;
	}, [perspective]);

	const {
		animationLayerRef,
		deckPillRef,
		cardNodeByIdRef,
		playerNameNodeByIdRef,
		hintTokenSlotRefs,
		fuseTokenSlotRefs,
		isActionAnimationRunning,
		turnLockPlayerId,
		triggerCardFx,
		resetAnimations,
	} = useGameAnimations({
		activeGameState,
		perspective,
		isLocalDebugMode,
		turnSoundEnabled,
	});

	const resetUiForDebugScreens = useCallback(() => {
		resetAnimations();
		setIsMenuOpen(false);
		setIsLogDrawerOpen(false);
		setIsLogDrawerMounted(false);
		clearActionDraft();
		setEndgamePanel('summary');
	}, [clearActionDraft, resetAnimations]);

	useDebugScreensController({
		enabled: true,
		setIsDebugMode,
		debugGame,
		setDebugGameState,
		resetUi: resetUiForDebugScreens,
	});

	useEffect(() => {
		if (!isLogDrawerOpen) return;
		logListRef.current?.scrollTo({ top: 0 });
	}, [isLogDrawerOpen]);

	useEffect(() => {
		return () => {
			if (logDrawerCloseTimeoutRef.current !== null) {
				window.clearTimeout(logDrawerCloseTimeoutRef.current);
				logDrawerCloseTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		clearActionDraft();
	}, [clearActionDraft, connectionState.snapshotVersion, isLocalDebugMode, perspective?.turn]);

	useEffect(() => {
		if (isLocalDebugMode) {
			return;
		}

		setIsMenuOpen(false);
	}, [isLocalDebugMode]);

	function commitLocal(command: () => void): void {
		try {
			command();
			setDebugGameState(debugGame.getSnapshot());
			clearActionDraft();
		} catch {}
	}

	function selectOnlineAction(nextAction: Exclude<PendingCardAction, null>): void {
		if (isLocalDebugMode || !perspective || !onlineSelfPlayerId) {
			return;
		}

		const isTurn = perspective.currentTurnPlayerId === onlineSelfPlayerId;
		if (!isTurn || connectionState.status !== 'connected' || isTerminalStatus(perspective.status)) {
			return;
		}

		if (
			(nextAction === 'hint-color' || nextAction === 'hint-number') &&
			perspective.hintTokens <= 0
		) {
			return;
		}

		clearHintDraft();
		setPendingAction(nextAction);
	}

	function handleActionPress(
		nextAction: Exclude<PendingCardAction, null>,
		beginLocal: () => void,
	): void {
		clearHintDraft();
		if (isLocalDebugMode) {
			setIsMenuOpen(false);
			commitLocal(beginLocal);
			return;
		}

		selectOnlineAction(nextAction);
	}

	function handlePlayPress(): void {
		handleActionPress('play', () => {
			debugGame.beginPlaySelection();
		});
	}

	function handleDiscardPress(): void {
		handleActionPress('discard', () => {
			debugGame.beginDiscardSelection();
		});
	}

	function handleHintColorPress(): void {
		handleActionPress('hint-color', () => {
			debugGame.beginColorHintSelection();
		});
	}

	function handleHintNumberPress(): void {
		handleActionPress('hint-number', () => {
			debugGame.beginNumberHintSelection();
		});
	}

	function applyRedundantHintFeedback(touchedCardIds: CardId[]): void {
		for (const touchedId of touchedCardIds) {
			triggerCardFx(touchedId, 'hint-redundant');
		}
	}

	function commitLocalAction(action: GameAction): void {
		if (action.type === 'play') {
			commitLocal(() => {
				debugGame.playCard(action.cardId);
			});
			return;
		}

		if (action.type === 'discard') {
			commitLocal(() => {
				debugGame.discardCard(action.cardId);
			});
			return;
		}

		if (action.type === 'hint-color') {
			commitLocal(() => {
				debugGame.giveColorHint(action.targetPlayerId, action.suit);
			});
			return;
		}

		if (action.type === 'hint-number') {
			commitLocal(() => {
				debugGame.giveNumberHint(action.targetPlayerId, action.number);
			});
			return;
		}

		if (action.type === 'bonus-hint-color') {
			commitLocal(() => {
				debugGame.resolveFlamboyantColorHint(action.targetPlayerId, action.suit);
			});
			return;
		}

		if (action.type === 'bonus-hint-number') {
			commitLocal(() => {
				debugGame.resolveFlamboyantNumberHint(action.targetPlayerId, action.number);
			});
			return;
		}

		if (action.type === 'bonus-shuffle-discard') {
			commitLocal(() => {
				debugGame.resolveFlamboyantShuffleDiscard(action.cardId);
			});
			return;
		}

		commitLocal(() => {
			debugGame.resolveFlamboyantPlayDiscard(action.cardId);
		});
	}

	function applyResolvedCardSelection(
		resolved: ReturnType<typeof resolveCardSelectionAction>,
		onAction: (action: GameAction) => void,
	): void {
		if (resolved.kind === 'wild-color-picker') {
			setWildColorHintTargetPlayerId(resolved.targetPlayerId);
			return;
		}

		if (resolved.kind === 'redundant-hint') {
			applyRedundantHintFeedback(resolved.touchedCardIds);
			return;
		}

		if (resolved.kind !== 'action') {
			return;
		}

		onAction(resolved.action);
	}

	function isDiscardCardPlayable(cardId: CardId): boolean {
		if (!activeGameState) {
			return false;
		}

		const card = activeGameState.cards[cardId];
		if (!card) {
			return false;
		}

		return (
			getNextFireworkNumber(card.suit, activeGameState.fireworks[card.suit].length) ===
			card.number
		);
	}

	function resolveBonusCardSelection({
		state,
		actorId,
		playerId,
		cardId,
	}: {
		state: HanabiState;
		actorId: PlayerId;
		playerId: PlayerId;
		cardId: CardId;
	}): GameAction | 'wild-color-picker' | null {
		const pendingBonus = state.pendingBonus;
		if (!pendingBonus || pendingBonus.actorId !== actorId || playerId === actorId) {
			return null;
		}

		const card = state.cards[cardId];
		if (!card) {
			return null;
		}

		if (pendingBonus.effect === 'free-color-hint') {
			if (card.suit === 'M') {
				return 'wild-color-picker';
			}

			if (card.suit === 'K') {
				return null;
			}

			return {
				type: 'bonus-hint-color',
				actorId,
				targetPlayerId: playerId,
				suit: card.suit,
			};
		}

		if (pendingBonus.effect === 'free-number-hint') {
			return {
				type: 'bonus-hint-number',
				actorId,
				targetPlayerId: playerId,
				number: card.number,
			};
		}

		return null;
	}

	function handleCardSelect(playerId: PlayerId, cardId: CardId): void {
		if (isLocalDebugMode) {
			setIsMenuOpen(false);
			const actorId = debugGame.state.players[debugGame.state.currentTurnPlayerIndex]?.id;
			if (!actorId) {
				return;
			}

			if (debugGame.state.pendingBonus) {
				const resolved = resolveBonusCardSelection({
					state: debugGame.state,
					actorId,
					playerId,
					cardId,
				});
				if (resolved === 'wild-color-picker') {
					setWildColorHintTargetPlayerId(playerId);
					return;
				}
				if (resolved) {
					commitLocalAction(resolved);
				}
				return;
			}

			const resolved = resolveCardSelectionAction({
				state: debugGame.state,
				actorId,
				pendingAction: debugGame.state.ui.pendingAction,
				playerId,
				cardId,
			});

			applyResolvedCardSelection(resolved, action => {
				commitLocalAction(action);
			});
			return;
		}

		if (!activeGameState || !onlineSelfPlayerId) {
			return;
		}

		const actorId = onlineSelfPlayerId;
		if (activeGameState.pendingBonus) {
			const resolved = resolveBonusCardSelection({
				state: activeGameState,
				actorId,
				playerId,
				cardId,
			});
			if (resolved === 'wild-color-picker') {
				setWildColorHintTargetPlayerId(playerId);
				return;
			}
			if (resolved) {
				sendOnlineGameAction(resolved);
				clearActionDraft();
			}
			return;
		}

		if (!pendingAction) {
			return;
		}

		const resolved = resolveCardSelectionAction({
			state: activeGameState,
			actorId,
			pendingAction,
			playerId,
			cardId,
		});

		applyResolvedCardSelection(resolved, action => {
			sendOnlineGameAction(action);
			clearActionDraft();
		});
	}

	function cancelWildColorPicker(): void {
		clearHintDraft();
		if (isLocalDebugMode) {
			commitLocal(() => {
				debugGame.cancelSelection();
			});
			return;
		}

		clearActionDraft();
	}

	function handleWildColorPick(suit: Suit): void {
		const targetPlayerId = wildColorHintTargetPlayerId;
		if (!targetPlayerId) {
			return;
		}

		if (suit === 'M') {
			return;
		}

		if (isLocalDebugMode) {
			const actorId = debugGame.state.players[debugGame.state.currentTurnPlayerIndex]?.id;
			if (!actorId) {
				return;
			}

			if (debugGame.state.pendingBonus?.effect === 'free-color-hint') {
				commitLocalAction({
					type: 'bonus-hint-color',
					actorId,
					targetPlayerId,
					suit,
				});
				clearHintDraft();
				return;
			}

			const resolved = resolveDirectColorHintAction({
				state: debugGame.state,
				actorId,
				targetPlayerId,
				suit,
			});
			if (resolved.kind === 'redundant-hint') {
				applyRedundantHintFeedback(resolved.touchedCardIds);
				return;
			}

			if (resolved.kind !== 'action') {
				return;
			}

			commitLocalAction(resolved.action);
			clearHintDraft();
			return;
		}

		if (!activeGameState || !onlineSelfPlayerId) {
			return;
		}

		if (activeGameState.pendingBonus?.effect === 'free-color-hint') {
			sendOnlineGameAction({
				type: 'bonus-hint-color',
				actorId: onlineSelfPlayerId,
				targetPlayerId,
				suit,
			});
			clearActionDraft();
			return;
		}

		const resolved = resolveDirectColorHintAction({
			state: activeGameState,
			actorId: onlineSelfPlayerId,
			targetPlayerId,
			suit,
		});
		if (resolved.kind === 'redundant-hint') {
			applyRedundantHintFeedback(resolved.touchedCardIds);
			return;
		}

		if (resolved.kind !== 'action') {
			clearActionDraft();
			return;
		}

		sendOnlineGameAction(resolved.action);
		clearActionDraft();
	}

	function openLogDrawer(): void {
		if (isLogDrawerOpen) return;
		setIsMenuOpen(false);
		setIsLeaveGameArmed(false);

		if (logDrawerCloseTimeoutRef.current !== null) {
			window.clearTimeout(logDrawerCloseTimeoutRef.current);
			logDrawerCloseTimeoutRef.current = null;
		}

		const token = logDrawerTokenRef.current + 1;
		logDrawerTokenRef.current = token;
		setIsLogDrawerMounted(true);

		const scheduleOpen =
			typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
				? window.requestAnimationFrame
				: (callback: FrameRequestCallback) =>
						window.setTimeout(() => callback(performance.now()), 0);

		scheduleOpen(() => {
			if (logDrawerTokenRef.current !== token) {
				return;
			}

			setIsLogDrawerOpen(true);
		});
	}

	function closeLogDrawer(): void {
		if (!isLogDrawerMounted) return;
		logDrawerTokenRef.current += 1;
		setIsLogDrawerOpen(false);

		if (logDrawerCloseTimeoutRef.current !== null) {
			window.clearTimeout(logDrawerCloseTimeoutRef.current);
		}

		logDrawerCloseTimeoutRef.current = window.setTimeout(() => {
			logDrawerCloseTimeoutRef.current = null;
			setIsLogDrawerMounted(false);
		}, 280);
	}

	function openRulesDrawer(): void {
		setIsRulesDrawerOpen(true);
		setIsMenuOpen(false);
		setIsLeaveGameArmed(false);
		closeLogDrawer();
		clearActionDraft();
	}

	function toggleMenu(): void {
		if (isLogDrawerMounted) {
			closeLogDrawer();
		}

		setIsMenuOpen(current => {
			const next = !current;
			if (!next) {
				setIsLeaveGameArmed(false);
			}
			return next;
		});
	}

	function closeMenu(): void {
		if (!isMenuOpen) return;
		setIsMenuOpen(false);
		setIsLeaveGameArmed(false);
	}

	function handleLocalDebugToggle(): void {
		setIsLeaveGameArmed(false);
		setIsMenuOpen(false);
		closeLogDrawer();
		clearActionDraft();

		const next = !isDebugMode;
		if (next) {
			const snapshot = connectionState.gameState;
			if (snapshot) {
				try {
					debugGame.replaceState(JSON.parse(JSON.stringify(snapshot)) as HanabiState);
					setDebugGameState(debugGame.getSnapshot());
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unknown debug state error';
					window.alert(`Unable to enable local debug mode: ${message}`);
					return;
				}
			}
		} else {
			debugGame.cancelSelection();
			setDebugGameState(debugGame.getSnapshot());
		}

		setIsDebugMode(next);
	}

	function handleLeaveGamePress(): void {
		if (!isLeaveGameArmed) {
			setIsLeaveGameArmed(true);
			return;
		}

		setIsLeaveGameArmed(false);
		setIsMenuOpen(false);
		closeLogDrawer();
		clearActionDraft();

		if (typeof window === 'undefined') {
			return;
		}

		if (isLocalDebugMode) {
			debugGame.cancelSelection();
			setDebugGameState(debugGame.getSnapshot());
			setIsDebugMode(false);
			return;
		}

		leaveOnlineRoom();
	}

	function toggleOnlineSpectator(next?: boolean): void {
		if (!connectionState.selfPlayerId) {
			return;
		}

		const current =
			connectionState.members.find(member => member.id === connectionState.selfPlayerId)?.isTv ??
			false;
		const spectator = next ?? !current;
		setStoredTvMode(spectator);
		void onlineRoom.sendAction({
			type: 'set-spectator',
			actorId: connectionState.selfPlayerId,
			spectator,
		});
	}

	function updateOnlineSettings(next: Partial<LobbySettings>): void {
		if (!connectionState.selfPlayerId) {
			return;
		}

		void onlineRoom.sendAction({
			type: 'set-settings',
			actorId: connectionState.selfPlayerId,
			next,
		});
	}

	function startOnlineGame(): void {
		if (!connectionState.selfPlayerId) {
			return;
		}

		const isReady =
			connectionState.members.find(member => member.id === connectionState.selfPlayerId)?.isReady ??
			false;
		void onlineRoom.sendAction({
			type: 'set-ready',
			actorId: connectionState.selfPlayerId,
			ready: !isReady,
		});
	}

	function sendOnlineGameAction(action: GameAction): void {
		if (!connectionState.selfPlayerId) {
			return;
		}

		void onlineRoom.sendAction({
			type: 'game-action',
			actorId: action.actorId,
			action,
		});
	}

	function handleEnableDebugMode(): void {
		setIsLeaveGameArmed(false);
		setIsDebugMode(true);
	}

	function handleNegativeColorHintsToggle(): void {
		setIsLeaveGameArmed(false);
		setShowNegativeColorHints(current => !current);
		setIsMenuOpen(false);
	}

	function handleNegativeNumberHintsToggle(): void {
		setIsLeaveGameArmed(false);
		setShowNegativeNumberHints(current => !current);
		setIsMenuOpen(false);
	}

	function handleTurnSoundToggle(): void {
		setIsLeaveGameArmed(false);
		setTurnSoundEnabled(current => !current);
		setIsMenuOpen(false);
	}

	function handleTibiModeToggle(): void {
		setIsLeaveGameArmed(false);
		setIsTibiMode(current => !current);
		setIsMenuOpen(false);
	}

	function handleDarkModeToggle(): void {
		setIsLeaveGameArmed(false);
		onToggleDarkMode();
		setIsMenuOpen(false);
	}

	async function handleCopyStatePress(): Promise<void> {
		setIsMenuOpen(false);
		if (!activeGameState) {
			window.alert('No game state available yet.');
			return;
		}

		try {
			await writeToClipboard(JSON.stringify(activeGameState));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown clipboard error';
			window.alert(`Unable to copy game state: ${message}`);
		}
	}

	async function handleLoadStatePress(): Promise<void> {
		setIsMenuOpen(false);
		closeLogDrawer();
		clearActionDraft();

		let loaded: HanabiState | null = null;

		if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
			try {
				const clipboardText = await navigator.clipboard.readText();
				if (clipboardText.trim().length > 0) {
					loaded = parseHanabiStatePayload(clipboardText.trim());
				}
			} catch {
				loaded = null;
			}
		}

		if (!loaded) {
			const raw = window.prompt('Paste a Hanabi game state JSON (from "Debug: copy state")');
			if (!raw || raw.trim().length === 0) {
				return;
			}

			try {
				loaded = parseHanabiStatePayload(raw.trim());
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown load error';
				window.alert(`Unable to load game state: ${message}`);
				return;
			}
		}

		try {
			debugGame.replaceState(loaded);
			setDebugGameState(debugGame.getSnapshot());
			setIsDebugMode(true);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown debug state error';
			window.alert(`Unable to apply game state: ${message}`);
		}
	}

	if (showLobby) {
		return (
			<LobbyScreen
				roomId={roomId}
				members={connectionState.members}
				selfPlayerId={connectionState.selfPlayerId}
				selfName={playerName}
				onSelfNameChange={setPlayerName}
				selfIsTv={isOnlineTvMember}
				onSelfIsTvChange={toggleOnlineSpectator}
				phase={connectionState.phase}
				settings={connectionState.settings}
				isGameInProgress={connectionState.phase === 'playing' && !isOnlineParticipant}
				onStart={startOnlineGame}
				onLeaveRoom={onLeaveRoom ? leaveOnlineRoom : null}
				isDarkMode={isDarkMode}
				onToggleDarkMode={onToggleDarkMode}
				onEnableDebugMode={handleEnableDebugMode}
				onUpdateSettings={updateOnlineSettings}
			/>
		);
	}

	if (showTv && activeGameState) {
		return (
			<TvScreen
				gameState={activeGameState}
				discardCounts={discardCounts}
				showNegativeColorHints={showNegativeColorHints}
				showNegativeNumberHints={showNegativeNumberHints}
			/>
		);
	}

	if (!activeGameState || !perspective) {
		return (
			<LobbyWaitingForSnapshot roomId={roomId} onLeaveRoom={onLeaveRoom ? leaveOnlineRoom : null} />
		);
	}

	const effectiveTurnPlayerId =
		isActionAnimationRunning && turnLockPlayerId
			? turnLockPlayerId
			: perspective.currentTurnPlayerId;
	const effectivePlayers = perspective.players.map(player => ({
		...player,
		isCurrentTurn: player.id === effectiveTurnPlayerId,
	}));
	const viewerIndex = effectivePlayers.findIndex(player => player.id === perspective.viewerId);
	if (viewerIndex === -1) {
		throw new Error(`Missing viewer ${perspective.viewerId}`);
	}

	const tablePlayers = [
		...effectivePlayers.slice(viewerIndex + 1),
		...effectivePlayers.slice(0, viewerIndex + 1),
	];
	const activeTurnIndex = tablePlayers.findIndex(player => player.id === effectiveTurnPlayerId);
	const isCompactPlayersLayout = tablePlayers.length >= 4;
	const lastLog = perspective.logs[perspective.logs.length - 1] ?? null;
	const orderedLogs = [...perspective.logs].reverse();
	const hintTokenStates = Array.from(
		{ length: perspective.maxHintTokens },
		(_, index) => index < perspective.hintTokens,
	);
	const remainingFuses = perspective.maxFuseTokens - perspective.fuseTokensUsed;
	const fuseTokenStates = Array.from(
		{ length: perspective.maxFuseTokens },
		(_, index) => index < remainingFuses,
	);
	const gameOver = isTerminalStatus(perspective.status);
	const endgameKey = gameOver
		? (terminalStatusLogId ?? `${perspective.status}:${perspective.turn}`)
		: null;
	const endgameOutcome: 'win' | 'lose' = perspective.status === 'won' ? 'win' : 'lose';
	const showEndgameOverlay =
		gameOver && !isActionAnimationRunning && dismissedEndgameKey !== endgameKey;
	const reduceMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const isOnlineTurn =
		!isLocalDebugMode &&
		onlineSelfPlayerId !== null &&
		perspective.currentTurnPlayerId === onlineSelfPlayerId;
	const canAct =
		(isLocalDebugMode || (connectionState.status === 'connected' && isOnlineTurn)) &&
		!isActionAnimationRunning;
	const selectedAction: PendingCardAction = isLocalDebugMode
		? debugGame.state.ui.pendingAction
		: pendingAction;
	const pendingBonus = perspective.pendingBonus;
	const viewerHandCount =
		perspective.players.find(player => player.id === perspective.viewerId)?.cards.length ?? 0;
	const viewerHasCards = viewerHandCount > 0;
	const normalActionBlocked = Boolean(pendingBonus);
	const discardDisabled = gameOver || normalActionBlocked || !canAct || !viewerHasCards;
	const colorHintDisabled =
		gameOver || normalActionBlocked || !canAct || perspective.hintTokens <= 0;
	const numberHintDisabled =
		gameOver || normalActionBlocked || !canAct || perspective.hintTokens <= 0;
	const playDisabled = gameOver || normalActionBlocked || !canAct || !viewerHasCards;
	const bonusDiscardChoices =
		pendingBonus && activeGameState
			? [...activeGameState.discardPile]
					.reverse()
					.map(cardId => {
						const card = activeGameState.cards[cardId];
						if (!card) {
							return null;
						}
						return { cardId, card, playable: isDiscardCardPlayable(cardId) };
					})
					.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
			: [];

	function toggleEndgameLog(): void {
		setEndgamePanel(current => (current === 'log' ? 'summary' : 'log'));
	}

	function backToGame(): void {
		setEndgamePanel('summary');
		setDismissedEndgameKey(endgameKey);
		setIsMenuOpen(false);
		closeLogDrawer();
		clearActionDraft();
	}

	function handleBonusDiscardChoice(cardId: CardId): void {
		if (!pendingBonus) {
			return;
		}

		const actionType =
			pendingBonus.effect === 'shuffle-discard'
				? 'bonus-shuffle-discard'
				: pendingBonus.effect === 'play-discard'
					? 'bonus-play-discard'
					: null;
		if (!actionType) {
			return;
		}

		if (isLocalDebugMode) {
			const actorId = debugGame.state.players[debugGame.state.currentTurnPlayerIndex]?.id;
			if (!actorId) {
				return;
			}

			commitLocalAction({ type: actionType, actorId, cardId });
			return;
		}

		if (!onlineSelfPlayerId) {
			return;
		}

		sendOnlineGameAction({ type: actionType, actorId: onlineSelfPlayerId, cardId });
		clearActionDraft();
	}

	return (
		<main className='app' data-testid='app-root'>
			<section className='stats'>
				<div className='stat hints-stat' data-testid='status-hints'>
					<div className='token-grid hints-grid' aria-label='Hint tokens'>
						{hintTokenStates.map((isFilled, index) => (
							<span
								key={`hint-token-${index}`}
								className='token-slot'
								ref={node => {
									hintTokenSlotRefs.current[index] = node;
								}}
								data-testid={`hint-token-${index}`}
							>
								<LightbulbFilament
									size={15}
									weight={isFilled ? 'fill' : 'regular'}
									className={isFilled ? 'token-icon filled' : 'token-icon hollow'}
								/>
							</span>
						))}
					</div>
					<span className='visually-hidden' data-testid='status-hints-count'>
						{perspective.hintTokens}
					</span>
				</div>

				<div className='stat deck-stat' data-testid='status-deck'>
					<div className='deck-pill' ref={deckPillRef} data-testid='deck-pill'>
						<CardsThree size={17} weight='fill' />
						<DeckCount value={perspective.drawDeckCount} />
					</div>
				</div>

				<div className='stat fuses-stat' data-testid='status-fuses'>
					<div className='token-grid fuses-grid' aria-label='Fuse tokens'>
						{fuseTokenStates.map((isFilled, index) => (
							<span
								key={`fuse-token-${index}`}
								className='token-slot'
								ref={node => {
									fuseTokenSlotRefs.current[index] = node;
								}}
								data-testid={`fuse-token-${index}`}
							>
								<Fire
									size={24}
									weight={isFilled ? 'fill' : 'regular'}
									className={isFilled ? 'token-icon filled danger' : 'token-icon hollow danger'}
								/>
							</span>
						))}
					</div>
					<span className='visually-hidden' data-testid='status-fuses-count'>
						{remainingFuses}
					</span>
				</div>
			</section>

			<section
				className='fireworks'
				style={{ '--suit-count': String(perspective.activeSuits.length) } as CSSProperties}
				data-testid='fireworks-grid'
			>
				{perspective.activeSuits.map(suit => {
					const height = perspective.fireworksHeights[suit];
					return (
						<div
							key={suit}
							className='tower'
							style={{ '--suit': suitColors[suit] } as CSSProperties}
							data-testid={`tower-${suit}`}
						>
							<div className='tower-stack'>
								{getFireworkCardNumbers(suit).map(num => {
									const isLit = isFireworkCardPlayed(suit, num, height);
									const remaining = perspective.knownRemainingCounts[suit][num];
									const knownUnavailable = perspective.knownUnavailableCounts[suit][num];
									const cardKey = `${suit}-${num}`;
									const totalCopies = remaining + knownUnavailable;
									const discarded = discardCounts.get(cardKey) ?? 0;
									const visibleInHands = visibleOtherHandCounts.get(cardKey) ?? 0;
									const played = isLit ? 1 : 0;
									const pipTotal = isTibiMode
										? remaining + visibleInHands + discarded
										: remaining + visibleInHands + discarded + played;
									const blocked = !isLit && discarded >= totalCopies;
									const pipStates = getPegPipStates(
										isTibiMode ? 'tibi' : 'default',
										remaining,
										visibleInHands,
										discarded,
										played,
										pipTotal,
									);
									const pipAriaLabel = isTibiMode
										? `${remaining} in deck, ${visibleInHands} in visible hands, ${discarded} discarded`
										: `${remaining + visibleInHands} available, ${discarded + played} unavailable`;

									return (
										<div
											key={num}
											className={`peg ${isLit ? 'lit' : ''} ${blocked ? 'blocked' : ''}`}
											data-testid={`peg-${suit}-${num}`}
										>
											<span className='peg-num'>{blocked ? '✕' : num}</span>
											<span className='peg-pips' aria-label={pipAriaLabel}>
												<PegPips pipStates={pipStates} />
											</span>
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</section>

			<section
				className={`table-shell ${isCompactPlayersLayout ? 'compact' : ''}`}
				style={
					{
						'--player-count': String(tablePlayers.length),
						'--active-index': String(activeTurnIndex),
					} as CSSProperties
				}
				data-testid='table-shell'
			>
				{activeTurnIndex >= 0 && (
					<div className='turn-indicator' aria-hidden data-testid='turn-indicator' />
				)}
				{tablePlayers.map(player => (
					<article
						key={player.id}
						className={`player ${player.isCurrentTurn ? 'active' : ''} ${player.isViewer ? 'you-player' : ''}`}
						data-testid={`player-${player.id}`}
					>
						<header className='player-header'>
							<span
								className={`player-name ${player.id === perspective.viewerId ? 'you-name' : ''}`}
								data-testid={`player-name-${player.id}`}
								ref={node => {
									if (node) {
										playerNameNodeByIdRef.current.set(player.id, node);
									} else {
										playerNameNodeByIdRef.current.delete(player.id);
									}
								}}
							>
								{player.isViewer && !isCompactPlayersLayout ? `${player.name} (You)` : player.name}
							</span>
							{player.isCurrentTurn && (
								<span className='turn-chip' data-testid={`player-turn-${player.id}`}>
									<span className='turn-chip-dot' />
									Turn
								</span>
							)}
						</header>
						<div
							className='cards'
							style={{ '--hand-size': String(Math.max(player.cards.length, 4)) } as CSSProperties}
						>
							{player.cards.map((card, cardIndex) => (
								<CardView
									key={card.id}
									card={card}
									showNegativeColorHints={showNegativeColorHints}
									showNegativeNumberHints={showNegativeNumberHints}
									onSelect={() => handleCardSelect(player.id, card.id)}
									testId={`card-${player.id}-${cardIndex}`}
									onNode={node => {
										if (node) {
											cardNodeByIdRef.current.set(card.id, node);
										} else {
											cardNodeByIdRef.current.delete(card.id);
										}
									}}
								/>
							))}
						</div>
					</article>
				))}
			</section>

			<section className='bottom-panel'>
				<button
					type='button'
					className='last-action'
					onClick={openLogDrawer}
					data-testid='status-last-action'
				>
					<span className='last-action-label'>Last</span>
					<LastActionTicker
						id={lastLog?.id ?? 'none'}
						message={lastLog ? renderLogMessage(lastLog) : 'No actions yet'}
					/>
				</button>

				<section className='actions'>
					<div className='action-slot'>
						<button
							type='button'
							className={`action-button danger ${selectedAction === 'discard' ? 'selected' : ''}`}
							data-testid='actions-discard'
							onClick={handleDiscardPress}
							disabled={discardDisabled}
						>
							<span className='action-main'>Discard</span>
						</button>
					</div>

					<div className='action-slot'>
						<button
							type='button'
							className={`action-button ${selectedAction === 'hint-number' ? 'selected' : ''}`}
							data-testid='actions-number'
							onClick={handleHintNumberPress}
							disabled={numberHintDisabled}
						>
							<span className='action-main'>Number</span>
						</button>
					</div>

					<div className='action-slot'>
						<button
							type='button'
							className='action-button menu-toggle'
							aria-label='Open menu'
							aria-expanded={isMenuOpen}
							data-testid='actions-menu'
							onClick={toggleMenu}
						>
							<span />
							<span />
							<span />
						</button>
					</div>

					<div className='action-slot'>
						<button
							type='button'
							className={`action-button ${selectedAction === 'hint-color' ? 'selected' : ''}`}
							data-testid='actions-color'
							onClick={handleHintColorPress}
							disabled={colorHintDisabled}
						>
							<span className='action-main'>Color</span>
						</button>
					</div>

					<div className='action-slot'>
						<button
							type='button'
							className={`action-button primary ${selectedAction === 'play' ? 'selected' : ''}`}
							data-testid='actions-play'
							onClick={handlePlayPress}
							disabled={playDisabled}
						>
							<span className='action-main'>Play</span>
						</button>
					</div>
				</section>
			</section>

			{pendingBonus && (
				<aside className='bonus-panel' data-testid='bonus-panel'>
					<div className='bonus-panel-header'>
						<span className='bonus-panel-kicker'>Bonus</span>
						<span className='bonus-panel-title'>
							{pendingBonus.effect === 'free-color-hint'
								? 'Free Color'
								: pendingBonus.effect === 'free-number-hint'
									? 'Free Number'
									: pendingBonus.effect === 'shuffle-discard'
										? 'Shuffle Back'
										: 'Play Discard'}
						</span>
					</div>

					{isBonusHintEffect(pendingBonus.effect) ? (
						<p className='bonus-panel-copy' data-testid='bonus-hint-prompt'>
							{canAct ? 'Tap a teammate card.' : `Waiting for ${pendingBonus.actorName}.`}
						</p>
					) : (
						<div className='bonus-discard-grid' data-testid='bonus-discard-grid'>
							{bonusDiscardChoices.map(({ cardId, card, playable }) => {
								const disabled = !canAct || (pendingBonus.effect === 'play-discard' && !playable);
								return (
									<button
										key={cardId}
										type='button'
										className='bonus-discard-choice'
										style={
											{
												'--bonus-card-color': suitColors[card.suit],
											} as CSSProperties
										}
										onClick={() => handleBonusDiscardChoice(cardId)}
										disabled={disabled}
										aria-label={`${pendingBonus.effect === 'play-discard' ? 'Play' : 'Shuffle'} ${suitNames[card.suit]} ${card.number}`}
										data-testid={`bonus-discard-${cardId}`}
									>
										<span className='bonus-discard-number'>{card.number}</span>
										<SuitSymbol suit={card.suit} size={14} className='bonus-discard-suit' />
									</button>
								);
							})}
						</div>
					)}
				</aside>
			)}

			{wildColorHintTargetPlayerId && (
				<aside className='wild-color-picker' data-testid='wild-color-picker'>
					<div className='wild-color-picker-buttons'>
						{BASE_SUITS.map(suit => (
							<button
								key={suit}
								type='button'
								className='wild-color-button'
								style={{ '--suit': suitColors[suit] } as CSSProperties}
								onClick={() => handleWildColorPick(suit)}
								aria-label={`Hint ${suitNames[suit]}`}
								data-testid={`wild-color-${suit}`}
							>
								{suit}
							</button>
						))}
						<button
							type='button'
							className='wild-color-cancel'
							onClick={cancelWildColorPicker}
							aria-label='Cancel'
							data-testid='wild-color-cancel'
						>
							X
						</button>
					</div>
				</aside>
			)}

			<>
				<button
					type='button'
					className={`menu-scrim ${isMenuOpen ? 'open' : ''}`}
					aria-label='Close menu'
					aria-hidden={!isMenuOpen}
					tabIndex={isMenuOpen ? 0 : -1}
					onClick={closeMenu}
				/>

				<aside
					className={`menu-panel ${isMenuOpen ? 'open' : ''}`}
					aria-hidden={!isMenuOpen}
					data-testid='menu-panel'
				>
					<button
						type='button'
						className={`menu-item menu-danger ${isLeaveGameArmed ? 'armed' : ''}`}
						data-testid='menu-leave-game'
						onClick={handleLeaveGamePress}
					>
						{isLeaveGameArmed ? 'Are you sure?' : 'Leave game'}
					</button>

					<button
						type='button'
						className='menu-item'
						data-testid='menu-rules'
						onClick={openRulesDrawer}
					>
						Rules
					</button>

					<section className='menu-section' aria-label='Configuration'>
						<div className='menu-section-title'>Config</div>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-dark-mode-toggle'
							aria-pressed={isDarkMode}
							onClick={handleDarkModeToggle}
						>
							<span>Dark Mode</span>
							<span data-testid='menu-dark-mode-value'>{isDarkMode ? 'On' : 'Off'}</span>
						</button>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-negative-color-toggle'
							aria-pressed={showNegativeColorHints}
							onClick={handleNegativeColorHintsToggle}
						>
							<span>Negative Color Hints</span>
							<span data-testid='menu-negative-color-value'>
								{showNegativeColorHints ? 'On' : 'Off'}
							</span>
						</button>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-negative-number-toggle'
							aria-pressed={showNegativeNumberHints}
							onClick={handleNegativeNumberHintsToggle}
						>
							<span>Negative Number Hints</span>
							<span data-testid='menu-negative-number-value'>
								{showNegativeNumberHints ? 'On' : 'Off'}
							</span>
						</button>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-turn-sound-toggle'
							aria-pressed={turnSoundEnabled}
							onClick={handleTurnSoundToggle}
						>
							<span>Turn Sound</span>
							<span data-testid='menu-turn-sound-value'>{turnSoundEnabled ? 'On' : 'Off'}</span>
						</button>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-tibi-mode-toggle'
							aria-pressed={isTibiMode}
							onClick={handleTibiModeToggle}
						>
							<span>Tibi Mode</span>
							<span data-testid='menu-tibi-mode-value'>{isTibiMode ? 'On' : 'Off'}</span>
						</button>
						{!isLocalDebugMode && onLeaveRoom && (
							<button
								type='button'
								className='menu-item'
								data-testid='menu-leave-room'
								onClick={() => {
									setIsMenuOpen(false);
									leaveOnlineRoom();
								}}
							>
								Leave Room
							</button>
						)}
					</section>

					<section className='menu-section' aria-label='Debug'>
						<div className='menu-section-title'>Debug</div>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-local-debug-toggle'
							aria-pressed={isLocalDebugMode}
							onClick={handleLocalDebugToggle}
						>
							<span>Local Debug</span>
							<span data-testid='menu-local-debug-value'>{isLocalDebugMode ? 'On' : 'Off'}</span>
						</button>
						<button
							type='button'
							className='menu-item'
							data-testid='menu-debug-copy-state'
							onClick={() => void handleCopyStatePress()}
						>
							Debug: Copy State
						</button>
						<button
							type='button'
							className='menu-item'
							data-testid='menu-debug-load-state'
							onClick={() => void handleLoadStatePress()}
						>
							Debug: Load State
						</button>
					</section>

					<a
						className='menu-item menu-link'
						data-testid='menu-view-github'
						href='https://github.com/smirea/hanabi'
						target='_blank'
						rel='noreferrer noopener'
					>
						View on GitHub
					</a>

					{versionText && (
						<div className='menu-version' data-testid='menu-version'>
							{versionText}
						</div>
					)}
				</aside>
			</>

			{isLogDrawerMounted && (
				<>
					<button
						type='button'
						className={`drawer-scrim ${isLogDrawerOpen ? 'open' : ''}`}
						aria-label='Close action log'
						aria-hidden={!isLogDrawerOpen}
						tabIndex={isLogDrawerOpen ? 0 : -1}
						onClick={closeLogDrawer}
					/>

					<aside
						className={`log-drawer ${isLogDrawerOpen ? 'open' : ''}`}
						aria-hidden={!isLogDrawerOpen}
					>
						<header className='log-drawer-header'>
							<span className='log-drawer-title'>Action Log</span>
							<button
								type='button'
								className='log-drawer-close action-button'
								onClick={closeLogDrawer}
								aria-label='Close action log'
								data-testid='log-close'
							>
								<X size={14} weight='bold' aria-hidden />
							</button>
						</header>
						<div ref={logListRef} className='log-list' data-testid='log-list'>
							{orderedLogs.map(logEntry => (
								<article
									key={logEntry.id}
									className='log-item'
									data-testid={`log-item-${logEntry.id}`}
								>
									<span className={`log-kind ${logEntry.type}`}>{getLogBadge(logEntry)}</span>
									<span className='log-item-message'>{renderLogMessage(logEntry)}</span>
								</article>
							))}
						</div>
					</aside>
				</>
			)}

			<RulesDrawer isOpen={isRulesDrawerOpen} onClose={() => setIsRulesDrawerOpen(false)} />

			<div
				className='animation-layer'
				ref={animationLayerRef}
				aria-hidden
				data-testid='animation-layer'
			/>

			{showEndgameOverlay && (
				<EndgameOverlay
					outcome={endgameOutcome}
					status={perspective.status}
					score={perspective.score}
					perspective={perspective}
					discardCounts={discardCounts}
					finalHands={finalHands}
					handSize={activeGameState.settings.handSize}
					players={activeGameState.players}
					viewerId={perspective.viewerId}
					statsByPlayerId={endgameStatsByPlayerId}
					logs={orderedLogs}
					panel={endgamePanel}
					reduceMotion={reduceMotion}
					onToggleLog={toggleEndgameLog}
					onBackToGame={backToGame}
				/>
			)}
		</main>
	);
}

export default GameClient;
