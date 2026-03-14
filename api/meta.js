/**
 * GET /api/meta?path=/teams/duke-blue-devils
 *
 * Server-rendered metadata page for social crawlers.
 * Returns a minimal HTML document with full OG/Twitter tags so that
 * iMessage, Slack, X, Discord, and Facebook generate rich link previews.
 *
 * Human visitors receive a transparent redirect back to the SPA.
 * This endpoint is reached only when Vercel rewrites match a bot UA on
 * key SPA routes (see vercel.json `has` conditions).
 *
 * Cache: 1 hour edge cache, 1 day stale-while-revalidate.
 */

const ORIGIN  = 'https://maximussports.ai';
const SITE_NAME = 'Maximus Sports';
const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_OG_IMAGE = `${ORIGIN}/og.png`;

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOgImageUrl({ title, subtitle, meta, team, type } = {}) {
  const params = new URLSearchParams();
  if (title)    params.set('title',    String(title).slice(0, 80));
  if (subtitle) params.set('subtitle', String(subtitle).slice(0, 120));
  if (meta)     params.set('meta',     String(meta).slice(0, 60));
  if (team)     params.set('team',     String(team).slice(0, 40));
  if (type)     params.set('type',     String(type).slice(0, 30));
  return `${ORIGIN}/api/og?${params.toString()}`;
}

function titleCase(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function resolvePageMeta(pathname) {
  if (pathname === '/' || pathname === '') {
    return {
      title: `College Basketball Betting Intelligence & March Madness Picks (${CURRENT_YEAR})`,
      description: `AI-powered college basketball betting intelligence for the ${CURRENT_YEAR} season — ATS picks, model-driven predictions, and March Madness insights across every major NCAAB matchup.`,
      ogImage: DEFAULT_OG_IMAGE,
      canonicalPath: '/',
    };
  }

  if (pathname === '/teams') {
    return {
      title: `College Basketball Team Intel Hub — Conference Betting Intelligence (${CURRENT_YEAR})`,
      description: `Explore ${CURRENT_YEAR} college basketball intelligence by conference. ATS trends, championship odds, tournament projections, and betting signals for every tracked NCAAB program.`,
      ogImage: buildOgImageUrl({ title: 'Team Intel Hub', subtitle: 'ATS trends, championship odds & conference intelligence', type: 'Team Intel' }),
      canonicalPath: '/teams',
    };
  }

  const teamMatch = pathname.match(/^\/teams\/([a-z0-9-]+)$/);
  if (teamMatch) {
    const slug = teamMatch[1];
    const teamName = titleCase(slug);
    return {
      title: `${teamName} Team Intel`,
      description: `ATS trends, next-game intel, rankings, and betting signals for ${teamName}. Conference intelligence powered by ${SITE_NAME}.`,
      ogImage: buildOgImageUrl({ title: teamName, subtitle: 'ATS trends, matchup edges & betting intelligence', team: teamName, type: 'Team Intel' }),
      canonicalPath: `/teams/${slug}`,
    };
  }

  if (pathname === '/insights' || pathname === '/odds-insights') {
    return {
      title: `College Basketball Odds Insights`,
      description: `Live spreads, ATS trends, value leans, and market intelligence across the ${CURRENT_YEAR} college basketball board. Updated daily with model-driven edges.`,
      ogImage: buildOgImageUrl({ title: 'Odds Insights', subtitle: 'Live spreads, ATS trends & market intelligence', type: 'Odds Insight' }),
      canonicalPath: '/insights',
    };
  }

  if (pathname === '/college-basketball-picks-today') {
    return {
      title: `College Basketball Picks Today (${CURRENT_YEAR})`,
      description: `Today's college basketball betting intelligence — ATS picks, model-driven predictions, value leans, and game totals across the NCAAB slate.`,
      ogImage: buildOgImageUrl({ title: "Today's Picks", subtitle: 'ATS picks, value leans & game totals', type: 'Odds Insight' }),
      canonicalPath: '/college-basketball-picks-today',
    };
  }

  if (pathname === '/games') {
    return {
      title: `College Basketball Games Today — Live Scores & Spreads`,
      description: `Live college basketball scores, spreads, and the full NCAAB daily schedule for ${CURRENT_YEAR}. Track every game with real-time odds and betting lines.`,
      ogImage: buildOgImageUrl({ title: "Today's Games", subtitle: 'Live scores, spreads & daily schedule', type: 'Odds Insight' }),
      canonicalPath: '/games',
    };
  }

  const matchupMatch = pathname.match(/^\/games\/(.+)$/);
  if (matchupMatch) {
    const slug = matchupMatch[1];
    const parts = slug.replace(/-prediction$/, '').split('-vs-');
    if (parts.length === 2) {
      const teamA = titleCase(parts[0]);
      const teamB = titleCase(parts[1]);
      return {
        title: `${teamA} vs ${teamB} Odds, ATS Signals & Picks`,
        description: `Live spread intel, model edges, and game analysis for ${teamA} vs ${teamB}. Data-driven predictions powered by ${SITE_NAME}.`,
        ogImage: buildOgImageUrl({ title: `${teamA} vs ${teamB}`, subtitle: 'Matchup analysis & predictions', type: 'Matchup Intel' }),
        canonicalPath: `/games/${slug}`,
      };
    }
  }

  if (pathname === '/news') {
    return {
      title: `College Basketball Intel — Headlines & Analysis`,
      description: `Curated college basketball videos, headlines, analysis, and betting intel across every major conference. Your command center for NCAAB intelligence.`,
      ogImage: buildOgImageUrl({ title: 'Intel Feed', subtitle: 'Headlines, analysis & betting intel', type: 'Team Intel' }),
      canonicalPath: '/news',
    };
  }

  if (pathname === '/march-madness-betting-intelligence') {
    return {
      title: `March Madness Betting Intelligence (${CURRENT_YEAR})`,
      description: `${CURRENT_YEAR} March Madness betting intelligence — tournament matchup insights, team betting trends, bracket analysis, and championship odds.`,
      ogImage: buildOgImageUrl({ title: 'March Madness Intelligence', subtitle: 'Tournament picks, trends & bracket analysis', type: 'Bracket Bust' }),
      canonicalPath: '/march-madness-betting-intelligence',
    };
  }

  return {
    title: `College Basketball Betting Intelligence`,
    description: `AI-powered college basketball intel — ATS trends, model-driven picks, odds movement, and team analytics. Track your teams smarter with ${SITE_NAME}.`,
    ogImage: DEFAULT_OG_IMAGE,
    canonicalPath: pathname,
  };
}

function buildMetaPage(meta) {
  const fullTitle = `${esc(meta.title)} | ${SITE_NAME}`;
  const description = esc(meta.description);
  const canonicalUrl = esc(`${ORIGIN}${meta.canonicalPath}`);
  const ogImage = esc(meta.ogImage);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${fullTitle}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="icon" type="image/png" href="${esc(ORIGIN)}/favicon.png" />

  <!-- Open Graph -->
  <meta property="og:type"         content="website" />
  <meta property="og:title"        content="${fullTitle}" />
  <meta property="og:description"  content="${description}" />
  <meta property="og:url"          content="${canonicalUrl}" />
  <meta property="og:image"        content="${ogImage}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt"    content="${fullTitle}" />
  <meta property="og:site_name"    content="${SITE_NAME}" />
  <meta property="og:locale"       content="en_US" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${fullTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image"       content="${ogImage}" />
  <meta name="twitter:image:alt"   content="${fullTitle}" />
  <meta name="twitter:site"        content="@MaximusSports" />

  <!-- Redirect to SPA -->
  <meta http-equiv="refresh" content="0; url=${canonicalUrl}" />

  <style>
    body {
      background: #0a1628;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
    }
    .wrap { text-align: center; max-width: 480px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
    p { color: rgba(255,255,255,0.6); font-size: 15px; margin: 0 0 20px; }
    a {
      display: inline-block;
      background: #3c79b4;
      color: #fff;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      padding: 12px 28px;
      border-radius: 8px;
    }
    .brand {
      color: rgba(255,255,255,0.3);
      font-size: 12px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${esc(meta.title)}</h1>
    <p>${description}</p>
    <a href="${canonicalUrl}">Open in Maximus Sports →</a>
    <div class="brand">MAXIMUS SPORTS</div>
  </div>
  <script>try{window.location.replace(${JSON.stringify(`${ORIGIN}${meta.canonicalPath}`)});}catch(e){}</script>
</body>
</html>`;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method !== 'GET') return res.status(405).end();

  const url = new URL(req.url, `https://${req.headers.host || 'maximussports.ai'}`);
  const pathname = url.searchParams.get('path') || '/';
  const meta = resolvePageMeta(pathname);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(buildMetaPage(meta));
}
