import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

function resolveInitialDarkMode(): boolean {
  try {
    const raw = window.localStorage.getItem('hanabi.dark_mode');
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
    <App />
  </StrictMode>
);
