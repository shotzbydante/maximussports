/**
 * AskLauncher — how Ask Maximus sits in the app before anyone uses it.
 *
 * Closed, it is one small mascot in the corner. Once per page it may say
 * one line that is true right now ("Raiders at Chiefs. Want my read?"),
 * then go quiet again. It never opens itself and never covers the page.
 * Tapping the line asks that question; tapping the mascot opens the panel.
 *
 * The panel's code is loaded the first time it is opened, so the launcher
 * costs a page almost nothing.
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRouteAccess } from '../../hooks/useAuthGate';
import { mascotFor } from '../../brand/mascots';
import { track } from '../../analytics/index';
import { useAsk } from './askState';
import { launcherAllowed, pageContext, peekLine } from './askContext';
import a from './ask.module.css';

const AskPanel = lazy(() => import('./AskPanel'));

const PEEK_AFTER_MS = 4500;
const PEEK_FOR_MS = 9000;
const PEEKS_PER_VISIT = 3;
const PEEK_KEY = 'mx_ask_peeks';

function readPeeks() {
  try { return JSON.parse(window.sessionStorage.getItem(PEEK_KEY) || '{}'); } catch { return {}; }
}
function writePeeks(next) {
  try { window.sessionStorage.setItem(PEEK_KEY, JSON.stringify(next)); } catch { /* storage blocked: peeks repeat, nothing breaks */ }
}

export default function AskLauncher() {
  const { enabled, status, open, openAsk } = useAsk();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [peek, setPeek] = useState(null);
  const puckRef = useRef(null);
  const wasOpen = useRef(false);

  const allowed = launcherAllowed(pathname);
  const key = pageContext(pathname).key;

  // One line, once per kind of page, a few seconds after arriving. Never
  // again after it has been dismissed or the panel has been used.
  useEffect(() => {
    if (!enabled || !allowed || open) return undefined;
    const state = readPeeks();
    const seen = state.seen || [];
    if (state.off || seen.includes(key) || seen.length >= PEEKS_PER_VISIT) return undefined;
    const ctx = pageContext(pathname);
    let hide;
    const show = setTimeout(() => {
      writePeeks({ ...state, seen: [...seen, key] });
      setPeek({ key, ...peekLine(ctx, status || {}) });
      track('ask_peek_shown', { sport: 'nfl', page: ctx.kind });
      hide = setTimeout(() => setPeek(null), PEEK_FOR_MS);
    }, PEEK_AFTER_MS);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [enabled, allowed, open, key, pathname, status]);

  // Closing the panel hands focus back to the button that opened it.
  useEffect(() => {
    if (wasOpen.current && !open) puckRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (!enabled || !allowed) return null;

  const line = peek && peek.key === key ? peek : null;
  const quiet = () => { writePeeks({ ...readPeeks(), off: true }); setPeek(null); track('ask_peek_dismissed', { sport: 'nfl' }); };
  const stopPeeks = () => { writePeeks({ ...readPeeks(), off: true }); setPeek(null); };
  // Signed out, an open page carries the sign-up bar along the bottom: sit above it.
  const aboveBar = !user && pathname !== '/' && getRouteAccess(pathname) !== 'preview';

  if (open) {
    return <Suspense fallback={null}><AskPanel /></Suspense>;
  }

  return (
    <div className={`${a.launcher} ${aboveBar ? a.aboveBar : ''}`}>
      {line && (
        <div className={a.peek}>
          <button type="button" className={a.peekLine} onClick={() => { stopPeeks(); openAsk({ question: line.question, source: 'peek' }); }}>
            {line.text}
          </button>
          <button type="button" className={a.peekClose} onClick={quiet} aria-label="Dismiss">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
          </button>
        </div>
      )}
      <button
        ref={puckRef}
        type="button"
        className={a.puck}
        onClick={() => { stopPeeks(); openAsk({ source: 'launcher' }); }}
        aria-label="Ask Maximus"
        aria-haspopup="dialog"
      >
        <img src={mascotFor('nfl').flat} alt="" width="44" height="44" />
      </button>
    </div>
  );
}
