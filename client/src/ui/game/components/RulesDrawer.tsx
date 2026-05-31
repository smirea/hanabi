import { X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

type RulesTabId = 'overview' | 'extra-suit' | 'black-powder' | 'flamboyants' | 'sudden-death';

interface RulesTab {
	id: RulesTabId;
	label: string;
	title: string;
	points: string[];
}

const RULE_TABS: RulesTab[] = [
	{
		id: 'overview',
		label: 'Overview',
		title: 'Base Game',
		points: [
			'Players can see every hand except their own. Work together to build one firework per color.',
			'Each firework is built in order from 1 to 5. A correct 5 normally returns one clue token.',
			'On your turn, give one clue, discard one card, or play one card. You cannot skip.',
			'Clues must point to every card of one color or one number in a teammate hand.',
			'Misplayed cards use a fuse. The game ends on the final fuse, all fireworks completed, or after the final round once the deck runs out.',
		],
	},
	{
		id: 'extra-suit',
		label: 'Extra Suit',
		title: 'Extra Suit (M)',
		points: [
			'Adds the multicolor firework as a short 5-card suit.',
			'Multicolor cards are played normally from 1 to 5.',
			'You cannot call multicolor as a clue. Call a base color instead, and multicolor cards count as matching it.',
			'Number clues work normally.',
		],
	},
	{
		id: 'black-powder',
		label: 'Black Powder',
		title: 'Black Powder',
		points: [
			'Adds colorless black cards and a black firework.',
			'The black firework is built in reverse: 5, 4, 3, 2, 1.',
			'Black cards cannot be touched by color clues. Number clues still work.',
			'Black is scored as a penalty: subtract 1 point for each missing black card.',
		],
	},
	{
		id: 'flamboyants',
		label: '5 Flamboyants',
		title: '5 Flamboyants',
		points: [
			'Shuffle six one-use bonus tiles at setup.',
			'When a normal firework is completed with a 5, reveal a bonus tile instead of taking the normal clue bonus.',
			'Bonuses can gain a clue, recover a fuse and gain a clue, give a free color clue, give a free number clue, shuffle a discard into the deck, or play a currently fitting discard.',
			'If a bonus plays a 5, reveal another bonus tile immediately.',
		],
	},
	{
		id: 'sudden-death',
		label: 'Sudden Death',
		title: 'Sudden Death',
		points: [
			'The team has only one fuse token.',
			'The deck running out does not start a final round. Keep playing until victory or defeat.',
			'Losing the one fuse or discarding an indispensable card ends the game.',
			'The goal is perfection rather than a score scale.',
		],
	},
];

export function RulesDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
	const [activeTabId, setActiveTabId] = useState<RulesTabId>('overview');
	const activeTab = RULE_TABS.find(tab => tab.id === activeTabId) ?? RULE_TABS[0];

	useEffect(() => {
		if (!isOpen) {
			setActiveTabId('overview');
			return;
		}

		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key === 'Escape') {
				onClose();
			}
		}

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen) {
		return null;
	}

	return (
		<>
			<button
				type='button'
				className='drawer-scrim rules-drawer-scrim open'
				aria-label='Close rules'
				onClick={onClose}
				data-testid='rules-drawer-scrim'
			/>

			<aside
				className='rules-drawer open'
				role='dialog'
				aria-modal='true'
				aria-labelledby='rules-drawer-title'
				data-testid='rules-drawer'
			>
				<header className='rules-drawer-header'>
					<span id='rules-drawer-title' className='rules-drawer-title'>
						Rules
					</span>
					<button
						type='button'
						className='rules-drawer-close action-button'
						onClick={onClose}
						aria-label='Close rules'
						data-testid='rules-close'
					>
						<X size={14} weight='bold' aria-hidden />
					</button>
				</header>

				<div className='rules-tabs' role='tablist' aria-label='Rules sections'>
					{RULE_TABS.map(tab => (
						<button
							key={tab.id}
							type='button'
							className={`rules-tab ${tab.id === activeTabId ? 'active' : ''}`}
							role='tab'
							aria-selected={tab.id === activeTabId}
							onClick={() => setActiveTabId(tab.id)}
							data-testid={`rules-tab-${tab.id}`}
						>
							{tab.label}
						</button>
					))}
				</div>

				<section className='rules-content' data-testid='rules-content'>
					<h2>{activeTab.title}</h2>
					<ul>
						{activeTab.points.map(point => (
							<li key={point}>{point}</li>
						))}
					</ul>
				</section>
			</aside>
		</>
	);
}
