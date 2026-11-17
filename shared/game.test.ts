import { expect, test } from 'bun:test';
import {
	HanabiGame,
	getFireworkCardNumbers,
	type Card,
	type CardNumber,
	type HanabiState,
	type Suit,
} from './game';

type DeckCard = { suit: Suit; number: CardNumber };

const card = (suit: Suit, number: CardNumber): DeckCard => ({ suit, number });

function twoPlayerDeck(
	playerOneHand: DeckCard[],
	playerTwoHand: DeckCard[],
	tail: DeckCard[] = [],
): DeckCard[] {
	const deck: DeckCard[] = [];
	for (let index = 0; index < 5; index += 1) {
		deck.push(playerOneHand[index], playerTwoHand[index]);
	}
	deck.push(...tail);
	return deck;
}

function unhintedCard(id: string, suit: Suit, number: CardNumber): Card {
	return {
		id,
		suit,
		number,
		hints: { color: null, number: null, notColors: [], notNumbers: [], recentlyHinted: false },
	};
}

const ONES = [card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)];
const TWOS = [card('R', 2), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)];

function createAlmostWonState(): HanabiState {
	const game = new HanabiGame({ playerNames: ['A', 'B'], deck: twoPlayerDeck(ONES, TWOS) });
	const state = game.getSnapshot();
	state.cards = {};
	state.fireworks = { R: [], Y: [], G: [], B: [], W: [], M: [], K: [] };
	for (const suit of ['R', 'Y', 'G', 'B', 'W'] as const) {
		for (const number of [1, 2, 3, 4, 5] as const) {
			const id = `${suit}${number}`;
			state.cards[id] = unhintedCard(id, suit, number);
			if (id !== 'W5') {
				state.fireworks[suit].push(id);
			}
		}
	}
	state.cards.extra = unhintedCard('extra', 'R', 1);
	state.players[0].cards = ['W5'];
	state.players[1].cards = ['extra'];
	state.drawDeck = [];
	state.discardPile = [];
	state.hintTokens = 7;
	state.currentTurnPlayerIndex = 0;
	return state;
}

function createOneDiscardFromNoValidPlaysLeftState(): HanabiState {
	const state = createAlmostWonState();
	for (const [id, suit, number] of [
		['needed-y4', 'Y', 4],
		['left-2', 'Y', 2],
		['left-unknown', 'B', 1],
		['right-5', 'Y', 5],
		['right-4', 'B', 4],
		['right-1', 'B', 1],
		['discarded-g4', 'G', 4],
	] as const) {
		state.cards[id] = unhintedCard(id, suit, number);
	}
	state.players[0].cards = ['needed-y4', 'left-2', 'left-unknown'];
	state.players[1].cards = ['right-5', 'right-4', 'right-1'];
	state.discardPile = ['discarded-g4'];
	state.fireworks.Y = ['Y1', 'Y2', 'Y3'];
	state.fireworks.G = ['G1', 'G2', 'G3'];
	state.fireworks.W.push('W5');
	return state;
}

function addFireworkCard(game: HanabiGame, suit: Suit, number: CardNumber): void {
	const id = `played-${suit}-${number}`;
	game.state.cards[id] = unhintedCard(id, suit, number);
	game.state.fireworks[suit].push(id);
}

function addDiscard(game: HanabiGame, id: string, suit: Suit, number: CardNumber): void {
	game.state.cards[id] = unhintedCard(id, suit, number);
	game.state.discardPile.push(id);
}

function createFlamboyantFiveGame(bonusTiles: string[]): HanabiGame {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		includeFlamboyants: true,
		bonusTiles: bonusTiles as never,
		deck: twoPlayerDeck(
			[card('R', 5), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
			[card('R', 1), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
		),
	});
	for (const number of [1, 2, 3, 4] as const) {
		addFireworkCard(game, 'R', number);
	}
	game.state.hintTokens = 6;
	return game;
}

function createFlamboyantBlackOneGame(bonusTiles: string[]): HanabiGame {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		includeBlack: true,
		includeFlamboyants: true,
		bonusTiles: bonusTiles as never,
		deck: twoPlayerDeck(
			[card('K', 1), card('R', 1), card('Y', 1), card('G', 1), card('B', 1)],
			[card('W', 1), card('R', 2), card('Y', 2), card('G', 2), card('B', 2)],
		),
	});
	for (const number of [5, 4, 3, 2] as const) {
		addFireworkCard(game, 'K', number);
	}
	game.state.hintTokens = 6;
	return game;
}

test('two- and three-player games deal five cards each, four- and five-player games deal four', () => {
	expect(new HanabiGame({ playerNames: ['A', 'B'], shuffleSeed: 1 }).state.players[0].cards).toHaveLength(5);
	expect(new HanabiGame({ playerNames: ['A', 'B', 'C'], shuffleSeed: 1 }).state.players[0].cards).toHaveLength(5);
	expect(new HanabiGame({ playerNames: ['A', 'B', 'C', 'D'], shuffleSeed: 1 }).state.players[0].cards).toHaveLength(4);
	expect(
		new HanabiGame({ playerNames: ['A', 'B', 'C', 'D', 'E'], shuffleSeed: 1 }).state.players[0].cards,
	).toHaveLength(4);
});

test('a game starts with eight hint tokens and no fuses used', () => {
	const game = new HanabiGame({ playerNames: ['A', 'B'], shuffleSeed: 1 });
	expect(game.state.hintTokens).toBe(8);
	expect(game.state.fuseTokensUsed).toBe(0);
});

test('the same shuffle seed deals the same game', () => {
	const options = { playerNames: ['A', 'B', 'C'], includeMulticolor: true };
	const gameA = new HanabiGame({ ...options, shuffleSeed: 1337 });
	const gameB = new HanabiGame({ ...options, shuffleSeed: 1337 });
	const gameC = new HanabiGame({ ...options, shuffleSeed: 7331 });

	expect(gameA.getSnapshot()).toEqual(gameB.getSnapshot());
	expect(gameA.getSnapshot()).not.toEqual(gameC.getSnapshot());
});

test('a hint records the value on touched cards and the exclusion on every untouched card, for one token', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		deck: twoPlayerDeck(ONES, [card('G', 1), card('R', 2), card('G', 2), card('B', 3), card('G', 3)], [card('Y', 1)]),
	});

	game.giveColorHint('p2', 'G');
	game.giveNumberHint('p1', 1);
	game.giveNumberHint('p2', 2);

	for (const cardId of game.state.players[1].cards) {
		const { suit, number, hints } = game.state.cards[cardId];
		expect(suit === 'G' ? hints.color : hints.notColors).toEqual(suit === 'G' ? 'G' : ['G']);
		expect(number === 2 ? hints.number : hints.notNumbers).toEqual(number === 2 ? 2 : [2]);
	}
	expect(game.state.hintTokens).toBe(5);
});

test('a hint cannot target yourself, must touch a card, and needs a hint token', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		deck: twoPlayerDeck(
			[card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
			[card('R', 2), card('Y', 2), card('G', 3), card('B', 4), card('R', 3)],
			[card('W', 1)],
		),
	});

	expect(() => game.giveColorHint('p1', 'R')).toThrow();
	expect(() => game.giveColorHint('p2', 'W')).toThrow();
	expect(() => game.giveNumberHint('p2', 5)).toThrow();

	const noTokenState = game.getSnapshot();
	noTokenState.hintTokens = 0;
	expect(() => HanabiGame.fromState(noTokenState).giveColorHint('p2', 'R')).toThrow();
});

test('a hint that adds no new information is rejected without spending a token or the turn', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		deck: twoPlayerDeck(ONES, [card('R', 2), card('G', 2), card('Y', 3), card('B', 4), card('W', 5)], [card('R', 3)]),
	});
	game.giveColorHint('p2', 'R');
	game.giveNumberHint('p1', 1);
	const hintTokensBefore = game.state.hintTokens;

	expect(() => game.giveColorHint('p2', 'R')).toThrow();
	expect(game.state.hintTokens).toBe(hintTokensBefore);
	expect(game.state.currentTurnPlayerIndex).toBe(0);
});

test('a discard regains a hint token only when below the maximum', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		deck: twoPlayerDeck(
			[card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
			[card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)],
			[card('R', 3), card('Y', 4), card('G', 5)],
		),
	});

	game.discardCard(game.state.players[0].cards[0]);
	expect(game.state.hintTokens).toBe(8);

	const snapshot = game.getSnapshot();
	snapshot.hintTokens = 7;
	const belowMax = HanabiGame.fromState(snapshot);
	belowMax.discardCard(belowMax.state.players[1].cards[0]);
	expect(belowMax.state.hintTokens).toBe(8);
});

test('a successful play extends its firework and draws a replacement', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		deck: twoPlayerDeck(
			[card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
			[card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)],
			[card('R', 3), card('Y', 1)],
		),
	});

	const cardId = game.state.players[0].cards[0];
	game.playCard(cardId);

	expect(game.state.fireworks.R).toEqual([cardId]);
	expect(game.state.players[0].cards).toHaveLength(5);
	expect(game.state.drawDeck).toHaveLength(1);
});

test('a misplay uses a fuse and the third fuse loses the game', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		deck: twoPlayerDeck(TWOS, ONES, [card('R', 1), card('Y', 1)]),
	});

	game.playCard(game.state.players[0].cards[0]);
	expect(game.state.fuseTokensUsed).toBe(1);
	expect(game.state.status).toBe('active');

	const snapshot = game.getSnapshot();
	snapshot.fuseTokensUsed = 2;
	snapshot.currentTurnPlayerIndex = 0;
	const losingGame = HanabiGame.fromState(snapshot);
	losingGame.playCard(
		losingGame.state.players[0].cards.find(id => losingGame.state.cards[id].number === 2)!,
	);

	expect(losingGame.state.status).toBe('lost');
	expect(() => losingGame.giveNumberHint('p2', 1)).toThrow();
});

test('playing a five regains a hint token without exceeding the maximum', () => {
	const game = HanabiGame.fromState(createAlmostWonState());
	game.playCard('W5');
	expect(game.state.hintTokens).toBe(8);

	const maxed = createAlmostWonState();
	maxed.hintTokens = 8;
	const maxedGame = HanabiGame.fromState(maxed);
	maxedGame.playCard('W5');
	expect(maxedGame.state.hintTokens).toBe(8);
});

test('completing every firework wins immediately with 25 points', () => {
	const game = HanabiGame.fromState(createAlmostWonState());
	game.playCard('W5');

	expect(game.state.status).toBe('won');
	expect(game.getScore()).toBe(25);
});

test('emptying the deck does not start a final round', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		deck: twoPlayerDeck(
			[card('R', 1), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
			[card('R', 2), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
			[card('G', 5)],
		),
	});

	game.playCard(game.state.players[0].cards[0]);
	game.giveNumberHint('p1', 2);
	game.giveColorHint('p2', 'R');

	expect(game.state.drawDeck).toHaveLength(0);
	expect(game.state.status).toBe('active');
	expect(game.state.lastRound).toBeNull();
});

test('a stored last-round game restores to normal active play', () => {
	const game = new HanabiGame({ playerNames: ['A', 'B'], shuffleSeed: 1 });
	const snapshot = game.getSnapshot();
	snapshot.status = 'last_round';
	snapshot.lastRound = { turnsRemaining: 2, finalPlayerId: 'p1' };

	const restored = HanabiGame.fromState(snapshot);

	expect(restored.state.status).toBe('active');
	expect(restored.state.lastRound).toBeNull();
});

test('plays and discards with an empty deck draw nothing, so hands shrink', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		deck: twoPlayerDeck(
			[card('R', 1), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
			[card('R', 2), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
		),
	});

	game.playCard(game.state.players[0].cards[0]);
	game.discardCard(game.state.players[1].cards[0]);

	expect(game.state.players[0].cards).toHaveLength(4);
	expect(game.state.players[1].cards).toHaveLength(4);
});

test('a player with no cards is skipped only when no hint token is available', () => {
	const startFromEmptySecondHand = (hintTokens: number) => {
		const state = new HanabiGame({ playerNames: ['A', 'B', 'C'], shuffleSeed: 42 }).getSnapshot();
		state.discardPile.push(...state.players[1].cards.splice(0));
		state.currentTurnPlayerIndex = 0;
		state.hintTokens = hintTokens;
		const game = HanabiGame.fromState(state);
		game.playCard(game.state.players[0].cards.find(id => game.state.cards[id].number !== 5)!);
		return game.state.currentTurnPlayerIndex;
	};

	expect(startFromEmptySecondHand(0)).toBe(2);
	expect(startFromEmptySecondHand(1)).toBe(1);
});

test('the game finishes once no incomplete firework can still advance', () => {
	const game = HanabiGame.fromState(createOneDiscardFromNoValidPlaysLeftState());
	expect(game.state.status).toBe('active');

	game.discardCard('needed-y4');

	expect(game.state.status).toBe('finished');
});

test('a player view hides their own cards but shows teammates cards', () => {
	const game = new HanabiGame({ playerNames: ['A', 'B'], deck: twoPlayerDeck(ONES, TWOS) });

	const view = game.getPerspectiveState('p1');
	const ownCard = view.players.find(player => player.id === 'p1')!.cards[0];
	const teammateCard = view.players.find(player => player.id === 'p2')!.cards[0];

	expect(ownCard).toMatchObject({ suit: null, number: null });
	expect(teammateCard).toMatchObject({ suit: 'R', number: 2 });
});

test('multicolor adds one card of each number and always uses short deck and wild hints', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		includeMulticolor: true,
		multicolorShortDeck: false,
		multicolorWildHints: false,
		shuffleSeed: 10,
	});

	const multicolorNumbers = Object.values(game.state.cards)
		.filter(entry => entry.suit === 'M')
		.map(entry => entry.number)
		.sort();
	expect(multicolorNumbers).toEqual([1, 2, 3, 4, 5]);
	expect(game.state.settings.multicolorShortDeck).toBeTrue();
	expect(game.state.settings.multicolorWildHints).toBeTrue();
});

test('a base color hint touches multicolor cards, and multicolor cannot be called', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		includeMulticolor: true,
		deck: twoPlayerDeck(
			[card('W', 1), card('W', 2), card('W', 3), card('W', 4), card('W', 5)],
			[card('M', 1), card('R', 2), card('Y', 3), card('G', 4), card('B', 5)],
		),
	});

	expect(() => game.giveColorHint('p2', 'M')).toThrow();
	game.giveColorHint('p2', 'R');

	for (const cardId of game.state.players[1].cards) {
		const { suit, hints } = game.state.cards[cardId];
		expect(hints.color).toBe(suit === 'R' || suit === 'M' ? 'R' : null);
	}
});

test('a card touched by two different color hints is known to be multicolor', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		includeMulticolor: true,
		deck: twoPlayerDeck(
			[card('R', 1), card('R', 2), card('R', 3), card('R', 4), card('R', 5)],
			[card('M', 1), card('Y', 2), card('W', 3), card('Y', 4), card('W', 5)],
		),
	});
	const multicolorCardId = game.state.players[1].cards[0];

	game.giveColorHint('p2', 'R');
	game.giveNumberHint('p1', 1);
	game.giveColorHint('p2', 'B');

	expect(game.state.cards[multicolorCardId].hints.color).toBe('M');
});

test('black powder adds ten black cards counted like a reversed suit', () => {
	const game = new HanabiGame({ playerNames: ['A', 'B'], includeBlack: true, shuffleSeed: 22 });
	const counts: Record<number, number> = {};
	for (const entry of Object.values(game.state.cards)) {
		if (entry.suit === 'K') {
			counts[entry.number] = (counts[entry.number] ?? 0) + 1;
		}
	}

	expect(counts).toEqual({ 1: 1, 2: 2, 3: 2, 4: 2, 5: 3 });
});

test('the black firework is built downward from 5 and scores a penalty for each missing card', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		includeBlack: true,
		deck: twoPlayerDeck(
			[card('K', 5), card('K', 4), card('K', 3), card('K', 2), card('K', 1)],
			[card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
		),
	});

	game.playCard(game.state.players[0].cards[0]);
	game.giveNumberHint('p1', 4);
	game.playCard(game.state.players[0].cards.find(id => game.state.cards[id].number === 4)!);

	expect(game.state.fireworks.K.map(id => game.state.cards[id].number)).toEqual([5, 4]);
	expect(game.state.fuseTokensUsed).toBe(0);
	expect(game.getScore()).toBe(0);
});

test('color hints never touch black cards, and black cannot be called', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		includeBlack: true,
		deck: twoPlayerDeck(
			[card('W', 1), card('W', 2), card('W', 3), card('W', 4), card('W', 5)],
			[card('K', 5), card('R', 1), card('K', 4), card('Y', 1), card('G', 1)],
		),
	});

	expect(() => game.giveColorHint('p2', 'K')).toThrow();
	game.giveColorHint('p2', 'R');

	for (const cardId of game.state.players[1].cards) {
		if (game.state.cards[cardId].suit === 'K') {
			expect(game.state.cards[cardId].hints.color).toBeNull();
		}
	}
});

test('a perfect game with black and multicolor scores 35', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		includeMulticolor: true,
		includeBlack: true,
		shuffleSeed: 22,
	});
	const usedCardIds = new Set<string>();
	for (const suit of game.state.settings.activeSuits) {
		for (const number of getFireworkCardNumbers(suit)) {
			const cardId = Object.values(game.state.cards).find(
				entry => entry.suit === suit && entry.number === number && !usedCardIds.has(entry.id),
			)!.id;
			usedCardIds.add(cardId);
			game.state.fireworks[suit].push(cardId);
		}
	}

	expect(game.getScore()).toBe(35);
});

test('5 flamboyants: completing a normal firework resolves a bonus tile instead of the normal hint bonus', () => {
	const game = createFlamboyantFiveGame(['recover-fuse-and-gain-hint']);
	game.state.fuseTokensUsed = 1;

	game.playCard(game.state.players[0].cards[0]);

	expect(game.state.hintTokens).toBe(7);
	expect(game.state.fuseTokensUsed).toBe(0);
	expect(game.state.bonusTileDiscard).toEqual(['recover-fuse-and-gain-hint']);
});

test('5 flamboyants: completing black with 1 or multicolor with 5 draws a bonus tile by default', () => {
	const black = createFlamboyantBlackOneGame(['free-number-hint']);
	black.playCard(black.state.players[0].cards[0]);
	expect(black.state.pendingBonus).toMatchObject({ effect: 'free-number-hint', sourceSuit: 'K' });
	expect(black.state.hintTokens).toBe(6);

	const multicolor = new HanabiGame({
		playerNames: ['A', 'B'],
		includeMulticolor: true,
		includeFlamboyants: true,
		bonusTiles: ['gain-hint'],
		deck: twoPlayerDeck([card('M', 5), ...ONES.slice(0, 4)], [card('W', 1), ...TWOS.slice(0, 4)]),
	});
	for (const number of [1, 2, 3, 4] as const) {
		addFireworkCard(multicolor, 'M', number);
	}
	multicolor.state.hintTokens = 6;
	multicolor.playCard(multicolor.state.players[0].cards[0]);
	expect(multicolor.state.bonusTileDiscard).toEqual(['gain-hint']);
	expect(multicolor.state.hintTokens).toBe(7);
});

test('5 flamboyants: completing black with 1 may take the normal hint bonus instead of a tile', () => {
	const game = createFlamboyantBlackOneGame(['gain-hint']);

	game.playCard(game.state.players[0].cards[0], 'hint');

	expect(game.state.hintTokens).toBe(7);
	expect(game.state.bonusTileDeck).toEqual(['gain-hint']);
	expect(game.state.currentTurnPlayerIndex).toBe(1);
});

test('5 flamboyants: a free number hint keeps the turn until given and costs no token', () => {
	const game = createFlamboyantFiveGame(['free-number-hint']);

	game.playCard(game.state.players[0].cards[0]);
	expect(game.state.currentTurnPlayerIndex).toBe(0);

	game.resolveFlamboyantNumberHint('p2', 1);

	expect(game.state.pendingBonus).toBeNull();
	expect(game.state.hintTokens).toBe(6);
	expect(game.state.currentTurnPlayerIndex).toBe(1);
});

test('5 flamboyants: play-discard moves a playable discard onto its firework', () => {
	const game = createFlamboyantFiveGame(['play-discard']);
	addDiscard(game, 'discard-g1', 'G', 1);

	game.playCard(game.state.players[0].cards[0]);
	game.resolveFlamboyantPlayDiscard('discard-g1');

	expect(game.state.discardPile).not.toContain('discard-g1');
	expect(game.state.fireworks.G).toContain('discard-g1');
	expect(game.state.currentTurnPlayerIndex).toBe(1);
});

test('5 flamboyants: shuffle-discard returns a discard to the draw deck', () => {
	const game = createFlamboyantFiveGame(['shuffle-discard']);
	addDiscard(game, 'discard-y1', 'Y', 1);

	game.playCard(game.state.players[0].cards[0]);
	game.resolveFlamboyantShuffleDiscard('discard-y1');

	expect(game.state.discardPile).not.toContain('discard-y1');
	expect([...game.state.drawDeck, ...game.state.players[0].cards]).toContain('discard-y1');
	expect(game.state.currentTurnPlayerIndex).toBe(1);
});

test('sudden death has one fuse, also when restored from an older three-fuse snapshot', () => {
	const game = new HanabiGame({ playerNames: ['A', 'B'], endlessMode: true, shuffleSeed: 1 });
	expect(game.state.settings.maxFuseTokens).toBe(1);

	const legacySnapshot = game.getSnapshot();
	legacySnapshot.settings.maxFuseTokens = 3;
	expect(HanabiGame.fromState(legacySnapshot).state.settings.maxFuseTokens).toBe(1);
});

test('sudden death loses on the first misplay', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		endlessMode: true,
		deck: twoPlayerDeck(
			[card('R', 2), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
			[card('R', 1), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
			[card('R', 2), card('R', 3)],
		),
	});

	game.playCard(game.state.players[0].cards[0]);

	expect(game.state.status).toBe('lost');
});

test('sudden death loses when the last copy of a needed card is discarded', () => {
	const game = new HanabiGame({
		playerNames: ['A', 'B'],
		endlessMode: true,
		deck: twoPlayerDeck(ONES, [card('R', 5), card('Y', 5), card('G', 5), card('B', 5), card('W', 5)], TWOS),
	});
	game.giveNumberHint('p2', 5);

	game.discardCard(game.state.players[1].cards.find(id => game.state.cards[id].suit === 'R')!);

	expect(game.state.status).toBe('lost');
});
