/**
 * Records who fetches the pages written for search engines and AI agents.
 *
 * Crawlers and AI agents do not run JavaScript, so the browser analytics
 * never see them, and these pages are served from the CDN cache, so their
 * functions do not run on most requests either. This runs in front of the
 * cache, on the six paths in `matcher` only, and sends one PostHog event
 * per request: `site_page_fetched`.
 *
 * It never changes the response and never delays it: the event is sent
 * after the response is on its way, and any failure here is swallowed.
 * No IP address is sent.
 */
import { next } from '@vercel/functions';
import { visitorKind } from './api/_lib/visitorKind.js';

export const config = {
  runtime: 'nodejs',
  matcher: ['/nfl-picks', '/ask-maximus', '/about', '/llms.txt', '/robots.txt', '/sitemap.xml'],
};

const PH_KEY = process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_KEY || '';
const PH_HOST = process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

async function record(request) {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';
  const { agent, kind } = visitorKind(ua);
  const res = await fetch(`${PH_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: PH_KEY,
      event: 'site_page_fetched',
      // One PostHog person per named agent; people in a browser are not profiled here.
      distinct_id: kind === 'browser' || kind === 'unknown' ? 'page-fetch:person' : `agent:${agent}`,
      properties: {
        path: url.pathname,
        agent,
        agent_kind: kind,
        user_agent: ua.slice(0, 200),
        referrer_host: hostOf(request.headers.get('referer')),
        $process_person_profile: false,
        $geoip_disable: true,
        $lib: 'maximus-middleware',
      },
    }),
  });
  if (!res.ok) console.warn(`[page-fetch] capture failed: ${res.status}`);
}

export default function middleware(request, context) {
  try {
    if (PH_KEY && request.method === 'GET') {
      const work = record(request).catch((err) => console.warn(`[page-fetch] capture error: ${err?.message}`));
      if (context?.waitUntil) context.waitUntil(work);
    }
  } catch { /* measuring must never break the page */ }
  // The header only shows that this ran; it carries nothing else.
  return next({ headers: { 'x-mx-measured': PH_KEY ? '1' : 'no-key' } });
}
