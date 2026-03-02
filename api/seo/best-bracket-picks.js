/**
 * GET /best-bracket-picks — SEO landing page
 * Rewritten from vercel.json: /best-bracket-picks → /api/seo/best-bracket-picks
 */

import { buildLandingPage } from './_html.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Best Bracket Picks for March Madness 2026 | Maximus Sports',
    description: 'Build a smarter March Madness bracket with ATS-driven picks, championship odds, and deep-run predictions for NCAA Tournament 2026.',
    url: 'https://maximussports.ai/best-bracket-picks',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Maximus Sports',
      url: 'https://maximussports.ai',
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://maximussports.ai' },
        { '@type': 'ListItem', position: 2, name: 'Best Bracket Picks', item: 'https://maximussports.ai/best-bracket-picks' },
      ],
    },
  };

  const body = `
    <div class="card">
      <h2>The ATS Approach to Bracket Picking</h2>
      <p>Most bracket pickers focus on seeds. Maximus focuses on <strong>against-the-spread performance</strong> — the single most consistent predictor of tournament survival past the first two rounds.</p>
      <p>Teams that cover the spread consistently late in the season are telling you something: they execute under pressure, manage margins, and play to their ceiling when it matters.</p>
    </div>

    <div class="card">
      <h2>Championship Odds as a Bracket Signal</h2>
      <p>Championship futures markets aggregate information from dozens of sharp books. A team whose championship odds have <strong>shortened significantly in the past week</strong> is often picking up steam that won't be reflected in bracket seedings.</p>
      <p>Maximus tracks championship odds daily and flags meaningful movements — the kind that separate a good bracket from a great one.</p>
      <p><a href="/insights">View current championship odds →</a></p>
    </div>

    <div class="card">
      <h2>Avoid Bracket Busts</h2>
      <p>A Bracket Bust is a highly-seeded team that the market is already fading. Signs include:</p>
      <ul>
        <li>Negative ATS record over the last 30 games despite a strong win-loss record</li>
        <li>Championship odds that have lengthened while their seed stayed the same</li>
        <li>Consistent failure to cover as a favorite (over-reliance on talent gap)</li>
        <li>Upcoming matchup with a Long Shot team showing Upset Score 2+</li>
      </ul>
      <p>Avoiding busts in the Sweet 16 and Elite 8 rounds is often more valuable than picking the champion correctly.</p>
    </div>

    <div class="card">
      <h2>Build Your Bracket with Maximus</h2>
      <p>Pin your key teams, track their ATS records, and monitor line movement as Selection Sunday approaches. The Maximus dashboard gives you real-time intel on every major program so you can fill out your bracket with confidence — not guesswork.</p>
      <p><a href="/teams">Browse all teams →</a> &nbsp;·&nbsp; <a href="/insights">See ATS leaders →</a></p>
    </div>`;

  const html = buildLandingPage({
    title: 'Best Bracket Picks for March Madness 2026',
    description: 'Build a smarter NCAA Tournament bracket using ATS trends, championship odds, and Bracket Bust alerts. Data-driven picks for March Madness 2026.',
    canonicalPath: '/best-bracket-picks',
    h1: 'Best Bracket Picks — ATS-Driven for 2026',
    lead: "Stop guessing. The best bracket picks come from the same signals that sharp bettors use: late-season ATS momentum, championship odds movement, and matchup tier analysis.",
    bullets: [
      'ATS leaders by last 7, last 30, and full season',
      'Championship odds with daily movement tracking',
      'Bracket Bust alerts — teams to avoid despite their seeding',
      'Deep-run indicators: margin of victory trends, road ATS performance',
      'Upset-pick integration — the right dogs to take past round one',
      'Team intel pages for every major program',
    ],
    body,
    ctaLabel: 'Build Your Bracket with Live Data →',
    ctaPath: '/insights',
    jsonLd,
    trackEvent: 'seo_landing_view_best_bracket_picks',
  });

  return res.status(200).send(html);
}
