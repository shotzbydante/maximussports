/**
 * GET /march-madness-odds — SEO landing page
 * Rewritten from vercel.json: /march-madness-odds → /api/seo/march-madness-odds
 */

import { buildLandingPage } from './_html.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'March Madness Odds 2026 | Maximus Sports',
    description: 'Real-time March Madness odds, ATS insights, line movement, and bracket intelligence for the 2026 NCAA Tournament.',
    url: 'https://maximussports.ai/march-madness-odds',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Maximus Sports',
      url: 'https://maximussports.ai',
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://maximussports.ai' },
        { '@type': 'ListItem', position: 2, name: 'March Madness Odds', item: 'https://maximussports.ai/march-madness-odds' },
      ],
    },
  };

  const body = `
    <div class="card">
      <h2>How to Read March Madness Odds</h2>
      <p>The <strong>spread</strong> indicates how many points the favored team must win by. A team listed at <strong>–7.5</strong> needs to win by 8 or more for a bet on them to cover.</p>
      <p>The <strong>moneyline</strong> is a straight-up win/loss wager. Favorites show negative numbers (e.g., –210); underdogs show positive (e.g., +175).</p>
      <p>The <strong>over/under (O/U)</strong> sets the total combined score. Bet whether the final total will be over or under that number.</p>
    </div>

    <div class="card">
      <h2>ATS Leaders — Who's Beating the Spread?</h2>
      <p>Against-the-spread (ATS) performance is often more predictive of tournament success than raw record. Maximus tracks ATS over the <strong>last 7 games, last 30 games, and full season</strong> for every major program.</p>
      <p>Teams with strong ATS records in late-season play tend to outperform bracket expectations in March.</p>
      <p><a href="/insights">View current ATS leaders →</a></p>
    </div>

    <div class="card">
      <h2>Line Movement Matters</h2>
      <p>Sharp money moves lines. When a spread moves 1–2 points after opening, it often signals that professional bettors have identified value. Maximus tracks <strong>line movement snapshots every 5 minutes</strong> for upcoming games.</p>
      <p>A line moving against public betting percentages (reverse line movement) is one of the clearest sharp-money signals in college basketball.</p>
    </div>

    <div class="card">
      <h2>Upset Watch for March Madness</h2>
      <p>March Madness produces more upsets than any other major sport tournament. Maximus's <strong>Upset Score</strong> (1–3) rates each matchup by tier gap, ATS trend, and public-vs-sharp disagreement.</p>
      <p>Games with an Upset Score of 3 historically cover for the underdog at a significantly higher rate than the market implies.</p>
      <p><a href="/upset-picks">See current upset picks →</a></p>
    </div>`;

  const html = buildLandingPage({
    title: 'March Madness Odds 2026',
    description: 'Real-time March Madness odds, ATS insights, line movement tracker, and upset alerts for NCAA Tournament 2026. Built for serious NCAAM fans.',
    canonicalPath: '/march-madness-odds',
    h1: 'March Madness Odds & ATS Intelligence',
    lead: 'Track real-time spreads, line movement, and against-the-spread leaders for every major college basketball program. Built for the 2026 NCAA Tournament.',
    bullets: [
      'Live spreads and moneylines for 70+ NCAAM programs',
      'ATS leaders ranked by last 7, last 30, and full season',
      'Line movement tracking — spot sharp money before the public',
      'Upset Score (1–3) for every tournament matchup',
      'Championship odds with daily updates',
      'AI-generated market briefing updated every 5 minutes',
    ],
    body,
    ctaLabel: 'View Live March Madness Odds →',
    ctaPath: '/insights',
    jsonLd,
    trackEvent: 'seo_landing_view_march_madness_odds',
  });

  return res.status(200).send(html);
}
