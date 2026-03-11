import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import App from './App.jsx';
import { initAnalytics, track } from './analytics/index';

// ── Bootstrap analytics (non-blocking) ────────────────────────────────────────
initAnalytics();

// ── Global error listeners (unhandled promise rejections + uncaught errors) ───
// Truncated messages only — no PII, no full stack in production.

window.addEventListener('unhandledrejection', (event) => {
  try {
    const msg = (event.reason?.message ?? String(event.reason ?? '')).slice(0, 200);
    const stack = (event.reason?.stack ?? '').slice(0, 500);
    track('ui_error', { component: 'unhandledrejection', message: msg, stack });
  } catch { /* never crash */ }
});

window.addEventListener('error', (event) => {
  try {
    const msg   = (event.message ?? 'unknown').slice(0, 200);
    const stack = (event.error?.stack ?? '').slice(0, 500);
    track('ui_error', { component: 'window.onerror', message: msg, stack });
  } catch { /* never crash */ }
});

// ── Render ─────────────────────────────────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
);
