import { createFileRoute } from '@tanstack/react-router';
import { AdminDebugScreen } from '../ui/AdminDebugScreen';

export const Route = createFileRoute('/admin')({
	component: AdminDebugScreen,
});
