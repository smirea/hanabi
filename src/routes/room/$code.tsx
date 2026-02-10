import { createFileRoute } from '@tanstack/react-router';
import { RoomScreen } from '../../ui/RoomScreen';

export const Route = createFileRoute('/room/$code')({
  component: RoomRoute
});

function RoomRoute() {
  const { code } = Route.useParams();
  return <RoomScreen code={code} />;
}
