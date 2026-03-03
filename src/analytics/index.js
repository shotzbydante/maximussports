/**
 * Maximus Sports — Analytics Wrapper
 *
 * Supports GA4 (gtag) and PostHog with lazy/non-blocking loading.
 * Privacy-safe: no IP tracking, no user-agent fingerprinting, no PII.
 *
 * ENV VARS (all optional unless noted):
 *   VITE_GA4_ID            G-XXXXXXX         — if absent GA4 is disabled
 *   VITE_POSTHOG_KEY       phc_xxx           — PostHog project key
 *   VITE_POSTHOG_HOST      https://app.posthog.com  — default shown
 *   VITE_ANALYTICS_ENABLED "false"           — kill switch (default: enabled)
 *
 * Debug mode: append ?debugAnalytics=1 to any URL to console.log all events.
 */

const ENABLED  = import.meta.env.VITE_ANALYTICS_ENABLED !== 'false';
const PH_KEY   = import.meta.env.VITE_POSTHOG_KEY   ?? '';
const PH_HOST  = import.meta.env.VITE_POSTHOG_HOST  ?? 'https://app.posthog.com';
const GA4_ID   = import.meta.env.VITE_GA4_ID        ?? '';

/** Returns true when ?debugAnalytics=1 is in the current URL. */
const isDebug = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debugAnalytics');

// ─── Internal state ───────────────────────────────────────────────────────────

let _posthog    = null;   // set after dynamic import resolves
let _ga4Ready   = false;  // set after gtag script tag added
let _sessionId  = '';

// ─── Session ID ───────────────────────────────────────────────────────────────

function getOrCreateSessionId() {
  try {
    let id = sessionStorage.getItem('mx_session_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('mx_session_id', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip undefined/null, cap strings to 200 chars, ensure JSON-serializable.
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function sanitizeProps(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string')                        { out[k] = v.slice(0, 200); }
    else if (typeof v === 'number' || typeof v === 'boolean') { out[k] = v; }
    else {
      try { out[k] = JSON.parse(JSON.stringify(v)); } catch { /* skip */ }
    }
  }
  return out;
}

/**
 * Privacy-safe context props attached to every event.
 * No IP, no UA fingerprinting.
 */
export function getContextProps() {
  const out = { session_id: _sessionId };
  try {
    out.vw     = window.innerWidth;
    out.vh     = window.innerHeight;
    out.device = window.innerWidth < 768 ? 'mobile'
               : window.innerWidth < 1024 ? 'tablet'
               : 'desktop';
  } catch { /* SSR safety */ }
  return out;
}

// ─── Provider loaders (non-blocking) ─────────────────────────────────────────

function loadGA4(id) {
  if (!id || typeof document === 'undefined') return;
  try {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id, { send_page_view: false });
    _ga4Ready = true;
    if (isDebug()) console.log('[Analytics] GA4 ready:', id);
  } catch (e) {
    if (isDebug()) console.warn('[Analytics] GA4 load failed', e);
  }
}

async function loadPostHog(key, host) {
  if (!key || typeof window === 'undefined') return;
  try {
    const mod = await import('posthog-js');
    const ph = mod.default;
    ph.init(key, {
      api_host:                  host,
      autocapture:               false,  // manual capture only
      capture_pageview:          false,  // we fire manually
      capture_pageleave:         true,
      persistence:               'localStorage',
      disable_session_recording: false,
      loaded: (instance) => {
        _posthog = instance;
        if (isDebug()) console.log('[Analytics] PostHog ready');
      },
    });
  } catch (e) {
    if (isDebug()) console.warn('[Analytics] PostHog load failed', e);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once at app start (in main.jsx). Non-blocking — returns immediately.
 */
export function initAnalytics() {
  if (!ENABLED || typeof window === 'undefined') return;
  try {
    _sessionId = getOrCreateSessionId();

    // GA4: dynamic script tag, async
    if (GA4_ID) loadGA4(GA4_ID);

    // PostHog: dynamic import during idle time
    if (PH_KEY) {
      const load = () => loadPostHog(PH_KEY, PH_HOST);
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(load, { timeout: 3000 });
      } else {
        setTimeout(load, 200);
      }
    }

    // session_start — fire once per browser session (tab lifetime)
    setTimeout(() => {
      try {
        const fired = sessionStorage.getItem('mx_session_start');
        if (!fired) {
          sessionStorage.setItem('mx_session_start', '1');
          track('session_start', {});
        }
      } catch { /* ignore */ }
    }, 600);

  } catch { /* never crash */ }
}

/**
 * Track a named event with optional props. Never throws.
 * @param {string} eventName
 * @param {Record<string, unknown>} [props]
 */
export function track(eventName, props = {}) {
  if (!ENABLED) return;
  try {
    const merged = sanitizeProps({ ...getContextProps(), ...props });

    if (isDebug()) {
      console.log(`[Analytics] ▶ ${eventName}`, merged);
    }

    if (_posthog) {
      try { _posthog.capture(eventName, merged); } catch { /* ignore */ }
    }

    if (_ga4Ready && window.gtag) {
      try { window.gtag('event', eventName, merged); } catch { /* ignore */ }
    }
  } catch { /* never crash */ }
}

/**
 * Track a pageview. Called by AnalyticsRouteListener on route changes.
 * @param {string} pathname
 */
export function pageview(pathname) {
  if (!ENABLED) return;
  try {
    const props = sanitizeProps({ pathname, ...getContextProps() });

    if (isDebug()) {
      console.log(`[Analytics] ▶ $pageview ${pathname}`, props);
    }

    if (_posthog) {
      try { _posthog.capture('$pageview', props); } catch { /* ignore */ }
    }

    if (_ga4Ready && window.gtag && GA4_ID) {
      try { window.gtag('event', 'page_view', { page_path: pathname }); } catch { /* ignore */ }
    }
  } catch { /* never crash */ }
}

/**
 * Identify a user and set their person properties in PostHog.
 * Safe to call multiple times — PostHog merges properties.
 * @param {string} userId
 * @param {Record<string, unknown>} [traits]
 */
export function identify(userId, traits = {}) {
  if (!ENABLED || !userId) return;
  try {
    const props = sanitizeProps(traits);
    if (isDebug()) console.log(`[Analytics] identify ${userId}`, Object.keys(props));
    if (_posthog) _posthog.identify(userId, props);
  } catch { /* ignore */ }
}

/**
 * Alias an anonymous distinct_id to a known stable user ID.
 * Call before identify() on first signup/login so PostHog merges the
 * anonymous session into the authenticated person record.
 * @param {string} userId  — stable backend user ID (e.g. Supabase user.id)
 */
export function alias(userId) {
  if (!ENABLED || !userId) return;
  try {
    if (_posthog) {
      const currentId = _posthog.get_distinct_id?.();
      // Only alias when the anonymous session ID differs from the target user ID.
      // Skipping when they match prevents circular self-aliases.
      if (currentId && currentId !== userId) {
        _posthog.alias?.(userId);
        if (isDebug()) console.log(`[Analytics] alias ${currentId} → ${userId}`);
      }
    }
  } catch { /* ignore */ }
}

/**
 * Set additional user-level properties.
 * @param {Record<string, unknown>} props
 */
export function setUserProperties(props = {}) {
  if (!ENABLED) return;
  try {
    if (_posthog) _posthog.people?.set(sanitizeProps(props));
  } catch { /* ignore */ }
}

/**
 * Flush any buffered events (PostHog auto-flushes; this is a no-op safety valve).
 */
export function flush() {
  try {
    if (_posthog) _posthog.flush?.();
  } catch { /* ignore */ }
}

/**
 * Reset PostHog identity — call on sign-out or device clear.
 * Clears stored distinct ID and person properties so the next session is anonymous.
 */
export function analyticsReset() {
  if (!ENABLED) return;
  try {
    if (_posthog) _posthog.reset?.();
  } catch { /* ignore */ }
}
