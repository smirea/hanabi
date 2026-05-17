import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installDebugNamespace } from './debugScreens';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import './index.css';
import { storageKeys } from './utils/constants';
import { resolveStorageKey } from './storage';

const rootElement = document.getElementById('root');

if (!rootElement) {
	throw new Error('Missing #root element');
}

const isDarkMode = (() => {
	try {
		const raw = window.localStorage.getItem(resolveStorageKey(storageKeys.darkMode));
		return raw !== null && JSON.parse(raw) === true;
	} catch {
		return false;
	}
})();
document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
document
	.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
	?.setAttribute('content', isDarkMode ? '#0b0d14' : '#f5f7fc');

installDebugNamespace();

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
