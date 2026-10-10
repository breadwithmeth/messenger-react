import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './index.css';

// One-time cleanup of legacy multi-theme localStorage keys
const LEGACY_KEYS = [
  'theme',
  'secret-themes-unlocked',
  'crt-level',
  'retro-sfx',
  'retro-mini-mode',
  'retro-achievements',
  'app.forceFirefoxMode.v1',
];
LEGACY_KEYS.forEach((key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
