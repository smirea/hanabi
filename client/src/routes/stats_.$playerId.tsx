import { createFileRoute } from '@tanstack/react-router';
import { PlayerStatsScreen } from '../ui/PlayerStatsScreen';

export const Route = createFileRoute('/stats_/$playerId')({
	component: PlayerStatsDetailRoute,
});

function PlayerStatsDetailRoute() {
	const { playerId } = Route.useParams();
	return <PlayerStatsScreen playerId={playerId} />;
}
