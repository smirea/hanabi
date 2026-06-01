export type ScoreFlavorKind =
	| 'poo'
	| 'shovel'
	| 'donkey'
	| 'chariot'
	| 'crown'
	| 'eyebrow'
	| 'rocket';

export interface ScoreFlavor {
	kind: ScoreFlavorKind;
	label: string;
	image: string;
	accent: string;
}

const BASE_SCORE_FLAVORS: Array<ScoreFlavor & { minScore: number }> = [
	{
		minScore: 21,
		kind: 'crown',
		label: 'Crowned somehow',
		image: '/score-badges/crown.png',
		accent: '#f5b720',
	},
	{
		minScore: 16,
		kind: 'chariot',
		label: 'Chariot chaos',
		image: '/score-badges/chariot.png',
		accent: '#9ca3af',
	},
	{
		minScore: 11,
		kind: 'donkey',
		label: 'Donkey mode',
		image: '/score-badges/donkey.png',
		accent: '#9a6a3a',
	},
	{
		minScore: 6,
		kind: 'shovel',
		label: 'Shovel duty',
		image: '/score-badges/shovel.png',
		accent: '#64748b',
	},
	{
		minScore: 0,
		kind: 'poo',
		label: 'Poo crew',
		image: '/score-badges/poo.png',
		accent: '#8b5a2b',
	},
];

const EXTENDED_SCORE_FLAVORS: Array<ScoreFlavor & { minScore: number }> = [
	{
		minScore: 31,
		kind: 'rocket',
		label: 'Starship nonsense',
		image: '/score-badges/rocket.png',
		accent: '#a9f5ff',
	},
	{
		minScore: 26,
		kind: 'eyebrow',
		label: 'Elon eyebrow',
		image: '/score-badges/eyebrow.png',
		accent: '#7c3aed',
	},
];

export function getScoreFlavor(score: number, maxScore: number): ScoreFlavor {
	if (maxScore > 25 || score > 25) {
		const extendedFlavor = EXTENDED_SCORE_FLAVORS.find(flavor => score >= flavor.minScore);
		if (extendedFlavor) {
			return extendedFlavor;
		}
	}

	const baseFlavor = BASE_SCORE_FLAVORS.find(flavor => score >= flavor.minScore);
	return baseFlavor ?? BASE_SCORE_FLAVORS[BASE_SCORE_FLAVORS.length - 1];
}

export function getScoreMaxFromSettings(settings: { includeMulticolor?: boolean }): number {
	return 25 + (settings.includeMulticolor ? 5 : 0);
}
