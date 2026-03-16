import { useEffect, useRef } from 'react';
import { track, getContextProps } from '../analytics/index';

/**
 * Captures referrer, utm params, and auth state once on mount.
 * Returns a stable context object for inclusion in later events.
 */
function captureEntryContext(user) {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      pathname: window.location.pathname,
      referrer: (document.referrer || '').slice(0, 200),
      utm_source: params.get('utm_source') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
      is_authenticated: !!user,
      ...getContextProps(),
    };
  } catch {
    return { is_authenticated: !!user };
  }
}

/**
 * Homepage load telemetry hook.
 *
 * Fires:
 *  - homepage_load_started   — on mount
 *  - homepage_load_completed — when criticalReady flips true
 *  - homepage_load_failed    — when hasCriticalError flips true
 *
 * @param {{ criticalReady: boolean, hasCriticalError: boolean, user: object|null }} opts
 */
export function useHomeLoadTelemetry({ criticalReady, hasCriticalError, user }) {
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const failedRef = useRef(false);
  const t0Ref = useRef(Date.now());
  const ctxRef = useRef(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    t0Ref.current = Date.now();
    ctxRef.current = captureEntryContext(user);
    track('homepage_load_started', { ...ctxRef.current });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!criticalReady || completedRef.current) return;
    completedRef.current = true;
    const elapsed = Date.now() - t0Ref.current;
    track('homepage_load_completed', {
      ...ctxRef.current,
      elapsed_ms: elapsed,
    });
  }, [criticalReady]);

  useEffect(() => {
    if (!hasCriticalError || failedRef.current) return;
    failedRef.current = true;
    const elapsed = Date.now() - t0Ref.current;
    track('homepage_load_failed', {
      ...ctxRef.current,
      elapsed_ms: elapsed,
    });
  }, [hasCriticalError]);
}
