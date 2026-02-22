import { animate } from 'motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CardId, HanabiPerspectiveState, HanabiState, PlayerId, Suit } from '../../../game';
import { suitBadgeForeground, suitColors } from '../constants';

function isTerminalStatus(status: HanabiPerspectiveState['status']): boolean {
  return status === 'won' || status === 'lost' || status === 'finished';
}

export function useGameAnimations({
  activeGameState,
  perspective,
  isLocalDebugMode,
  turnSoundEnabled
}: {
  activeGameState: HanabiState | null;
  perspective: HanabiPerspectiveState | null;
  isLocalDebugMode: boolean;
  turnSoundEnabled: boolean;
}) {
  const animationLayerRef = useRef<HTMLDivElement | null>(null);
  const deckPillRef = useRef<HTMLDivElement | null>(null);
  const cardNodeByIdRef = useRef<Map<CardId, HTMLButtonElement>>(new Map());
  const playerNameNodeByIdRef = useRef<Map<PlayerId, HTMLSpanElement>>(new Map());
  const playerNameFxListenerByNodeRef = useRef<WeakMap<HTMLSpanElement, (event: AnimationEvent) => void>>(new WeakMap());
  const turnAudioContextRef = useRef<AudioContext | null>(null);
  const cardFxListenerByNodeRef = useRef<WeakMap<HTMLButtonElement, Map<string, (event: AnimationEvent) => void>>>(new WeakMap());
  const hintTokenSlotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const fuseTokenSlotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [isActionAnimationRunning, setIsActionAnimationRunning] = useState(false);
  const [turnLockPlayerId, setTurnLockPlayerId] = useState<PlayerId | null>(null);
  const animationRunIdRef = useRef(0);
  const lastTurnCueSignatureRef = useRef<string | null>(null);
  const prevGameStateRef = useRef<HanabiState | null>(null);
  const layoutSnapshotRef = useRef<{ deckRect: DOMRect | null; cardRects: Map<CardId, DOMRect> } | null>(null);
  const prevLayoutSnapshotRef = useRef<{ deckRect: DOMRect | null; cardRects: Map<CardId, DOMRect> } | null>(null);

  const resetAnimations = useCallback(() => {
    animationRunIdRef.current += 1;
    prevGameStateRef.current = null;
    layoutSnapshotRef.current = null;
    prevLayoutSnapshotRef.current = null;
    lastTurnCueSignatureRef.current = null;
    setIsActionAnimationRunning(false);
    setTurnLockPlayerId(null);
    if (animationLayerRef.current) {
      animationLayerRef.current.innerHTML = '';
    }
  }, []);

  useLayoutEffect(() => {
    prevLayoutSnapshotRef.current = layoutSnapshotRef.current;
    const deckRect = deckPillRef.current?.getBoundingClientRect() ?? null;
    const cardRects = new Map<CardId, DOMRect>();
    for (const [cardId, node] of cardNodeByIdRef.current) {
      cardRects.set(cardId, node.getBoundingClientRect());
    }

    layoutSnapshotRef.current = { deckRect, cardRects };
  });

  useEffect(() => {
    return () => {
      const context = turnAudioContextRef.current;
      if (!context) {
        return;
      }

      turnAudioContextRef.current = null;
      void context.close().catch(() => {
      });
    };
  }, []);

  function triggerPlayerNameFlash(playerId: PlayerId): void {
    const node = playerNameNodeByIdRef.current.get(playerId);
    if (!node) {
      return;
    }

    const existing = playerNameFxListenerByNodeRef.current.get(node);
    if (existing) {
      node.removeEventListener('animationend', existing);
    }

    node.classList.remove('turn-flash');
    void node.getBoundingClientRect();
    node.classList.add('turn-flash');

    const onEnd = (event: AnimationEvent): void => {
      if (event.animationName !== 'your-turn-name-flash') {
        return;
      }

      node.classList.remove('turn-flash');
      node.removeEventListener('animationend', onEnd);
      playerNameFxListenerByNodeRef.current.delete(node);
    };

    playerNameFxListenerByNodeRef.current.set(node, onEnd);
    node.addEventListener('animationend', onEnd);
  }

  function playTurnDing(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const AudioContextCtor = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }

      let context = turnAudioContextRef.current;
      if (!context || context.state === 'closed') {
        context = new AudioContextCtor();
        turnAudioContextRef.current = context;
      }

      if (context.state === 'suspended') {
        void context.resume().catch(() => {
        });
      }

      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.24);
    } catch {
    }
  }

  useEffect(() => {
    if (!perspective) {
      lastTurnCueSignatureRef.current = null;
      return;
    }

    const signature = `${perspective.turn}:${perspective.currentTurnPlayerId}`;
    if (lastTurnCueSignatureRef.current === signature) {
      return;
    }

    lastTurnCueSignatureRef.current = signature;
    if (isLocalDebugMode || isTerminalStatus(perspective.status)) {
      return;
    }

    if (perspective.currentTurnPlayerId !== perspective.viewerId) {
      return;
    }

    triggerPlayerNameFlash(perspective.viewerId);
    if (turnSoundEnabled) {
      playTurnDing();
    }
  }, [isLocalDebugMode, perspective, turnSoundEnabled]);

  function triggerSvgFx(svg: SVGElement, fxClass: string): void {
    svg.classList.remove(fxClass);
    void svg.getBoundingClientRect();
    svg.classList.add(fxClass);
    svg.addEventListener('animationend', () => svg.classList.remove(fxClass), { once: true });
  }

  function triggerTokenFx(slot: HTMLSpanElement | null, fxClass: string): void {
    const svg = slot?.querySelector('svg');
    if (!(svg instanceof SVGElement)) {
      return;
    }

    triggerSvgFx(svg, fxClass);
  }

  const triggerCardFx = useCallback((cardId: CardId, fxClass: string): void => {
    const node = cardNodeByIdRef.current.get(cardId);
    if (!node) {
      return;
    }

    const expectedAnimationName =
      fxClass === 'hint-enter'
        ? 'hint-ring'
        : fxClass === 'hint-redundant'
          ? 'hint-redundant-ring'
          : null;

    const listenerMap = cardFxListenerByNodeRef.current.get(node) ?? new Map();
    const existingListener = listenerMap.get(fxClass);
    if (existingListener) {
      node.removeEventListener('animationend', existingListener);
    }

    node.classList.remove(fxClass);
    void node.getBoundingClientRect();
    node.classList.add(fxClass);

    const onEnd = (event: AnimationEvent): void => {
      if (expectedAnimationName && event.animationName !== expectedAnimationName) {
        return;
      }

      node.classList.remove(fxClass);
      node.removeEventListener('animationend', onEnd);
      listenerMap.delete(fxClass);
    };

    listenerMap.set(fxClass, onEnd);
    cardFxListenerByNodeRef.current.set(node, listenerMap);
    node.addEventListener('animationend', onEnd);
  }, []);

  function createGhostCardElement({
    suit,
    number,
    face
  }: {
    suit: Suit | null;
    number: number | null;
    face: 'front' | 'back';
  }): { root: HTMLDivElement; inner: HTMLDivElement; crack: HTMLDivElement } | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const root = document.createElement('div');
    root.className = 'ghost-card';

    if (suit) {
      root.style.setProperty('--card-bg', suitColors[suit]);
      root.style.setProperty('--card-fg', suitBadgeForeground[suit]);
    } else {
      root.style.setProperty('--card-bg', '#9eb2d4');
      root.style.setProperty('--card-fg', '#101114');
    }

    const inner = document.createElement('div');
    inner.className = 'ghost-card-inner';
    inner.style.transform = face === 'front' ? 'rotateY(180deg)' : 'rotateY(0deg)';

    const back = document.createElement('div');
    back.className = 'ghost-card-face back';
    const backMark = document.createElement('div');
    backMark.className = 'ghost-card-back-mark';
    backMark.textContent = 'H';
    back.appendChild(backMark);

    const front = document.createElement('div');
    front.className = 'ghost-card-face front';
    const frontValue = document.createElement('div');
    frontValue.className = 'ghost-card-front-value';
    frontValue.textContent = number === null ? '?' : String(number);
    const frontSuit = document.createElement('div');
    frontSuit.className = 'ghost-card-front-suit';
    frontSuit.textContent = suit === null ? '' : suit;
    front.appendChild(frontValue);
    front.appendChild(frontSuit);

    const crack = document.createElement('div');
    crack.className = 'ghost-card-crack';

    inner.appendChild(back);
    inner.appendChild(front);
    root.appendChild(inner);
    root.appendChild(crack);

    return { root, inner, crack };
  }

  async function animateDrawCard({
    drawnCardId,
    actorId,
    viewerIdForVisibility
  }: {
    drawnCardId: CardId;
    actorId: PlayerId;
    viewerIdForVisibility: PlayerId | null;
  }): Promise<void> {
    const layer = animationLayerRef.current;
    const deckRect = layoutSnapshotRef.current?.deckRect ?? null;
    const destRect = layoutSnapshotRef.current?.cardRects.get(drawnCardId) ?? null;
    const destNode = cardNodeByIdRef.current.get(drawnCardId) ?? null;

    if (!layer || !deckRect || !destRect || !destNode) {
      return;
    }

    const card = activeGameState?.cards[drawnCardId] ?? null;
    const showFront = card && actorId !== viewerIdForVisibility;
    const ghost = createGhostCardElement({
      suit: showFront ? card.suit : null,
      number: showFront ? card.number : null,
      face: showFront ? 'front' : 'back'
    });
    if (!ghost) {
      return;
    }

    const startLeft = deckRect.left + deckRect.width / 2 - destRect.width / 2;
    const startTop = deckRect.top + deckRect.height / 2 - destRect.height / 2;

    ghost.root.style.left = `${startLeft}px`;
    ghost.root.style.top = `${startTop}px`;
    ghost.root.style.width = `${destRect.width}px`;
    ghost.root.style.height = `${destRect.height}px`;

    layer.appendChild(ghost.root);

    const dx = destRect.left - startLeft;
    const dy = destRect.top - startTop;

    const originalOpacity = destNode.style.opacity;
    destNode.style.opacity = '0';

    try {
      await animate(
        ghost.root,
        {
          x: [0, dx * 0.86, dx],
          y: [0, dy * 0.86, dy],
          scale: [0.14, 1.08, 1],
          rotate: [-10, 2, 0],
          opacity: [0.6, 1, 1]
        },
        { duration: 0.5, ease: [0.2, 0.85, 0.2, 1] }
      ).finished;

      await animate(destNode, { opacity: [0, 1], scale: [0.98, 1] }, { duration: 0.16, ease: [0.2, 0.85, 0.2, 1] }).finished;
    } finally {
      ghost.root.remove();
      destNode.style.opacity = originalOpacity;
      destNode.style.removeProperty('scale');
    }
  }

  async function animatePlayToPeg({
    cardId,
    suit,
    number,
    shouldFlip
  }: {
    cardId: CardId;
    suit: Suit;
    number: number;
    shouldFlip: boolean;
  }): Promise<void> {
    const layer = animationLayerRef.current;
    const fromRect = prevLayoutSnapshotRef.current?.cardRects.get(cardId) ?? null;
    const peg = typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>(`[data-testid="peg-${suit}-${number}"]`);
    const toRect = peg?.getBoundingClientRect() ?? null;

    if (!layer || !fromRect || !peg || !toRect) {
      return;
    }

    const ghost = createGhostCardElement({ suit, number, face: shouldFlip ? 'back' : 'front' });
    if (!ghost) {
      return;
    }

    ghost.root.style.left = `${fromRect.left}px`;
    ghost.root.style.top = `${fromRect.top}px`;
    ghost.root.style.width = `${fromRect.width}px`;
    ghost.root.style.height = `${fromRect.height}px`;

    layer.appendChild(ghost.root);

    const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
    const scaleTo = Math.max(0.22, Math.min(0.42, toRect.width / fromRect.width));

    try {
      const zoomControls = animate(ghost.root, { y: -14, scale: 1.1, rotate: -2 }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] });
      const flipControls = shouldFlip
        ? animate(ghost.inner, { rotateY: [0, 180] }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] })
        : null;

      await Promise.all([zoomControls.finished, flipControls?.finished]);

      await animate(
        ghost.root,
        { x: dx, y: dy, scale: scaleTo, rotate: 0, opacity: [1, 0.2] },
        { duration: 0.66, ease: [0.2, 0.85, 0.2, 1] }
      ).finished;

      peg.classList.remove('peg-hit');
      void peg.getBoundingClientRect();
      peg.classList.add('peg-hit');
      peg.addEventListener('animationend', () => peg.classList.remove('peg-hit'), { once: true });
    } finally {
      ghost.root.remove();
    }
  }

  async function animateMisplay({
    cardId,
    suit,
    number,
    shouldFlip,
    spentFuseIndex
  }: {
    cardId: CardId;
    suit: Suit;
    number: number;
    shouldFlip: boolean;
    spentFuseIndex: number | null;
  }): Promise<void> {
    const layer = animationLayerRef.current;
    const fromRect = prevLayoutSnapshotRef.current?.cardRects.get(cardId) ?? null;
    if (!layer || !fromRect) {
      return;
    }

    const ghost = createGhostCardElement({ suit, number, face: shouldFlip ? 'back' : 'front' });
    if (!ghost) {
      return;
    }

    ghost.root.classList.add('misplay');
    ghost.root.style.left = `${fromRect.left}px`;
    ghost.root.style.top = `${fromRect.top}px`;
    ghost.root.style.width = `${fromRect.width}px`;
    ghost.root.style.height = `${fromRect.height}px`;

    layer.appendChild(ghost.root);

    try {
      const zoomControls = animate(ghost.root, { y: -14, scale: 1.1, rotate: -2 }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] });
      const flipControls = shouldFlip
        ? animate(ghost.inner, { rotateY: [0, 180] }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] })
        : null;

      await Promise.all([zoomControls.finished, flipControls?.finished]);

      ghost.root.classList.add('cracked');
      if (spentFuseIndex !== null) {
        triggerTokenFx(fuseTokenSlotRefs.current[spentFuseIndex] ?? null, 'token-fx-extinguish');
      }
      await animate(
        ghost.root,
        { y: [-14, -18, -10], scale: [1.1, 1.26, 0.86], rotate: [-2, 3, -4], opacity: [1, 1, 0] },
        { duration: 0.66, ease: [0.2, 0.85, 0.2, 1] }
      ).finished;
    } finally {
      ghost.root.remove();
    }
  }

  async function animateDiscardExplode({
    cardId,
    suit,
    number,
    shouldFlip
  }: {
    cardId: CardId;
    suit: Suit;
    number: number;
    shouldFlip: boolean;
  }): Promise<void> {
    const layer = animationLayerRef.current;
    const fromRect = prevLayoutSnapshotRef.current?.cardRects.get(cardId) ?? null;
    if (!layer || !fromRect) {
      return;
    }

    const ghost = createGhostCardElement({ suit, number, face: shouldFlip ? 'back' : 'front' });
    if (!ghost) {
      return;
    }

    ghost.root.style.left = `${fromRect.left}px`;
    ghost.root.style.top = `${fromRect.top}px`;
    ghost.root.style.width = `${fromRect.width}px`;
    ghost.root.style.height = `${fromRect.height}px`;

    layer.appendChild(ghost.root);

    try {
      const zoomControls = animate(ghost.root, { y: -12, scale: 1.1, rotate: -2 }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] });
      const flipControls = shouldFlip
        ? animate(ghost.inner, { rotateY: [0, 180] }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] })
        : null;

      await Promise.all([zoomControls.finished, flipControls?.finished]);

      ghost.root.classList.add('cracked');
      await animate(
        ghost.root,
        { y: [-12, -18, -10], scale: [1.1, 1.28, 0.86], rotate: [-2, 4, -6], opacity: [1, 1, 0] },
        { duration: 0.66, ease: [0.2, 0.85, 0.2, 1] }
      ).finished;
    } finally {
      ghost.root.remove();
    }
  }

  useEffect(() => {
    if (!activeGameState) {
      prevGameStateRef.current = null;
      return;
    }

    const previous = prevGameStateRef.current;
    prevGameStateRef.current = activeGameState;

    if (!previous) {
      return;
    }

    if (activeGameState.turn - previous.turn !== 1) {
      return;
    }

    const newLogs = activeGameState.logs.slice(previous.logs.length);
    if (newLogs.length === 0) {
      return;
    }

    const actionLog = [...newLogs].reverse().find((log) => log.type !== 'status') ?? null;
    if (!actionLog) {
      return;
    }

    const prevHintTokens = previous.hintTokens;
    const nextHintTokens = activeGameState.hintTokens;
    if (nextHintTokens < prevHintTokens) {
      triggerTokenFx(hintTokenSlotRefs.current[nextHintTokens] ?? null, 'token-fx-spend');
    } else if (nextHintTokens > prevHintTokens) {
      triggerTokenFx(hintTokenSlotRefs.current[prevHintTokens] ?? null, 'token-fx-gain');
    }

    if (actionLog.type === 'hint') {
      for (const cardId of actionLog.touchedCardIds) {
        triggerCardFx(cardId, 'hint-enter');
      }
      return;
    }

    if (actionLog.type !== 'play' && actionLog.type !== 'discard') {
      return;
    }

    const reduceMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canRunMotion = !reduceMotion
      && typeof document !== 'undefined'
      && typeof document.createElement('div').animate === 'function';
    if (!canRunMotion) {
      return;
    }

    const runId = animationRunIdRef.current + 1;
    animationRunIdRef.current = runId;
    setIsActionAnimationRunning(true);
    setTurnLockPlayerId(actionLog.actorId);

    const viewerIdAtAction = isLocalDebugMode
      ? previous.players[previous.currentTurnPlayerIndex]?.id ?? null
      : (perspective?.viewerId ?? null);

    const prevActor = previous.players.find((player) => player.id === actionLog.actorId);
    const nextActor = activeGameState.players.find((player) => player.id === actionLog.actorId);
    const prevHand = prevActor?.cards ?? [];
    const nextHand = nextActor?.cards ?? [];
    const prevHandSet = new Set(prevHand);
    const drawnCardId = nextHand.find((cardId) => !prevHandSet.has(cardId)) ?? null;

    const deckDelta = activeGameState.drawDeck.length - previous.drawDeck.length;
    const didDraw = deckDelta === -1 && drawnCardId !== null;

    const spentFuseIndex = (() => {
      const prevRemaining = previous.settings.maxFuseTokens - previous.fuseTokensUsed;
      const nextRemaining = activeGameState.settings.maxFuseTokens - activeGameState.fuseTokensUsed;
      if (nextRemaining !== prevRemaining - 1) {
        return null;
      }

      return nextRemaining;
    })();

    void (async () => {
      try {
        if (actionLog.type === 'play') {
          const shouldFlip = viewerIdAtAction !== null && actionLog.actorId === viewerIdAtAction;
          if (actionLog.success) {
            await animatePlayToPeg({ cardId: actionLog.cardId, suit: actionLog.suit, number: actionLog.number, shouldFlip });
          } else {
            await animateMisplay({
              cardId: actionLog.cardId,
              suit: actionLog.suit,
              number: actionLog.number,
              shouldFlip,
              spentFuseIndex
            });
          }
        }

        if (actionLog.type === 'discard') {
          const shouldFlip = viewerIdAtAction !== null && actionLog.actorId === viewerIdAtAction;
          await animateDiscardExplode({ cardId: actionLog.cardId, suit: actionLog.suit, number: actionLog.number, shouldFlip });
        }

        if (didDraw && drawnCardId) {
          await animateDrawCard({
            drawnCardId,
            actorId: actionLog.actorId,
            viewerIdForVisibility: perspective?.viewerId ?? null
          });
        }
      } finally {
        if (animationRunIdRef.current === runId) {
          setIsActionAnimationRunning(false);
          setTurnLockPlayerId(null);
        }
      }
    })();
  }, [activeGameState, isLocalDebugMode, perspective?.viewerId, triggerCardFx]);

  return {
    animationLayerRef,
    deckPillRef,
    cardNodeByIdRef,
    playerNameNodeByIdRef,
    hintTokenSlotRefs,
    fuseTokenSlotRefs,
    isActionAnimationRunning,
    turnLockPlayerId,
    triggerCardFx,
    resetAnimations
  };
}
