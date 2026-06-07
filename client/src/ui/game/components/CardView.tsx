import type { CSSProperties } from 'react';
import { BASE_SUITS, type PerspectiveCard } from '../../../game';
import type { Suit } from '../../../game';
import { suitBadgeForeground, suitColors } from '../../../utils/constants';
import { SuitSymbol } from './SuitSymbol';

const BASE_HINT_SUITS = BASE_SUITS;

function isAmbiguousMulticolorHint(card: PerspectiveCard, showAmbiguousMulticolorHints: boolean) {
	const knownColor = card.hints.color;
	if (!showAmbiguousMulticolorHints || !card.isHiddenFromViewer || !knownColor) {
		return false;
	}

	if (knownColor === 'M' || knownColor === 'K') {
		return false;
	}

	return !BASE_HINT_SUITS.some(suit => suit !== knownColor && card.hints.notColors.includes(suit));
}

export function CardView({
	card,
	showNegativeColorHints,
	showNegativeNumberHints,
	onSelect,
	isDisabled = false,
	testId,
	onNode,
	showAmbiguousMulticolorHints = false,
}: {
	card: PerspectiveCard;
	showNegativeColorHints: boolean;
	showNegativeNumberHints: boolean;
	onSelect?: () => void;
	isDisabled?: boolean;
	testId: string;
	onNode?: (node: HTMLButtonElement | null) => void;
	showAmbiguousMulticolorHints?: boolean;
}) {
	const knownColor = card.hints.color;
	const knownNumber = card.hints.number;
	const ambiguousMulticolor = isAmbiguousMulticolorHint(card, showAmbiguousMulticolorHints);

	let faceSuit: Suit | null = null;
	let faceValue: string | number = '?';
	let bgColor: string | undefined;
	let altBgColor: string | undefined;

	if (card.isHiddenFromViewer) {
		faceSuit = knownColor;
		faceValue = knownNumber ?? '?';
		bgColor = knownColor ? suitColors[knownColor] : knownNumber ? '#9eb2d4' : undefined;
		altBgColor = ambiguousMulticolor ? suitColors.M : undefined;
	} else {
		if (card.suit === null || card.number === null) {
			throw new Error(`Visible card ${card.id} is missing face values`);
		}

		faceSuit = card.suit;
		faceValue = card.number;
		bgColor = suitColors[card.suit];
	}

	const notColors =
		knownColor || !showNegativeColorHints
			? []
			: card.hints.notColors.filter(color => color !== 'M');
	const notNumbers = knownNumber || !showNegativeNumberHints ? [] : card.hints.notNumbers;
	const hasPositiveBadges = Boolean(knownColor || knownNumber);
	const hasNegativeBadges = notColors.length > 0 || notNumbers.length > 0;

	return (
		<button
			type='button'
			className={`card ${card.hints.recentlyHinted ? 'recent' : ''} ${ambiguousMulticolor ? 'ambiguous-multicolor' : ''}`}
			style={
				{
					'--card-bg': bgColor,
					'--card-alt-bg': altBgColor,
				} as CSSProperties
			}
			onClick={isDisabled ? undefined : onSelect}
			data-testid={testId}
			data-card-id={card.id}
			ref={onNode}
			disabled={isDisabled}
			aria-disabled={isDisabled}
			aria-pressed={false}
		>
			<div className='card-face'>
				<span className='card-face-value'>{faceValue}</span>
				{faceSuit && ambiguousMulticolor ? (
					<span className='card-face-suit-split'>
						<span className='card-face-suit-half base' style={{ color: suitColors[faceSuit] }}>
							<SuitSymbol suit={faceSuit} size={24} />
						</span>
						<span className='card-face-suit-half multicolor' style={{ color: suitColors.M }}>
							<SuitSymbol suit='M' size={24} />
						</span>
					</span>
				) : faceSuit ? (
					<span className='card-face-suit' style={{ color: suitColors[faceSuit] }}>
						<SuitSymbol suit={faceSuit} size={22} />
					</span>
				) : null}
			</div>
			<div className={`badges ${hasPositiveBadges ? 'visible' : 'empty'}`}>
				{knownColor && ambiguousMulticolor && (
					<span className='badge ambiguous-color-pair' data-testid={`${testId}-ambiguous-color`}>
						<span
							className='badge color ambiguous-base'
							style={
								{
									'--badge-color': suitColors[knownColor],
									'--badge-fg': suitBadgeForeground[knownColor],
								} as CSSProperties
							}
						>
							<SuitSymbol suit={knownColor} size={12} className='badge-icon' />
						</span>
						<span
							className='badge color ambiguous-multi'
							style={
								{
									'--badge-color': suitColors.M,
									'--badge-fg': suitBadgeForeground.M,
								} as CSSProperties
							}
						>
							<SuitSymbol suit='M' size={12} className='badge-icon' />
						</span>
					</span>
				)}
				{knownColor && knownNumber && !ambiguousMulticolor && (
					<span
						className='badge combined'
						style={
							{
								'--badge-color': suitColors[knownColor],
								'--badge-fg': suitBadgeForeground[knownColor],
							} as CSSProperties
						}
					>
						<SuitSymbol suit={knownColor} size={12} className='badge-icon' />
						{knownNumber}
					</span>
				)}
				{knownColor && !knownNumber && !ambiguousMulticolor && (
					<span
						className='badge color'
						style={
							{
								'--badge-color': suitColors[knownColor],
								'--badge-fg': suitBadgeForeground[knownColor],
							} as CSSProperties
						}
					>
						<SuitSymbol suit={knownColor} size={12} className='badge-icon' />
					</span>
				)}
				{!knownColor && knownNumber && <span className='badge number'>{knownNumber}</span>}
				{knownColor && knownNumber && ambiguousMulticolor && (
					<span className='badge number'>{knownNumber}</span>
				)}
			</div>
			<div className={`negative-badges ${hasNegativeBadges ? 'visible' : 'empty'}`}>
				{notColors.map(color => (
					<span
						key={color}
						className='badge not-color negative'
						style={{ '--badge-color': suitColors[color] } as CSSProperties}
					>
						<SuitSymbol suit={color} size={12} className='badge-icon' />
					</span>
				))}
				{notNumbers.map(number => (
					<span key={number} className='badge not-number negative'>
						{number}
					</span>
				))}
			</div>
		</button>
	);
}
