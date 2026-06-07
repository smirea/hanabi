import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
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
});
