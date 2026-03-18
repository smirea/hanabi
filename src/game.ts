export const SUITS = ['R', 'Y', 'G', 'B', 'W', 'M'] as const;
const ALL_SUITS = SUITS;
export const BASE_SUITS = ['R', 'Y', 'G', 'B', 'W'] as const;
export const CARD_NUMBERS = [1, 2, 3, 4, 5] as const;

export type Suit = (typeof ALL_SUITS)[number];
export type CardNumber = (typeof CARD_NUMBERS)[number];
export type CardId = string;
export type PlayerId = string;

export type PendingAction = 'play' | 'discard' | 'hint-color' | 'hint-number' | null;
export type GameStatus = 'active' | 'last_round' | 'won' | 'lost' | 'finished';
type TerminalGameStatus = Extract<GameStatus, 'won' | 'lost' | 'finished'>;
type EndReason =
	| 'all_fireworks_completed'
	| 'fuse_limit_reached'
	| 'final_round_complete'
	| 'indispensable_card_discarded';

export interface CardHints {
	color: Suit | null;
	number: CardNumber | null;
	notColors: Suit[];
	notNumbers: CardNumber[];
	recentlyHinted: boolean;
}

export interface Card {
	id: CardId;
	suit: Suit;
	number: CardNumber;
	hints: CardHints;
}

export interface Player {
	id: PlayerId;
	name: string;
	cards: CardId[];
}

interface HintLog {
	id: string;
	turn: number;
	type: 'hint';
	actorId: PlayerId;
	actorName: string;
	targetId: PlayerId;
	targetName: string;
	hintType: 'color' | 'number';
	suit: Suit | null;
	number: CardNumber | null;
	touchedCardIds: CardId[];
}

interface PlayLog {
	id: string;
	turn: number;
	type: 'play';
	actorId: PlayerId;
	actorName: string;
	cardId: CardId;
	suit: Suit;
	number: CardNumber;
	success: boolean;
	gainedHint: boolean;
	fuseTokensUsed: number;
}

interface DiscardLog {
	id: string;
	turn: number;
	type: 'discard';
	actorId: PlayerId;
	actorName: string;
	cardId: CardId;
	suit: Suit;
	number: CardNumber;
	gainedHint: boolean;
}

interface DrawLog {
	id: string;
	turn: number;
	type: 'draw';
	actorId: PlayerId;
	actorName: string;
	cardId: CardId;
	remainingDeck: number;
}

interface StatusLog {
	id: string;
	turn: number;
	type: 'status';
	status: TerminalGameStatus;
	reason: EndReason;
	score: number;
}

export type GameLogEntry = HintLog | PlayLog | DiscardLog | DrawLog | StatusLog;

export interface GameUiState {
	pendingAction: PendingAction;
	selectedCardId: CardId | null;
	selectedTargetPlayerId: PlayerId | null;
	selectedHintSuit: Suit | null;
	selectedHintNumber: CardNumber | null;
	highlightedCardIds: CardId[];
}

export interface GameSettings {
	includeMulticolor: boolean;
	multicolorShortDeck: boolean;
	multicolorWildHints: boolean;
	endlessMode: boolean;
	activeSuits: Suit[];
	maxHintTokens: number;
	maxFuseTokens: number;
	handSize: number;
}

interface LastRoundState {
	turnsRemaining: number;
}

export interface HanabiState {
	players: Player[];
	currentTurnPlayerIndex: number;
	cards: Record<CardId, Card>;
	drawDeck: CardId[];
	discardPile: CardId[];
	fireworks: Record<Suit, CardId[]>;
	hintTokens: number;
	fuseTokensUsed: number;
	status: GameStatus;
	lastRound: LastRoundState | null;
	logs: GameLogEntry[];
	ui: GameUiState;
	turn: number;
	nextLogId: number;
	settings: GameSettings;
}

interface CardSeed {
	suit: Suit;
	number: CardNumber;
}

interface NewGameInput {
	playerNames?: string[];
	playerIds?: string[];
	includeMulticolor?: boolean;
	multicolorShortDeck?: boolean;
	multicolorWildHints?: boolean;
	endlessMode?: boolean;
	maxHintTokens?: number;
	maxFuseTokens?: number;
	startingPlayerIndex?: number;
	deck?: CardSeed[];
	shuffleSeed?: number;
}

const CARD_COPIES: Record<CardNumber, number> = {
	1: 3,
	2: 2,
	3: 2,
	4: 2,
	5: 1,
};

export interface PerspectiveCard {
	id: CardId;
	suit: Suit | null;
	number: CardNumber | null;
	hints: CardHints;
	isHiddenFromViewer: boolean;
}

export interface PerspectivePlayer {
	id: PlayerId;
	name: string;
	cards: PerspectiveCard[];
	isViewer: boolean;
	isCurrentTurn: boolean;
}

export type PerspectiveCountsByNumber = Record<CardNumber, number>;
export type PerspectiveCountsBySuit = Record<Suit, PerspectiveCountsByNumber>;

export interface HanabiPerspectiveState {
	viewerId: PlayerId;
	currentTurnPlayerId: PlayerId;
	players: PerspectivePlayer[];
	hintTokens: number;
	maxHintTokens: number;
	fuseTokensUsed: number;
	maxFuseTokens: number;
	drawDeckCount: number;
	status: GameStatus;
	turn: number;
	score: number;
	activeSuits: Suit[];
	logs: GameLogEntry[];
	ui: GameUiState;
	fireworksHeights: Record<Suit, number>;
	knownUnavailableCounts: PerspectiveCountsBySuit;
	knownRemainingCounts: PerspectiveCountsBySuit;
}

function deepClone<T>(value: T): T {
	return structuredClone(value);
}

function createEmptyUiState(): GameUiState {
	return {
		pendingAction: null,
		selectedCardId: null,
		selectedTargetPlayerId: null,
		selectedHintSuit: null,
		selectedHintNumber: null,
		highlightedCardIds: [],
	};
}

function createEmptyCountsBySuit(): PerspectiveCountsBySuit {
	return {
		R: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
		Y: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
		G: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
		B: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
		W: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
		M: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
	};
}

function addUnique<T>(target: T[], value: T): void {
	if (!target.includes(value)) {
		target.push(value);
	}
}

export class HanabiGame {
	public state: HanabiState;

	public constructor(input?: NewGameInput) {
		this.state = HanabiGame.createInitialState(input);
	}

	public static fromState(state: HanabiState): HanabiGame {
		const game = Object.create(HanabiGame.prototype) as HanabiGame;
		game.state = HanabiGame.normalizeRestoredState(state);
		return game;
	}

	public getSnapshot(): HanabiState {
		return deepClone(this.state);
	}

	public replaceState(state: HanabiState): void {
		this.state = deepClone(state);
	}

	public isGameOver(): boolean {
		return HanabiGame.isTerminalStatus(this.state.status);
	}

	public getScore(): number {
		return this.state.settings.activeSuits.reduce((sum, suit) => sum + this.state.fireworks[suit].length, 0);
	}

	public getPerspectiveState(viewerId: PlayerId): HanabiPerspectiveState {
		const viewer = this.state.players.find(player => player.id === viewerId);
		if (!viewer) {
			throw new Error(`Unknown perspective player: ${viewerId}`);
		}

		const currentTurnPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		const knownUnavailableCounts = createEmptyCountsBySuit();

		for (const cardId of this.state.discardPile) {
			const card = this.getCardOrThrow(cardId);
			knownUnavailableCounts[card.suit][card.number] += 1;
		}

		for (const suit of ALL_SUITS) {
			for (const cardId of this.state.fireworks[suit]) {
				const card = this.getCardOrThrow(cardId);
				knownUnavailableCounts[card.suit][card.number] += 1;
			}
		}

		for (const player of this.state.players) {
			if (player.id === viewer.id) {
				continue;
			}

			for (const cardId of player.cards) {
				const card = this.getCardOrThrow(cardId);
				knownUnavailableCounts[card.suit][card.number] += 1;
			}
		}

		const knownRemainingCounts = createEmptyCountsBySuit();
		for (const suit of ALL_SUITS) {
			for (const number of CARD_NUMBERS) {
				const totalCopies = this.getCopiesPerCard(suit, number);
				knownRemainingCounts[suit][number] = Math.max(0, totalCopies - knownUnavailableCounts[suit][number]);
			}
		}

		const fireworksHeights = ALL_SUITS.reduce(
			(acc, suit) => {
				acc[suit] = this.state.fireworks[suit].length;
				return acc;
			},
			{} as Record<Suit, number>,
		);

		return {
			viewerId,
			currentTurnPlayerId: currentTurnPlayer.id,
			players: this.state.players.map(player => ({
				id: player.id,
				name: player.name,
				isViewer: player.id === viewerId,
				isCurrentTurn: player.id === currentTurnPlayer.id,
				cards: player.cards.map(cardId => {
					const card = this.getCardOrThrow(cardId);
					const isHiddenFromViewer = player.id === viewerId;

					return {
						id: card.id,
						suit: isHiddenFromViewer ? null : card.suit,
						number: isHiddenFromViewer ? null : card.number,
						hints: deepClone(card.hints),
						isHiddenFromViewer,
					};
				}),
			})),
			hintTokens: this.state.hintTokens,
			maxHintTokens: this.state.settings.maxHintTokens,
			fuseTokensUsed: this.state.fuseTokensUsed,
			maxFuseTokens: this.state.settings.maxFuseTokens,
			drawDeckCount: this.state.drawDeck.length,
			status: this.state.status,
			turn: this.state.turn,
			score: this.getScore(),
			activeSuits: [...this.state.settings.activeSuits],
			logs: deepClone(this.state.logs),
			ui: deepClone(this.state.ui),
			fireworksHeights,
			knownUnavailableCounts,
			knownRemainingCounts,
		};
	}

	public beginPlaySelection(): void {
		this.assertTurnCanBePlayed();
		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		if (currentPlayer.cards.length === 0) {
			throw new Error('Cannot play with no cards in hand');
		}

		this.state.ui = {
			...createEmptyUiState(),
			pendingAction: 'play',
		};
	}

	public beginDiscardSelection(): void {
		this.assertTurnCanBePlayed();
		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		if (currentPlayer.cards.length === 0) {
			throw new Error('Cannot discard with no cards in hand');
		}

		this.state.ui = {
			...createEmptyUiState(),
			pendingAction: 'discard',
		};
	}

	public beginColorHintSelection(): void {
		this.assertTurnCanBePlayed();
		if (this.state.hintTokens <= 0) {
			throw new Error('Cannot give a hint with zero hint tokens');
		}

		this.state.ui = {
			...createEmptyUiState(),
			pendingAction: 'hint-color',
		};
	}

	public beginNumberHintSelection(): void {
		this.assertTurnCanBePlayed();
		if (this.state.hintTokens <= 0) {
			throw new Error('Cannot give a hint with zero hint tokens');
		}

		this.state.ui = {
			...createEmptyUiState(),
			pendingAction: 'hint-number',
		};
	}

	public cancelSelection(): void {
		this.state.ui = createEmptyUiState();
	}

	public selectCard(cardId: CardId): void {
		this.assertTurnCanBePlayed();
		const pendingAction = this.state.ui.pendingAction;
		if (pendingAction !== 'play' && pendingAction !== 'discard') {
			throw new Error('Card selection is only available for play or discard actions');
		}

		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		if (!currentPlayer.cards.includes(cardId)) {
			throw new Error('Selected card is not in the current player hand');
		}

		this.state.ui.selectedCardId = cardId;
		this.state.ui.highlightedCardIds = [cardId];
	}

	public selectHintTarget(playerId: PlayerId): void {
		this.assertTurnCanBePlayed();
		const pendingAction = this.state.ui.pendingAction;
		if (pendingAction !== 'hint-color' && pendingAction !== 'hint-number') {
			throw new Error('Hint target selection is only available for hint actions');
		}

		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		if (currentPlayer.id === playerId) {
			throw new Error('Cannot target yourself with a hint');
		}

		const playerExists = this.state.players.some(player => player.id === playerId);
		if (!playerExists) {
			throw new Error(`Unknown player: ${playerId}`);
		}

		this.state.ui.selectedTargetPlayerId = playerId;
		this.recomputeHintHighlights();
	}

	public selectHintColor(suit: Suit): void {
		this.assertTurnCanBePlayed();
		if (this.state.ui.pendingAction !== 'hint-color') {
			throw new Error('Color selection is only available for color hints');
		}

		if (!this.state.settings.activeSuits.includes(suit)) {
			throw new Error(`Color ${suit} is not active in this game`);
		}

		if (suit === 'M') {
			throw new Error('Cannot call multicolor color hints');
		}

		this.state.ui.selectedHintSuit = suit;
		this.recomputeHintHighlights();
	}

	public selectHintNumber(number: CardNumber): void {
		this.assertTurnCanBePlayed();
		if (this.state.ui.pendingAction !== 'hint-number') {
			throw new Error('Number selection is only available for number hints');
		}

		this.state.ui.selectedHintNumber = number;
		this.recomputeHintHighlights();
	}

	public confirmSelection(): void {
		this.assertTurnCanBePlayed();
		const pendingAction = this.state.ui.pendingAction;
		if (pendingAction === null) {
			throw new Error('No pending action to confirm');
		}

		if (pendingAction === 'play') {
			if (!this.state.ui.selectedCardId) {
				throw new Error('Select a card before confirming play');
			}

			this.playCard(this.state.ui.selectedCardId);
			return;
		}

		if (pendingAction === 'discard') {
			if (!this.state.ui.selectedCardId) {
				throw new Error('Select a card before confirming discard');
			}

			this.discardCard(this.state.ui.selectedCardId);
			return;
		}

		if (pendingAction === 'hint-color') {
			if (!this.state.ui.selectedTargetPlayerId || !this.state.ui.selectedHintSuit) {
				throw new Error('Select a target and a color before confirming hint');
			}

			this.giveColorHint(this.state.ui.selectedTargetPlayerId, this.state.ui.selectedHintSuit);
			return;
		}

		if (!this.state.ui.selectedTargetPlayerId || !this.state.ui.selectedHintNumber) {
			throw new Error('Select a target and a number before confirming hint');
		}

		this.giveNumberHint(this.state.ui.selectedTargetPlayerId, this.state.ui.selectedHintNumber);
	}

	public playCard(cardId: CardId): void {
		this.assertTurnCanBePlayed();

		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		const cardIndex = currentPlayer.cards.indexOf(cardId);
		if (cardIndex === -1) {
			throw new Error('Can only play a card from the current player hand');
		}

		const card = this.getCardOrThrow(cardId);
		this.clearRecentHints();
		currentPlayer.cards.splice(cardIndex, 1);

		const expectedNumber = this.state.fireworks[card.suit].length + 1;
		const success = card.number === expectedNumber;
		let gainedHint = false;

		if (success) {
			this.state.fireworks[card.suit].push(cardId);
			if (card.number === 5 && this.state.hintTokens < this.state.settings.maxHintTokens) {
				this.state.hintTokens += 1;
				gainedHint = true;
			}
		} else {
			this.state.discardPile.push(cardId);
			this.state.fuseTokensUsed += 1;
		}

		this.appendPlayLog(currentPlayer, card, success, gainedHint);

		if (!success && this.state.fuseTokensUsed >= this.state.settings.maxFuseTokens) {
			this.transitionToTerminalState('lost', 'fuse_limit_reached');
			this.finalizeAction();
			return;
		}

		if (!success && this.state.settings.endlessMode && !this.isPerfectionStillPossible()) {
			this.transitionToTerminalState('lost', 'indispensable_card_discarded');
			this.finalizeAction();
			return;
		}

		if (success && this.areAllFireworksComplete()) {
			this.transitionToTerminalState('won', 'all_fireworks_completed');
			this.finalizeAction();
			return;
		}

		const deckEmptiedOnDraw = this.drawCardForPlayer(this.state.currentTurnPlayerIndex);
		if (deckEmptiedOnDraw && !this.state.settings.endlessMode && this.state.status === 'active') {
			this.state.status = 'last_round';
			this.state.lastRound = { turnsRemaining: this.state.players.length };
		}

		this.finalizeAction({ enteredLastRound: deckEmptiedOnDraw });
	}

	public discardCard(cardId: CardId): void {
		this.assertTurnCanBePlayed();

		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		const cardIndex = currentPlayer.cards.indexOf(cardId);
		if (cardIndex === -1) {
			throw new Error('Can only discard a card from the current player hand');
		}

		const card = this.getCardOrThrow(cardId);
		this.clearRecentHints();
		currentPlayer.cards.splice(cardIndex, 1);
		this.state.discardPile.push(cardId);
		const gainedHint = this.state.hintTokens < this.state.settings.maxHintTokens;
		if (gainedHint) {
			this.state.hintTokens += 1;
		}

		this.appendDiscardLog(currentPlayer, card, gainedHint);
		if (this.state.settings.endlessMode && !this.isPerfectionStillPossible()) {
			this.transitionToTerminalState('lost', 'indispensable_card_discarded');
			this.finalizeAction();
			return;
		}

		const deckEmptiedOnDraw = this.drawCardForPlayer(this.state.currentTurnPlayerIndex);
		if (deckEmptiedOnDraw && !this.state.settings.endlessMode && this.state.status === 'active') {
			this.state.status = 'last_round';
			this.state.lastRound = { turnsRemaining: this.state.players.length };
		}

		this.finalizeAction({ enteredLastRound: deckEmptiedOnDraw });
	}

	public giveColorHint(targetPlayerId: PlayerId, suit: Suit): void {
		this.assertTurnCanBePlayed();

		if (!this.state.settings.activeSuits.includes(suit)) {
			throw new Error(`Color ${suit} is not active in this game`);
		}

		if (suit === 'M') {
			throw new Error('Cannot call multicolor color hints');
		}

		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		const targetPlayer = this.getHintTargetPlayerOrThrow(targetPlayerId);
		if (this.state.hintTokens <= 0) {
			throw new Error('Cannot give a hint with zero hint tokens');
		}

		const touchedCardIds = targetPlayer.cards.filter(cardId => {
			const card = this.getCardOrThrow(cardId);
			return this.doesCardMatchColorHint(card.suit, suit);
		});
		if (touchedCardIds.length === 0) {
			throw new Error(`Hint must touch at least one card (${suit})`);
		}

		const touchedSet = new Set(touchedCardIds);

		const redundant = targetPlayer.cards.every(cardId => {
			const card = this.getCardOrThrow(cardId);
			if (touchedSet.has(cardId)) {
				return card.hints.color === suit && !card.hints.notColors.includes(suit);
			}

			return card.hints.notColors.includes(suit);
		});

		if (redundant) {
			throw new Error('Hint would provide no new information');
		}

		this.clearRecentHints();
		this.state.hintTokens -= 1;

		for (const cardId of targetPlayer.cards) {
			const card = this.getCardOrThrow(cardId);
			if (touchedSet.has(cardId)) {
				card.hints.color = suit;
				card.hints.notColors = card.hints.notColors.filter(value => value !== suit);
				card.hints.recentlyHinted = true;
			} else {
				addUnique(card.hints.notColors, suit);
			}
		}

		this.appendHintLog(currentPlayer, targetPlayer, 'color', touchedCardIds, suit, null);
		this.finalizeAction();
	}

	public giveNumberHint(targetPlayerId: PlayerId, number: CardNumber): void {
		this.assertTurnCanBePlayed();

		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		const targetPlayer = this.getHintTargetPlayerOrThrow(targetPlayerId);
		if (this.state.hintTokens <= 0) {
			throw new Error('Cannot give a hint with zero hint tokens');
		}

		const touchedCardIds = targetPlayer.cards.filter(cardId => this.state.cards[cardId].number === number);
		if (touchedCardIds.length === 0) {
			throw new Error(`Hint must touch at least one card (${number})`);
		}

		const touchedSet = new Set(touchedCardIds);

		const redundant = targetPlayer.cards.every(cardId => {
			const card = this.getCardOrThrow(cardId);
			if (touchedSet.has(cardId)) {
				return card.hints.number === number && !card.hints.notNumbers.includes(number);
			}

			return card.hints.notNumbers.includes(number);
		});

		if (redundant) {
			throw new Error('Hint would provide no new information');
		}

		this.clearRecentHints();
		this.state.hintTokens -= 1;

		for (const cardId of targetPlayer.cards) {
			const card = this.getCardOrThrow(cardId);
			if (touchedSet.has(cardId)) {
				card.hints.number = number;
				card.hints.notNumbers = card.hints.notNumbers.filter(value => value !== number);
				card.hints.recentlyHinted = true;
			} else {
				addUnique(card.hints.notNumbers, number);
			}
		}

		this.appendHintLog(currentPlayer, targetPlayer, 'number', touchedCardIds, null, number);
		this.finalizeAction();
	}

	private static createInitialState(input: NewGameInput | undefined): HanabiState {
		const playerNames = input?.playerNames ?? ['Player 1', 'Player 2'];
		const playerIds = input?.playerIds ?? playerNames.map((_, index) => `p${index + 1}`);
		const includeMulticolor = Boolean(input?.includeMulticolor);
		const multicolorWildHints = includeMulticolor;
		const multicolorShortDeck = includeMulticolor;
		const endlessMode = input?.endlessMode ?? false;
		const maxHintTokens = input?.maxHintTokens ?? 8;
		const maxFuseTokens = input?.maxFuseTokens ?? 3;
		const handSize = playerNames.length <= 3 ? 5 : 4;
		const activeSuits = includeMulticolor ? [...ALL_SUITS] : [...BASE_SUITS];
		const deckSeed = input?.deck ? deepClone(input.deck) : HanabiGame.buildDeck(includeMulticolor, multicolorShortDeck);
		const shuffledDeck = input?.deck ? deckSeed : HanabiGame.shuffleDeck(deckSeed, input?.shuffleSeed);

		const cards: Record<CardId, Card> = {};
		const drawDeck: CardId[] = [];
		for (const [index, seed] of shuffledDeck.entries()) {
			const cardId = `c${String(index + 1).padStart(3, '0')}`;
			cards[cardId] = {
				id: cardId,
				suit: seed.suit,
				number: seed.number,
				hints: {
					color: null,
					number: null,
					notColors: [],
					notNumbers: [],
					recentlyHinted: false,
				},
			};
			drawDeck.push(cardId);
		}

		const players: Player[] = playerNames.map((name, index) => ({
			id: playerIds[index],
			name,
			cards: [],
		}));

		for (let round = 0; round < handSize; round += 1) {
			for (const player of players) {
				const nextCardId = drawDeck.shift();
				if (!nextCardId) {
					throw new Error('Not enough cards to deal starting hands');
				}

				player.cards.push(nextCardId);
			}
		}

		const startingPlayerIndex = input?.startingPlayerIndex ?? 0;
		return {
			players,
			currentTurnPlayerIndex: startingPlayerIndex,
			cards,
			drawDeck,
			discardPile: [],
			fireworks: {
				R: [],
				Y: [],
				G: [],
				B: [],
				W: [],
				M: [],
			},
			hintTokens: maxHintTokens,
			fuseTokensUsed: 0,
			status: 'active',
			lastRound: null,
			logs: [],
			ui: createEmptyUiState(),
			turn: 1,
			nextLogId: 1,
			settings: {
				includeMulticolor,
				multicolorShortDeck,
				multicolorWildHints,
				endlessMode,
				activeSuits,
				maxHintTokens,
				maxFuseTokens,
				handSize,
			},
		};
	}

	private static buildDeck(includeMulticolor: boolean, multicolorShortDeck: boolean): CardSeed[] {
		const suits = includeMulticolor ? ALL_SUITS : BASE_SUITS;
		const deck: CardSeed[] = [];

		for (const suit of suits) {
			for (const number of CARD_NUMBERS) {
				const copies = suit === 'M' && multicolorShortDeck ? 1 : CARD_COPIES[number];
				for (let copy = 0; copy < copies; copy += 1) {
					deck.push({ suit, number });
				}
			}
		}

		return deck;
	}

	private static shuffleDeck(deck: CardSeed[], seed: number | undefined): CardSeed[] {
		const shuffled = [...deck];
		const random =
			seed === undefined
				? Math.random
				: (() => {
						let state = seed >>> 0 || 1;
						return () => {
							state = (state * 1664525 + 1013904223) >>> 0;
							return state / 0x100000000;
						};
					})();

		for (let index = shuffled.length - 1; index > 0; index -= 1) {
			const swapIndex = Math.floor(random() * (index + 1));
			[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
		}

		return shuffled;
	}

	private assertTurnCanBePlayed(): void {
		if (HanabiGame.isTerminalStatus(this.state.status)) {
			throw new Error(`Game is over (${this.state.status})`);
		}
	}

	private getCopiesPerCard(suit: Suit, number: CardNumber): number {
		if (suit === 'M' && this.state.settings.multicolorShortDeck) {
			return 1;
		}

		return CARD_COPIES[number];
	}

	private static isTerminalStatus(status: GameStatus): status is TerminalGameStatus {
		return status === 'won' || status === 'lost' || status === 'finished';
	}

	private getCardOrThrow(cardId: CardId): Card {
		const card = this.state.cards[cardId];
		if (!card) {
			throw new Error(`Unknown card: ${cardId}`);
		}

		return card;
	}

	private getHintTargetPlayerOrThrow(targetPlayerId: PlayerId): Player {
		const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
		if (currentPlayer.id === targetPlayerId) {
			throw new Error('Cannot target yourself with a hint');
		}

		const targetPlayer = this.state.players.find(player => player.id === targetPlayerId);
		if (!targetPlayer) {
			throw new Error(`Unknown player: ${targetPlayerId}`);
		}

		return targetPlayer;
	}

	private recomputeHintHighlights(): void {
		const pendingAction = this.state.ui.pendingAction;
		if (pendingAction !== 'hint-color' && pendingAction !== 'hint-number') {
			this.state.ui.highlightedCardIds = [];
			return;
		}

		const targetId = this.state.ui.selectedTargetPlayerId;
		if (!targetId) {
			this.state.ui.highlightedCardIds = [];
			return;
		}

		const target = this.state.players.find(player => player.id === targetId);
		if (!target) {
			throw new Error(`Unknown player: ${targetId}`);
		}

		if (pendingAction === 'hint-color') {
			if (!this.state.ui.selectedHintSuit) {
				this.state.ui.highlightedCardIds = [];
				return;
			}

			const hintSuit = this.state.ui.selectedHintSuit;
			this.state.ui.highlightedCardIds = target.cards.filter(cardId => {
				const card = this.state.cards[cardId];
				if (!card) {
					throw new Error(`Unknown card in target hand: ${cardId}`);
				}

				return this.doesCardMatchColorHint(card.suit, hintSuit);
			});
			return;
		}

		if (!this.state.ui.selectedHintNumber) {
			this.state.ui.highlightedCardIds = [];
			return;
		}

		this.state.ui.highlightedCardIds = target.cards.filter(
			cardId => this.state.cards[cardId].number === this.state.ui.selectedHintNumber,
		);
	}

	private clearRecentHints(): void {
		for (const card of Object.values(this.state.cards)) {
			card.hints.recentlyHinted = false;
		}
	}

	private doesCardMatchColorHint(cardSuit: Suit, hintSuit: Suit): boolean {
		if (cardSuit === hintSuit) {
			return true;
		}

		return this.state.settings.includeMulticolor && cardSuit === 'M' && hintSuit !== 'M';
	}

	private isPerfectionStillPossible(): boolean {
		const remaining = createEmptyCountsBySuit();

		for (const cardId of this.state.drawDeck) {
			const card = this.state.cards[cardId];
			if (!card) {
				throw new Error(`Unknown card in drawDeck: ${cardId}`);
			}

			remaining[card.suit][card.number] += 1;
		}

		for (const player of this.state.players) {
			for (const cardId of player.cards) {
				const card = this.state.cards[cardId];
				if (!card) {
					throw new Error(`Unknown card in player hand: ${cardId}`);
				}

				remaining[card.suit][card.number] += 1;
			}
		}

		for (const suit of this.state.settings.activeSuits) {
			const height = this.state.fireworks[suit].length;
			for (const number of CARD_NUMBERS) {
				if (number <= height) {
					continue;
				}

				if (remaining[suit][number] <= 0) {
					return false;
				}
			}
		}

		return true;
	}

	private drawCardForPlayer(playerIndex: number): boolean {
		if (this.state.drawDeck.length === 0) {
			return false;
		}

		const drawnCardId = this.state.drawDeck.shift();
		if (!drawnCardId) {
			throw new Error('Draw pile is unexpectedly empty');
		}

		const player = this.state.players[playerIndex];
		player.cards.push(drawnCardId);
		return this.state.drawDeck.length === 0;
	}

	private anyPlayerHasLegalAction(): boolean {
		for (let index = 0; index < this.state.players.length; index += 1) {
			if (this.playerHasLegalAction(index)) {
				return true;
			}
		}

		return false;
	}

	private canPlayerGiveHint(playerIndex: number): boolean {
		if (this.state.hintTokens <= 0) {
			return false;
		}

		for (let index = 0; index < this.state.players.length; index += 1) {
			if (index === playerIndex) {
				continue;
			}

			if (this.state.players[index].cards.length > 0) {
				return true;
			}
		}

		return false;
	}

	private playerHasLegalAction(playerIndex: number): boolean {
		const player = this.state.players[playerIndex];
		if (!player) {
			throw new Error(`Unknown player index: ${playerIndex}`);
		}

		if (player.cards.length > 0) {
			return true;
		}

		return this.canPlayerGiveHint(playerIndex);
	}

	private advanceTurn(): void {
		const playerCount = this.state.players.length;
		const currentIndex = this.state.currentTurnPlayerIndex;

		for (let offset = 1; offset <= playerCount; offset += 1) {
			const candidateIndex = (currentIndex + offset) % playerCount;
			if (this.playerHasLegalAction(candidateIndex)) {
				this.state.currentTurnPlayerIndex = candidateIndex;
				return;
			}
		}

		this.state.currentTurnPlayerIndex = (currentIndex + 1) % playerCount;
	}

	private areAllFireworksComplete(): boolean {
		return this.state.settings.activeSuits.every(suit => this.state.fireworks[suit].length === CARD_NUMBERS.length);
	}

	private transitionToTerminalState(status: TerminalGameStatus, reason: EndReason): void {
		this.state.status = status;
		this.state.lastRound = null;
		this.appendStatusLog(status, reason);
	}

	private finalizeAction({ enteredLastRound = false }: { enteredLastRound?: boolean } = {}): void {
		if (!HanabiGame.isTerminalStatus(this.state.status) && this.areAllFireworksComplete()) {
			this.transitionToTerminalState('won', 'all_fireworks_completed');
		}

		if (!HanabiGame.isTerminalStatus(this.state.status) && this.state.status === 'last_round') {
			if (!this.state.lastRound) {
				throw new Error('lastRound state is required while status is last_round');
			}

			if (!enteredLastRound) {
				this.state.lastRound.turnsRemaining -= 1;
			}

			if (this.state.lastRound.turnsRemaining <= 0) {
				this.transitionToTerminalState('finished', 'final_round_complete');
			}
		}

		if (!HanabiGame.isTerminalStatus(this.state.status) && !this.anyPlayerHasLegalAction()) {
			this.transitionToTerminalState('finished', 'final_round_complete');
		}

		if (!HanabiGame.isTerminalStatus(this.state.status)) {
			this.advanceTurn();
		}

		this.state.turn += 1;
		this.state.ui = createEmptyUiState();
	}

	private nextLogId(): string {
		const id = `log-${String(this.state.nextLogId).padStart(4, '0')}`;
		this.state.nextLogId += 1;
		return id;
	}

	private appendHintLog(
		actor: Player,
		target: Player,
		hintType: 'color' | 'number',
		touchedCardIds: CardId[],
		suit: Suit | null,
		number: CardNumber | null,
	): void {
		this.state.logs.push({
			id: this.nextLogId(),
			turn: this.state.turn,
			type: 'hint',
			actorId: actor.id,
			actorName: actor.name,
			targetId: target.id,
			targetName: target.name,
			hintType,
			suit,
			number,
			touchedCardIds: [...touchedCardIds],
		});
	}

	private appendPlayLog(actor: Player, card: Card, success: boolean, gainedHint: boolean): void {
		this.state.logs.push({
			id: this.nextLogId(),
			turn: this.state.turn,
			type: 'play',
			actorId: actor.id,
			actorName: actor.name,
			cardId: card.id,
			suit: card.suit,
			number: card.number,
			success,
			gainedHint,
			fuseTokensUsed: this.state.fuseTokensUsed,
		});
	}

	private appendDiscardLog(actor: Player, card: Card, gainedHint: boolean): void {
		this.state.logs.push({
			id: this.nextLogId(),
			turn: this.state.turn,
			type: 'discard',
			actorId: actor.id,
			actorName: actor.name,
			cardId: card.id,
			suit: card.suit,
			number: card.number,
			gainedHint,
		});
	}

	private appendStatusLog(status: TerminalGameStatus, reason: EndReason): void {
		this.state.logs.push({
			id: this.nextLogId(),
			turn: this.state.turn,
			type: 'status',
			status,
			reason,
			score: this.getScore(),
		});
	}

	private static normalizeRestoredState(state: HanabiState): HanabiState {
		const cloned = deepClone(state);
		cloned.settings.multicolorWildHints = cloned.settings.includeMulticolor;

		if (cloned.status === 'last_round') {
			cloned.status = 'active';
			cloned.lastRound = null;
		}

		return cloned;
	}
}
