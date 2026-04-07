import { CardsThree, Fire, LightbulbFilament, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSnapshot } from 'valtio/react';
import {
	BASE_SUITS,
	CARD_NUMBERS,
	HanabiGame,
	type CardId,
	type HanabiState,
	type HanabiPerspectiveState,
	type PlayerId,
	type Suit,
} from '../../game';
import { useDebugScreensController } from '../../debugScreens';
import { cloneLobbySettings, getOnlineNetworking, sanitizePlayerName, selectRoomViewState } from '../../onlineGame';
import { useWebStorageState } from '../../hooks/useWebStorageState';
import { storageKeys, suitColors, suitNames } from '../../utils/constants';
import type { GameAction, LobbySettings, RoomViewState } from '../../utils/types';
import type { RoomId } from '../../utils/networking';
import { CardView } from './components/CardView';
import { DeckCount } from './components/DeckCount';
import { LastActionTicker } from './components/LastActionTicker';
import { PegPips, getPegPipStates } from './components/PegPips';
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
	hostId: null,
	isHost: false,
	snapshotVersion: 0,
	phase: 'lobby',
	members: [],
	settings: cloneLobbySettings(),
	gameState: null,
};

function isTerminalStatus(status: HanabiPerspectiveState['status']): boolean {
	return status === 'won' || status === 'lost' || status === 'finished';
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
	return HanabiGame.fromState((parsed as { state?: HanabiState }).state ?? (parsed as HanabiState)).getSnapshot();
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
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isLeaveGameArmed, setIsLeaveGameArmed] = useState(false);
	const [endgamePanel, setEndgamePanel] = useState<'summary' | 'log'>('summary');
	const {
		pendingAction,
		setPendingAction,
		wildColorHintTargetPlayerId,
		setWildColorHintTargetPlayerId,
		redundantPlayConfirmCardId,
		setRedundantPlayConfirmCardId,
		clearActionDraft,
		clearHintDraft,
	} = useTransientActionState();
	const [isDebugMode, setIsDebugMode] = useWebStorageState('localStorage', storageKeys.debugMode, false);
	const [playerName, setPlayerName] = useWebStorageState('localStorage', storageKeys.playerName, '');
	const [showNegativeColorHints, setShowNegativeColorHints] = useWebStorageState(
		'localStorage',
		storageKeys.negativeColorHints,
		true,
	);
	const [showNegativeNumberHints, setShowNegativeNumberHints] = useWebStorageState(
		'localStorage',
		storageKeys.negativeNumberHints,
		true,
	);
	const [turnSoundEnabled, setTurnSoundEnabled] = useWebStorageState(
		'localStorage',
		storageKeys.turnSoundEnabled,
		true,
	);
	const [isTibiMode, setIsTibiMode] = useWebStorageState('localStorage', storageKeys.tibiMode, false);
	const logListRef = useRef<HTMLDivElement | null>(null);
	const logDrawerTokenRef = useRef(0);
	const logDrawerCloseTimeoutRef = useRef<number | null>(null);

	const isLocalDebugMode = isDebugMode;
	const onlineNetworking = getOnlineNetworking();
	const onlineStateSnapshot = useSnapshot(onlineNetworking.state);
	const connectionState = useMemo(
		() => (isLocalDebugMode ? DISCONNECTED_ROOM_VIEW_STATE : selectRoomViewState(onlineNetworking)),
		[isLocalDebugMode, onlineNetworking, onlineStateSnapshot],
	);
	const leaveOnlineRoom = useCallback(() => {
		onlineNetworking.leaveGameRoom();
		onLeaveRoom?.();
	}, [onLeaveRoom, onlineNetworking]);

	useEffect(() => {
		if (isLocalDebugMode) {
			return;
		}

		const targetRoomId = `room:${roomId}` as RoomId;
		if (onlineNetworking.state.self.room === targetRoomId) {
			return;
		}

		onlineNetworking.joinGameRoom({
			roomId: targetRoomId,
			create: false,
		});
	}, [isLocalDebugMode, onlineNetworking, roomId]);

	useEffect(() => {
		if (isLocalDebugMode) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			if (
				connectionState.selfPlayerId &&
				connectionState.phase === 'playing' &&
				connectionState.gameState?.players.some(player => player.id === connectionState.selfPlayerId)
			) {
				return;
			}

			const self = onlineNetworking.state.self;
			const fallbackName = `Player ${self.id.slice(-4).toUpperCase()}`;
			const nextName = sanitizePlayerName(playerName) ?? fallbackName;
			if (self.name === nextName) {
				return;
			}

			onlineNetworking.updateSelf({ name: nextName });
		}, 220);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [
		connectionState.gameState,
		connectionState.phase,
		connectionState.selfPlayerId,
		isLocalDebugMode,
		onlineNetworking,
		playerName,
	]);

	useEffect(() => {
		if (isLocalDebugMode || !connectionState.selfId) {
			return;
		}

		if (connectionState.phase !== 'lobby') {
			return;
		}

		const memberName = connectionState.members.find(member => member.peerId === connectionState.selfId)?.name ?? null;
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
		connectionState.selfId,
		isLocalDebugMode,
		playerName,
		setPlayerName,
	]);

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
		const stats = new Map<PlayerId, { hintsGiven: number; hintsReceived: number; plays: number; discards: number }>();
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

		const isActivePlayer = onlineGameState.players.some(player => player.id === connectionState.selfPlayerId);
		if (!isActivePlayer) {
			return null;
		}

		const isSpectator =
			connectionState.members.find(member => member.id === connectionState.selfPlayerId)?.isTv ?? false;
		return isSpectator ? null : connectionState.selfPlayerId;
	}, [connectionState.members, connectionState.selfPlayerId, isLocalDebugMode, onlineGameState]);

	const isOnlineParticipant = useMemo(() => {
		return onlineSelfPlayerId !== null;
	}, [onlineSelfPlayerId]);

	const isOnlineTvMember = useMemo(() => {
		if (isLocalDebugMode || !connectionState.selfId) {
			return false;
		}

		return connectionState.members.find(member => member.peerId === connectionState.selfId)?.isTv ?? false;
	}, [connectionState.members, connectionState.selfId, isLocalDebugMode]);

	const isTvClient = !isLocalDebugMode && isOnlineTvMember;
	const showTv = isTvClient && !isOnlineParticipant && connectionState.phase === 'playing' && onlineGameState !== null;

	const showLobby =
		!isLocalDebugMode &&
		(connectionState.phase === 'lobby' || connectionState.gameState === null || (!isOnlineParticipant && !showTv));

	const perspectivePlayerId = useMemo(() => {
		if (!activeGameState) {
			return null;
		}

		if (isLocalDebugMode) {
			return activeGameState.players[activeGameState.currentTurnPlayerIndex]?.id ?? null;
		}

		if (!connectionState.selfId) {
			return null;
		}

		return onlineSelfPlayerId;
	}, [activeGameState, connectionState.selfId, isLocalDebugMode, onlineSelfPlayerId]);

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

		if ((nextAction === 'hint-color' || nextAction === 'hint-number') && perspective.hintTokens <= 0) {
			return;
		}

		clearHintDraft();
		setPendingAction(nextAction);
	}

	function handleActionPress(nextAction: Exclude<PendingCardAction, null>, beginLocal: () => void): void {
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
		setRedundantPlayConfirmCardId(null);
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

		commitLocal(() => {
			debugGame.giveNumberHint(action.targetPlayerId, action.number);
		});
	}

	function applyResolvedCardSelection(
		resolved: ReturnType<typeof resolveCardSelectionAction>,
		onAction: (action: GameAction) => void,
	): void {
		if (resolved.kind === 'arm-redundant-play') {
			setRedundantPlayConfirmCardId(resolved.cardId);
			triggerCardFx(resolved.cardId, 'hint-redundant');
			return;
		}

		if (resolved.kind === 'wild-color-picker') {
			setWildColorHintTargetPlayerId(resolved.targetPlayerId);
			setRedundantPlayConfirmCardId(null);
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

	function handleCardSelect(playerId: PlayerId, cardId: CardId): void {
		if (isLocalDebugMode) {
			setIsMenuOpen(false);
			const actorId = debugGame.state.players[debugGame.state.currentTurnPlayerIndex]?.id;
			if (!actorId) {
				return;
			}

			const resolved = resolveCardSelectionAction({
				state: debugGame.state,
				actorId,
				pendingAction: debugGame.state.ui.pendingAction,
				playerId,
				cardId,
				redundantPlayConfirmCardId,
			});

			applyResolvedCardSelection(resolved, action => {
				commitLocalAction(action);
			});
			return;
		}

		if (!activeGameState || !onlineSelfPlayerId || !pendingAction) {
			return;
		}

		const actorId = onlineSelfPlayerId;
		const resolved = resolveCardSelectionAction({
			state: activeGameState,
			actorId,
			pendingAction,
			playerId,
			cardId,
			redundantPlayConfirmCardId,
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
				: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0);

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
		if (!connectionState.selfPlayerId || !onlineNetworking.state.self.room) {
			return;
		}

		const current = connectionState.members.find(member => member.id === connectionState.selfPlayerId)?.isTv ?? false;
		const spectator = next ?? !current;
		onlineNetworking.act({
			type: 'set-spectator',
			actorId: connectionState.selfPlayerId,
			spectator,
		});
	}

	function updateOnlineSettings(next: Partial<LobbySettings>): void {
		if (!connectionState.selfPlayerId || !onlineNetworking.state.self.room) {
			return;
		}

		onlineNetworking.act({
			type: 'set-settings',
			actorId: connectionState.selfPlayerId,
			next,
		});
	}

	function startOnlineGame(): void {
		if (!connectionState.selfPlayerId || !onlineNetworking.state.self.room) {
			return;
		}

		onlineNetworking.act({
			type: 'start-game',
			actorId: connectionState.selfPlayerId,
		});
	}

	function sendOnlineGameAction(action: GameAction): void {
		if (!onlineNetworking.state.self.room) {
			return;
		}

		onlineNetworking.act({
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
				hostId={connectionState.hostId}
				isHost={connectionState.isHost}
				selfId={connectionState.selfId}
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
		return <LobbyWaitingForSnapshot roomId={roomId} onLeaveRoom={onLeaveRoom ? leaveOnlineRoom : null} />;
	}

	const effectiveTurnPlayerId =
		isActionAnimationRunning && turnLockPlayerId ? turnLockPlayerId : perspective.currentTurnPlayerId;
	const effectivePlayers = perspective.players.map(player => ({
		...player,
		isCurrentTurn: player.id === effectiveTurnPlayerId,
	}));
	const viewerIndex = effectivePlayers.findIndex(player => player.id === perspective.viewerId);
	if (viewerIndex === -1) {
		throw new Error(`Missing viewer ${perspective.viewerId}`);
	}

	const tablePlayers = [...effectivePlayers.slice(viewerIndex + 1), ...effectivePlayers.slice(0, viewerIndex + 1)];
	const activeTurnIndex = tablePlayers.findIndex(player => player.id === effectiveTurnPlayerId);
	const isCompactPlayersLayout = tablePlayers.length >= 4;
	const lastLog = perspective.logs[perspective.logs.length - 1] ?? null;
	const orderedLogs = [...perspective.logs].reverse();
	const hintTokenStates = Array.from(
		{ length: perspective.maxHintTokens },
		(_, index) => index < perspective.hintTokens,
	);
	const remainingFuses = perspective.maxFuseTokens - perspective.fuseTokensUsed;
	const fuseTokenStates = Array.from({ length: perspective.maxFuseTokens }, (_, index) => index < remainingFuses);
	const gameOver = isTerminalStatus(perspective.status);
	const endgameOutcome: 'win' | 'lose' = perspective.status === 'won' ? 'win' : 'lose';
	const showEndgameOverlay = gameOver && !isActionAnimationRunning;
	const reduceMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const isOnlineTurn =
		!isLocalDebugMode && onlineSelfPlayerId !== null && perspective.currentTurnPlayerId === onlineSelfPlayerId;
	const canAct =
		(isLocalDebugMode || (connectionState.status === 'connected' && isOnlineTurn)) && !isActionAnimationRunning;
	const selectedAction: PendingCardAction = isLocalDebugMode ? debugGame.state.ui.pendingAction : pendingAction;
	const redundantPlayArmed = selectedAction === 'play' && redundantPlayConfirmCardId !== null;
	const viewerHandCount = perspective.players.find(player => player.id === perspective.viewerId)?.cards.length ?? 0;
	const viewerHasCards = viewerHandCount > 0;
	const discardDisabled = gameOver || !canAct || !viewerHasCards;
	const colorHintDisabled = gameOver || !canAct || perspective.hintTokens <= 0;
	const numberHintDisabled = gameOver || !canAct || perspective.hintTokens <= 0;
	const playDisabled = gameOver || !canAct || !viewerHasCards;

	function toggleEndgameLog(): void {
		setEndgamePanel(current => (current === 'log' ? 'summary' : 'log'));
	}

	function backToStart(): void {
		setEndgamePanel('summary');
		setIsMenuOpen(false);
		closeLogDrawer();
		clearActionDraft();

		if (isLocalDebugMode) {
			debugGame.replaceState(new HanabiGame(LOCAL_DEBUG_SETUP).getSnapshot());
			setDebugGameState(debugGame.getSnapshot());
			return;
		}

		if (connectionState.isHost) {
			updateOnlineSettings({});
			return;
		}

		if (typeof window !== 'undefined') {
			window.location.reload();
		}
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
								{CARD_NUMBERS.map(num => {
									const isLit = num <= height;
									const remaining = perspective.knownRemainingCounts[suit][num];
									const knownUnavailable = perspective.knownUnavailableCounts[suit][num];
									const cardKey = `${suit}-${num}`;
									const totalCopies = remaining + knownUnavailable;
									const discarded = discardCounts.get(cardKey) ?? 0;
									const visibleInHands = visibleOtherHandCounts.get(cardKey) ?? 0;
									const played = num <= height ? 1 : 0;
									const pipTotal = isTibiMode
										? remaining + visibleInHands + discarded
										: remaining + visibleInHands + discarded + played;
									const blocked = num > height && discarded >= totalCopies;
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
					{ '--player-count': String(tablePlayers.length), '--active-index': String(activeTurnIndex) } as CSSProperties
				}
				data-testid='table-shell'
			>
				{activeTurnIndex >= 0 && <div className='turn-indicator' aria-hidden data-testid='turn-indicator' />}
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
						<div className='cards' style={{ '--hand-size': String(Math.max(player.cards.length, 4)) } as CSSProperties}>
							{player.cards.map((card, cardIndex) => (
								<CardView
									key={card.id}
									card={card}
									showNegativeColorHints={showNegativeColorHints}
									showNegativeNumberHints={showNegativeNumberHints}
									onSelect={() => handleCardSelect(player.id, card.id)}
									testId={`card-${player.id}-${cardIndex}`}
									isRedundantPlayArmed={selectedAction === 'play' && redundantPlayConfirmCardId === card.id}
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
				<button type='button' className='last-action' onClick={openLogDrawer} data-testid='status-last-action'>
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
							<span className='action-main'>{redundantPlayArmed ? 'Confirm' : 'Play'}</span>
						</button>
					</div>
				</section>
			</section>

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

				<aside className={`menu-panel ${isMenuOpen ? 'open' : ''}`} aria-hidden={!isMenuOpen}>
					<button
						type='button'
						className={`menu-item menu-danger ${isLeaveGameArmed ? 'armed' : ''}`}
						data-testid='menu-leave-game'
						onClick={handleLeaveGamePress}
					>
						{isLeaveGameArmed ? 'Are you sure?' : 'Leave game'}
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
							onClick={handleNegativeColorHintsToggle}
						>
							<span>Negative Color Hints</span>
							<span data-testid='menu-negative-color-value'>{showNegativeColorHints ? 'On' : 'Off'}</span>
						</button>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-negative-number-toggle'
							onClick={handleNegativeNumberHintsToggle}
						>
							<span>Negative Number Hints</span>
							<span data-testid='menu-negative-number-value'>{showNegativeNumberHints ? 'On' : 'Off'}</span>
						</button>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-turn-sound-toggle'
							onClick={handleTurnSoundToggle}
						>
							<span>Turn Sound</span>
							<span data-testid='menu-turn-sound-value'>{turnSoundEnabled ? 'On' : 'Off'}</span>
						</button>
						<button
							type='button'
							className='menu-item menu-toggle-item'
							data-testid='menu-tibi-mode-toggle'
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

					<aside className={`log-drawer ${isLogDrawerOpen ? 'open' : ''}`} aria-hidden={!isLogDrawerOpen}>
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
								<article key={logEntry.id} className='log-item' data-testid={`log-item-${logEntry.id}`}>
									<span className={`log-kind ${logEntry.type}`}>{getLogBadge(logEntry)}</span>
									<span className='log-item-message'>{renderLogMessage(logEntry)}</span>
								</article>
							))}
						</div>
					</aside>
				</>
			)}

			<div className='animation-layer' ref={animationLayerRef} aria-hidden data-testid='animation-layer' />

			{showEndgameOverlay && (
				<EndgameOverlay
					outcome={endgameOutcome}
					status={perspective.status}
					score={perspective.score}
					perspective={perspective}
					discardCounts={discardCounts}
					players={activeGameState.players}
					viewerId={perspective.viewerId}
					statsByPlayerId={endgameStatsByPlayerId}
					logs={orderedLogs}
					panel={endgamePanel}
					reduceMotion={reduceMotion}
					onToggleLog={toggleEndgameLog}
					onBackToStart={backToStart}
				/>
			)}
		</main>
	);
}

export default GameClient;
