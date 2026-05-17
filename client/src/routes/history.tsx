import { createFileRoute } from '@tanstack/react-router';
import { HistoryScreen } from '../ui/HistoryScreen';

export const Route = createFileRoute('/history')({
	component: HistoryScreen,
});
