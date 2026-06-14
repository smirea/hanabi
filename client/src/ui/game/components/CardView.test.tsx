import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'bun:test';
import type { PerspectiveCard } from '../../../game';
import { CardView } from './CardView';

function hiddenCard(overrides: Partial<PerspectiveCard> = {}): PerspectiveCard {
	return {
		id: 'c001',
		suit: null,
		number: null,
		isHiddenFromViewer: true,
		hints: {
			color: 'R',
			number: null,
			notColors: [],
			notNumbers: [],
			recentlyHinted: false,
		},
		...overrides,
	};
}

function visibleCard(overrides: Partial<PerspectiveCard> = {}): PerspectiveCard {
	return {
		id: 'c002',
		suit: 'R',
		number: 1,
		isHiddenFromViewer: false,
		hints: {
			color: 'R',
			number: null,
			notColors: [],
			notNumbers: [],
			recentlyHinted: false,
		},
		...overrides,
	};
}

describe('CardView', () => {
	afterEach(() => {
		cleanup();
	});

	test('renders first color hints in multicolor games as ambiguous', () => {
		render(
			<CardView
				card={hiddenCard()}
				showNegativeColorHints
				showNegativeNumberHints
				showAmbiguousMulticolorHints
				testId='card'
			/>,
		);

		expect(screen.getByTestId('card')).toHaveClass('ambiguous-multicolor');
		expect(screen.getByTestId('card-ambiguous-color')).toBeInTheDocument();
	});

	test('renders visible teammate color hint badges as ambiguous without changing the card face', () => {
		render(
			<CardView
				card={visibleCard()}
				showNegativeColorHints
				showNegativeNumberHints
				showAmbiguousMulticolorHints
				testId='card'
			/>,
		);

		const card = screen.getByTestId('card');
		expect(card).not.toHaveClass('ambiguous-multicolor');
		expect(screen.getByTestId('card-ambiguous-color')).toBeInTheDocument();
		expect(card.querySelector('.card-face-suit-split')).toBeNull();
	});

	test('resolves ambiguity after a different color is excluded', () => {
		render(
			<CardView
				card={hiddenCard({ hints: { ...hiddenCard().hints, notColors: ['G'] } })}
				showNegativeColorHints
				showNegativeNumberHints
				showAmbiguousMulticolorHints
				testId='card'
			/>,
		);

		expect(screen.getByTestId('card')).not.toHaveClass('ambiguous-multicolor');
		expect(screen.queryByTestId('card-ambiguous-color')).not.toBeInTheDocument();
	});

	test('animates ambiguity resolving to the hinted base color', async () => {
		const { rerender } = render(
			<CardView
				card={hiddenCard()}
				showNegativeColorHints
				showNegativeNumberHints
				showAmbiguousMulticolorHints
				testId='card'
			/>,
		);

		await waitFor(() => expect(screen.getByTestId('card')).toHaveClass('ambiguous-multicolor'));

		rerender(
			<CardView
				card={hiddenCard({ hints: { ...hiddenCard().hints, notColors: ['G'] } })}
				showNegativeColorHints
				showNegativeNumberHints
				showAmbiguousMulticolorHints
				testId='card'
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId('card')).not.toHaveClass('ambiguous-multicolor');
			expect(screen.getByTestId('card-resolution-fold')).toHaveClass('to-base');
		});
	});

	test('animates ambiguity resolving to multicolor', async () => {
		const { rerender } = render(
			<CardView
				card={hiddenCard()}
				showNegativeColorHints
				showNegativeNumberHints
				showAmbiguousMulticolorHints
				testId='card'
			/>,
		);

		await waitFor(() => expect(screen.getByTestId('card')).toHaveClass('ambiguous-multicolor'));

		rerender(
			<CardView
				card={hiddenCard({ hints: { ...hiddenCard().hints, color: 'M' } })}
				showNegativeColorHints
				showNegativeNumberHints
				showAmbiguousMulticolorHints
				testId='card'
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId('card')).not.toHaveClass('ambiguous-multicolor');
			expect(screen.getByTestId('card-resolution-fold')).toHaveClass('to-multicolor');
		});
	});
});
