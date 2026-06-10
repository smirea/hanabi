import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installDebugServerNamespace } from './debugServer';
import { installDebugNamespace } from './debugScreens';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import './index.css';
import { storageKeys } from './utils/constants';
import { LS } from './utils/utils';

const rootElement = document.getElementById('root');

if (!rootElement) {
	throw new Error('Missing #root element');
}

const isDarkMode = (() => {
	try {
		return LS.get(storageKeys.darkMode, false) === true;
	} catch {
		return false;
	}
})();
document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
document
	.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
	?.setAttribute('content', isDarkMode ? '#0b0d14' : '#f5f7fc');

installDebugNamespace();
installDebugServerNamespace();

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
