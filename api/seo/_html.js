/**
 * Shared HTML template builder for SEO landing pages.
 * All pages: proper meta tags, OG, Twitter cards, JSON-LD, inline CSS.
 * No external deps, no blocking API calls, no JS required to render content.
 */

const ORIGIN = 'https://maximussports.ai';

export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the complete landing page HTML string.
 *
 * @param {object} opts
 * @param {string}   opts.title         — <title> tag content (no suffix)
 * @param {string}   opts.description   — meta description
 * @param {string}   opts.canonicalPath — absolute path, e.g. "/march-madness-odds"
 * @param {string}   opts.ogImage       — URL to OG image (defaults to /api/og with params)
 * @param {string}   opts.h1            — page headline
 * @param {string}   opts.lead          — 1–2 sentence lead paragraph
 * @param {string[]} opts.bullets       — bullet point list items (plain text)
 * @param {string}   opts.body          — additional HTML body content (trusted, not escaped)
 * @param {string}   opts.ctaLabel      — CTA button label
 * @param {string}   opts.ctaPath       — SPA path to navigate to
 * @param {object}   opts.jsonLd        — JSON-LD structured data object
 * @param {string}   [opts.trackEvent]  — PostHog event name for seo_landing_view
 */
export function buildLandingPage(opts) {
  const {
    title,
    description,
    canonicalPath,
    ogImage,
    h1,
    lead,
    bullets = [],
    body = '',
    ctaLabel = 'Open Maximus Sports',
    ctaPath = '/',
    jsonLd,
    trackEvent = 'seo_landing_view',
  } = opts;

  const canonicalUrl = `${ORIGIN}${canonicalPath}`;
  const ogImageUrl   = ogImage || `${ORIGIN}/api/og?${new URLSearchParams({
    title: title.slice(0, 80),
    subtitle: description.slice(0, 120),
    type: 'Odds Insight',
  }).toString()}`;

  const fullTitle = `${title} | Maximus Sports`;

  const jsonLdStr = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : '';

  const bulletItems = bullets
    .map((b) => `<li>${esc(b)}</li>`)
    .join('\n          ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(canonicalUrl)}" />
  <meta name="robots" content="index, follow" />

  <!-- Open Graph -->
  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${esc(fullTitle)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url"         content="${esc(canonicalUrl)}" />
  <meta property="og:image"       content="${esc(ogImageUrl)}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="Maximus Sports" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${esc(fullTitle)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image"       content="${esc(ogImageUrl)}" />
  <meta name="twitter:site"        content="@MaximusSports" />

  ${jsonLdStr}

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: #0a1628;
      color: #e2e8f0;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 16px;
      line-height: 1.6;
    }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .nav {
      background: rgba(10,22,40,0.95);
      border-bottom: 1px solid rgba(60,121,180,0.18);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(8px);
    }
    .nav-brand {
      color: #fff;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-decoration: none;
    }
    .nav-brand:hover { text-decoration: none; }
    .nav-links { display: flex; gap: 20px; }
    .nav-links a { color: rgba(255,255,255,0.65); font-size: 14px; }
    .nav-links a:hover { color: #fff; text-decoration: none; }

    .hero {
      max-width: 860px;
      margin: 0 auto;
      padding: 60px 24px 40px;
    }
    .tag {
      display: inline-block;
      background: rgba(60,121,180,0.18);
      color: #93c5fd;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 99px;
      border: 1px solid rgba(60,121,180,0.3);
      margin-bottom: 20px;
    }
    h1 {
      font-size: clamp(26px, 5vw, 40px);
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: #fff;
      margin-bottom: 16px;
    }
    .lead {
      font-size: 17px;
      color: rgba(255,255,255,0.72);
      line-height: 1.65;
      max-width: 680px;
      margin-bottom: 32px;
    }
    .cta {
      display: inline-block;
      background: #3c79b4;
      color: #fff;
      font-weight: 700;
      font-size: 15px;
      padding: 14px 32px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s;
      margin-bottom: 48px;
    }
    .cta:hover { background: #2d6192; text-decoration: none; }

    .content {
      max-width: 860px;
      margin: 0 auto;
      padding: 0 24px 80px;
    }
    .card {
      background: rgba(60,121,180,0.06);
      border: 1px solid rgba(60,121,180,0.15);
      border-radius: 12px;
      padding: 28px 32px;
      margin-bottom: 24px;
    }
    .card h2 {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 12px;
    }
    .card p { color: rgba(255,255,255,0.7); font-size: 15px; margin-bottom: 8px; }
    ul { padding-left: 20px; margin-top: 8px; }
    li { color: rgba(255,255,255,0.72); font-size: 15px; margin-bottom: 8px; line-height: 1.5; }
    li strong { color: #fff; }

    .links-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 24px;
    }
    .link-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(60,121,180,0.18);
      border-radius: 8px;
      padding: 16px 18px;
      display: block;
      transition: background 0.15s, border-color 0.15s;
    }
    .link-card:hover {
      background: rgba(60,121,180,0.1);
      border-color: rgba(60,121,180,0.35);
      text-decoration: none;
    }
    .link-card-title {
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      display: block;
      margin-bottom: 4px;
    }
    .link-card-desc {
      color: rgba(255,255,255,0.5);
      font-size: 12px;
      display: block;
    }

    footer {
      border-top: 1px solid rgba(60,121,180,0.15);
      padding: 20px 24px;
      text-align: center;
      color: rgba(255,255,255,0.35);
      font-size: 13px;
    }
    footer a { color: rgba(255,255,255,0.45); }

    @media (max-width: 600px) {
      .hero { padding: 40px 16px 24px; }
      .content { padding: 0 16px 60px; }
      .cta { display: block; text-align: center; }
    }
  </style>
</head>
<body>
  <!-- Navigation -->
  <nav class="nav">
    <a href="/" class="nav-brand">Maximus Sports</a>
    <div class="nav-links">
      <a href="/insights">Odds Insights</a>
      <a href="/teams">Teams</a>
      <a href="/news">News</a>
    </div>
  </nav>

  <!-- Hero -->
  <div class="hero">
    <div class="tag">March Madness 2026</div>
    <h1>${esc(h1)}</h1>
    <p class="lead">${esc(lead)}</p>
    <a class="cta" href="${esc(ctaPath)}" id="main-cta" onclick="try{window._ph&&window._ph.capture('seo_continue_click',{page:'${esc(canonicalPath)}'})}catch(e){}">${esc(ctaLabel)}</a>
  </div>

  <!-- Content -->
  <div class="content">
    ${bullets.length > 0 ? `
    <div class="card">
      <h2>Key Insights</h2>
      <ul>
          ${bulletItems}
      </ul>
    </div>` : ''}

    ${body}

    <!-- Internal links -->
    <div class="card">
      <h2>Explore Maximus Sports</h2>
      <div class="links-grid">
        <a href="/insights" class="link-card">
          <span class="link-card-title">Odds Insights</span>
          <span class="link-card-desc">Live lines, ATS leaders, market briefing</span>
        </a>
        <a href="/teams" class="link-card">
          <span class="link-card-title">All Teams</span>
          <span class="link-card-desc">Browse 70+ NCAAM programs</span>
        </a>
        <a href="/news" class="link-card">
          <span class="link-card-title">Intel Feed</span>
          <span class="link-card-desc">Latest basketball news &amp; analysis</span>
        </a>
        <a href="/" class="link-card">
          <span class="link-card-title">Dashboard</span>
          <span class="link-card-desc">Scores, pinned teams, ATS leaders</span>
        </a>
      </div>
    </div>
  </div>

  <footer>
    <a href="/">Maximus Sports</a> &nbsp;·&nbsp;
    <a href="/insights">Odds Insights</a> &nbsp;·&nbsp;
    <a href="/teams">Teams</a> &nbsp;·&nbsp;
    <a href="/news">News</a>
    <br /><br />
    Men's college basketball intelligence for March Madness 2026.
  </footer>

  <script>
    // Lightweight PostHog snippet — non-blocking
    try {
      var ph = window._ph;
      if (window.VITE_POSTHOG_KEY || localStorage.getItem('ph_project_api_key')) {
        // PostHog will be initialized by the SPA; just queue events
      }
      // Fire seo_landing_view via a fire-and-forget image beacon
      var img = new Image();
      img.src = '/api/health?ev=${esc(trackEvent)}&p=${esc(canonicalPath)}';
    } catch(e) {}
  </script>
</body>
</html>`;
}
