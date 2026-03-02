/**
 * GET /upset-picks — SEO landing page
 * Rewritten from vercel.json: /upset-picks → /api/seo/upset-picks
 */

import { buildLandingPage } from './_html.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'March Madness Upset Picks 2026 | Maximus Sports',
    description: 'Data-driven March Madness upset picks for 2026. Find undervalued teams, analyze ATS trends, and identify where the bracket breaks.',
    url: 'https://maximussports.ai/upset-picks',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Maximus Sports',
      url: 'https://maximussports.ai',
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://maximussports.ai' },
        { '@type': 'ListItem', position: 2, name: 'Upset Picks', item: 'https://maximussports.ai/upset-picks' },
      ],
    },
  };

  const body = `
    <div class="card">
      <h2>What Makes a Good Upset Pick?</h2>
      <p>The best upset candidates share a few traits: they're <strong>ATS-positive over the last 30 games</strong>, playing a team that's been overvalued by the market, and showing line movement toward the underdog in the days before tip-off.</p>
      <p>Maximus tracks all three signals simultaneously to surface games where the upset probability is higher than the market reflects.</p>
    </div>

    <div class="card">
      <h2>The Upset Score System</h2>
      <p>Maximus assigns every matchup an <strong>Upset Score from 0 to 3</strong>:</p>
      <ul>
        <li><strong>Score 1</strong> — Mild upset potential. Tier gap of 1, ATS edge for underdog.</li>
        <li><strong>Score 2</strong> — Elevated upset risk. Tier gap of 2+, recent ATS momentum.</li>
        <li><strong>Score 3</strong> — High Upset Alert. Maximum tier disparity, strong ATS signal, line movement toward the dog.</li>
      </ul>
      <p>Historically, Score-3 games have produced underdog wins at a rate well above the implied probability from the market spread.</p>
    </div>

    <div class="card">
      <h2>ATS Tiers Explained</h2>
      <p>Maximus classifies every program into four tiers based on tournament upside and historical against-the-spread consistency:</p>
      <ul>
        <li><strong>Lock</strong> — Proven tournament teams with strong ATS history</li>
        <li><strong>Should Be In</strong> — Solid programs that often outperform their seed</li>
        <li><strong>Work to Do</strong> — On-the-bubble teams with unpredictable margins</li>
        <li><strong>Long Shot</strong> — Lower-tier programs most likely to produce upsets against top seeds</li>
      </ul>
      <p>The biggest upsets come from Long Shot teams beating Lock or Should-Be-In opponents.</p>
      <p><a href="/insights">Check today's Upset Watch games →</a></p>
    </div>

    <div class="card">
      <h2>Related: Best Bracket Picks</h2>
      <p>Looking to optimize your full bracket? See which teams are consistently beating the spread late in the season — the best predictor of deep tournament runs.</p>
      <p><a href="/best-bracket-picks">Best bracket picks for 2026 →</a></p>
    </div>`;

  const html = buildLandingPage({
    title: 'March Madness Upset Picks 2026',
    description: 'Data-driven March Madness upset picks for 2026. Find undervalued teams using ATS trends, tier analysis, and sharp line movement signals.',
    canonicalPath: '/upset-picks',
    h1: 'March Madness Upset Picks — Data-Driven for 2026',
    lead: "Every bracket needs the right upsets. Maximus's Upset Score system identifies where the market is overvaluing favorites and where underdogs are poised to strike.",
    bullets: [
      'Upset Score (0–3) for every upcoming matchup',
      'Tier-based analysis: Lock vs. Long Shot matchups',
      'ATS trend momentum over last 7 and last 30 games',
      'Line movement signals — detect where sharp money is going',
      'Today\'s Upset Watch alerts updated in real time',
      'Historical upset rates by seed pairing and tier gap',
    ],
    body,
    ctaLabel: 'See Today\'s Upset Watch →',
    ctaPath: '/insights',
    jsonLd,
    trackEvent: 'seo_landing_view_upset_picks',
  });

  return res.status(200).send(html);
}
