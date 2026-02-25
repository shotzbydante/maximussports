/**
 * Minimal analytics abstraction for the marketing site.
 * In dev: console.log. In prod: no-op unless ENABLE_ANALYTICS is set.
 * Placeholder for future GA4 / PostHog integration.
 */

const isDev = process.env.NODE_ENV === 'development';
const isEnabled = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true';

function shouldTrack() {
  return isDev || isEnabled;
}

export function trackPageView(path) {
  if (!shouldTrack()) return;
  if (isDev) {
    console.log('[analytics] pageView', { path });
  }
  // Future: window.gtag?.('event', 'page_view', { page_path: path });
  // Future: posthog?.capture('$pageview', { path });
}

export function trackCtaClick({ ctaId, location }) {
  if (!shouldTrack()) return;
  if (isDev) {
    console.log('[analytics] ctaClick', { ctaId, location });
  }
  // Future: window.gtag?.('event', 'click', { cta_id: ctaId, location });
  // Future: posthog?.capture('cta_click', { ctaId, location });
}
