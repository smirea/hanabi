import { createFileRoute } from '@tanstack/react-router';
import { PlayerStatsScreen } from '../ui/PlayerStatsScreen';

export const Route = createFileRoute('/stats')({
	component: PlayerStatsScreen,
});
