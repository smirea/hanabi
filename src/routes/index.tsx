import { createFileRoute } from '@tanstack/react-router';
import { LobbyDirectory } from '../ui/LobbyDirectory';

export const Route = createFileRoute('/')({
  component: LobbyDirectory
});
