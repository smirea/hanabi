import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import './index.css';
import { getDebugNetworkPlayerIdFromHash } from './debugNetwork';
import { createDebugNamespace, createSessionNamespace, getSessionIdFromHash, resolveStorageKey, storageKeys } from './storage';

function resolveInitialDarkMode(): boolean {
  try {
    const hash = window.location.hash ?? '';
    const debugId = getDebugNetworkPlayerIdFromHash(hash);
    const sessionId = getSessionIdFromHash(hash);
    const namespace = debugId
      ? createDebugNamespace(debugId)
      : (sessionId ? createSessionNamespace(sessionId) : null);

    const raw = window.localStorage.getItem(resolveStorageKey(storageKeys.darkMode, namespace));
    if (raw !== null) {
      return JSON.parse(raw) === true;
    }
  } catch {
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element');
}

const isDarkMode = resolveInitialDarkMode();
document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
document
  .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  ?.setAttribute('content', isDarkMode ? '#0b0d14' : '#f5f7fc');

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
