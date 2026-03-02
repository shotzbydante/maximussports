/**
 * GET /api/share/render?id=:id
 *
 * Server-renders a share page with:
 *   - Full OG / Twitter meta tags for social preview images
 *   - Meta-refresh redirect + JS redirect to the SPA destination
 *   - "Continue to app" link for no-JS clients
 *   - PostHog server-side analytics ping (no PII, fire-and-forget)
 *
 * Social crawlers (Twitter/X, iMessage, Slack, Discord) will see the OG tags
 * and generate a rich link preview. Human users are immediately redirected.
 */

import { getJson } from '../_globalCache.js';

const ORIGIN  = 'https://maximussports.ai';
const DEFAULT_OG_IMAGE = `${ORIGIN}/og.png`;
const DEFAULT_DEST     = '/';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTypeLabel(type) {
  const labels = {
    upset_watch: 'Upset Watch',
    ats_intel:   'ATS Intel',
    odds_insight: 'Odds Insight',
    team_intel:   'Team Intel',
    bracket_bust: 'Bracket Bust Alert',
    matchup:      'Matchup Intel',
  };
  return labels[type] || 'Maximus Insight';
}

function buildOgImageUrl(payload) {
  try {
    const params = new URLSearchParams();
    if (payload.title)    params.set('title',    payload.title.slice(0, 80));
    if (payload.subtitle) params.set('subtitle', payload.subtitle.slice(0, 120));
    if (payload.meta)     params.set('meta',     payload.meta.slice(0, 60));
    if (payload.teamSlug) {
      // Convert slug to display name: "duke-blue-devils" → "Duke Blue Devils"
      const teamName = payload.teamSlug
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      params.set('team', teamName.slice(0, 40));
    }
    if (payload.type) {
      const typeLabel = buildTypeLabel(payload.type);
      params.set('type', typeLabel.slice(0, 30));
    }
    return `${ORIGIN}/api/og?${params.toString()}`;
  } catch {
    return DEFAULT_OG_IMAGE;
  }
}

function buildPage(payload, shareId) {
  const dest = payload.destinationPath || DEFAULT_DEST;
  const destUrl = `${ORIGIN}${dest.startsWith('/') ? dest : '/' + dest}`;

  const title    = escapeHtml(payload.title) || 'Maximus Sports Insight';
  const subtitle = escapeHtml(payload.subtitle) || '';
  const meta     = escapeHtml(payload.meta) || '';
  const typeLabel = escapeHtml(buildTypeLabel(payload.type));

  const descParts = [subtitle, meta].filter(Boolean);
  const ogDesc = escapeHtml(descParts.join(' · ') || 'March Madness intelligence — odds, ATS insights, and bracket intel.');
  const ogImage = escapeHtml(buildOgImageUrl(payload));
  const shareUrl = escapeHtml(`${ORIGIN}/share/${shareId}`);
  const destUrlEsc = escapeHtml(destUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Maximus Sports</title>
  <meta name="description" content="${ogDesc}" />
  <link rel="canonical" href="${shareUrl}" />
  <meta name="robots" content="noindex, follow" />

  <!-- Open Graph -->
  <meta property="og:type"        content="article" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${ogDesc}" />
  <meta property="og:url"         content="${shareUrl}" />
  <meta property="og:image"       content="${ogImage}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="Maximus Sports" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${title}" />
  <meta name="twitter:description" content="${ogDesc}" />
  <meta name="twitter:image"       content="${ogImage}" />
  <meta name="twitter:site"        content="@MaximusSports" />

  <!-- Redirect: meta refresh for no-JS clients -->
  <meta http-equiv="refresh" content="0; url=${destUrlEsc}" />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a1628;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: rgba(60,121,180,0.08);
      border: 1px solid rgba(60,121,180,0.2);
      border-radius: 16px;
      padding: 40px 48px;
      max-width: 560px;
      width: 100%;
      text-align: center;
    }
    .label {
      display: inline-block;
      background: #3c79b4;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 14px;
      border-radius: 99px;
      margin-bottom: 20px;
    }
    h1 { font-size: 22px; font-weight: 700; line-height: 1.3; margin-bottom: 12px; }
    .sub { color: rgba(255,255,255,0.65); font-size: 15px; line-height: 1.5; margin-bottom: 28px; }
    .cta {
      display: inline-block;
      background: #3c79b4;
      color: #fff;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      padding: 12px 28px;
      border-radius: 8px;
    }
    .cta:hover { background: #2d6192; }
    .wordmark { color: rgba(255,255,255,0.35); font-size: 12px; margin-top: 24px; letter-spacing: 0.08em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="label">${typeLabel}</div>
    <h1>${title}</h1>
    ${subtitle ? `<p class="sub">${subtitle}</p>` : '<p class="sub">Opening Maximus Sports…</p>'}
    <a class="cta" href="${destUrlEsc}" id="cta">Continue to app →</a>
    <div class="wordmark">MAXIMUS SPORTS</div>
  </div>
  <script>
    // Immediate JS redirect — faster than meta-refresh
    try { window.location.replace(${JSON.stringify(destUrl)}); } catch(e) {}
  </script>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Link Expired — Maximus Sports</title>
  <meta name="robots" content="noindex" />
  <meta http-equiv="refresh" content="3; url=${escapeHtml(ORIGIN)}" />
  <style>
    body { background:#0a1628; color:#fff; font-family:system-ui,sans-serif;
           display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .box { text-align:center; }
    h1 { font-size:20px; margin-bottom:12px; }
    p { color:rgba(255,255,255,0.6); font-size:15px; }
    a { color:#3c79b4; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Link expired or not found</h1>
    <p>Redirecting to <a href="${escapeHtml(ORIGIN)}">Maximus Sports</a>…</p>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');

  if (req.method !== 'GET') return res.status(405).end();

  const url = new URL(req.url, `https://${req.headers.host || 'maximussports.ai'}`);
  const id = url.searchParams.get('id');

  if (!id || !/^[a-z0-9]{6,16}$/.test(id)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(notFoundPage());
  }

  const payload = await getJson(`share:${id}`).catch(() => null);

  if (!payload) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(notFoundPage());
  }

  const html = buildPage(payload, id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
