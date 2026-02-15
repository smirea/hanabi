import { createFileRoute } from '@tanstack/react-router';
import { LobbyDirectory } from '../ui/LobbyDirectory';
import { RoomScreen } from '../ui/RoomScreen';

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    room: typeof search.room === 'string' ? search.room : undefined
  }),
  component: HomeRoute
});

function HomeRoute() {
  const { room } = Route.useSearch();

  if (typeof room === 'string' && room.trim().length > 0) {
    return <RoomScreen code={room} />;
  }

  return <LobbyDirectory />;
}
