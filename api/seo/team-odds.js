/**
 * GET /teams/:slug/odds — Dynamic team odds SEO page.
 * Rewritten from vercel.json: /teams/:slug/odds → /api/seo/team-odds?slug=:slug
 *
 * No external API calls. Renders indexable HTML with OG tags using local team data.
 * Redirects users to the SPA team page via JS + meta-refresh.
 */

import { getTeamBySlug } from '../../src/data/teams.js';
import { buildLandingPage } from './_html.js';

function escH(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tierToDescription(tier) {
  const map = {
    'Lock':         'a tournament lock — consistently beating the spread and one of the safest picks for your bracket.',
    'Should be in': 'a strong at-large candidate with solid ATS history and upside in the first two rounds.',
    'Work to do':   'a bubble team that must prove itself down the stretch — high variance and potential upset value.',
    'Long shot':    'an underdog with upset potential — track their ATS momentum and line movement closely.',
  };
  return map[tier] || 'a notable program in the college basketball landscape.';
}

function notFoundHtml(slug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Team Not Found | Maximus Sports</title>
  <meta http-equiv="refresh" content="2; url=/teams" />
  <meta name="robots" content="noindex" />
  <style>body{background:#0a1628;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}</style>
</head>
<body>
  <div style="text-align:center">
    <p>Team &ldquo;${escH(slug)}&rdquo; not found. Redirecting to <a href="/teams" style="color:#60a5fa">all teams</a>…</p>
  </div>
</body>
</html>`;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  const url = new URL(req.url, `https://${req.headers.host || 'maximussports.ai'}`);
  const slug = url.searchParams.get('slug');

  if (!slug || !/^[a-z0-9-]{3,60}$/.test(slug)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(notFoundHtml(slug || ''));
  }

  const team = getTeamBySlug(slug);
  if (!team) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(notFoundHtml(slug));
  }

  const { name, conference, oddsTier } = team;
  const teamPath  = `/teams/${slug}`;
  const oddsPath  = `/teams/${slug}/odds`;
  const tierDesc  = tierToDescription(oddsTier);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${name} Odds & ATS — March Madness 2026 | Maximus Sports`,
    description: `${name} betting odds, ATS record, line movement, and March Madness outlook for 2026. ${name} is currently classified as ${oddsTier}.`,
    url: `https://maximussports.ai${oddsPath}`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Maximus Sports',
      url: 'https://maximussports.ai',
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://maximussports.ai' },
        { '@type': 'ListItem', position: 2, name: 'Teams', item: 'https://maximussports.ai/teams' },
        { '@type': 'ListItem', position: 3, name: name, item: `https://maximussports.ai${teamPath}` },
        { '@type': 'ListItem', position: 4, name: `${name} Odds`, item: `https://maximussports.ai${oddsPath}` },
      ],
    },
  };

  const body = `
    <div class="card">
      <h2>${escH(name)} Odds Overview</h2>
      <p>${escH(name)} is ${escH(tierDesc)}</p>
      <p>Conference: <strong>${escH(conference)}</strong> &nbsp;·&nbsp; Maximus Tier: <strong>${escH(oddsTier)}</strong></p>
      <p>For live odds, ATS record, and line movement data, <a href="${escH(teamPath)}">open the ${escH(name)} team page</a> in the Maximus Sports app.</p>
    </div>

    <div class="card">
      <h2>What to Look for in ${escH(name)} Odds</h2>
      <ul>
        <li><strong>Spread</strong> — How many points are they favored or underdogged by in upcoming games?</li>
        <li><strong>ATS Record</strong> — Are they covering the spread consistently? Maximus tracks last 7, last 30, and full season.</li>
        <li><strong>Line Movement</strong> — Is the line moving toward or away from ${escH(name)}? Sharp action shows up here first.</li>
        <li><strong>Championship Futures</strong> — Where does the market place their odds to win it all?</li>
      </ul>
    </div>

    <div class="card">
      <h2>About Maximus Sports</h2>
      <p>Maximus Sports tracks ATS records, consensus odds, line movement, and market intelligence for over 70 major NCAAM programs. Built for the 2026 March Madness tournament.</p>
      <p>
        <a href="/insights">Odds Insights</a> &nbsp;·&nbsp;
        <a href="/march-madness-odds">March Madness Odds</a> &nbsp;·&nbsp;
        <a href="/upset-picks">Upset Picks</a>
      </p>
    </div>`;

  const html = buildLandingPage({
    title: `${name} Odds & ATS — March Madness 2026`,
    description: `${name} betting odds, ATS record, and March Madness outlook for 2026. Track spreads, line movement, and tournament intel for ${name} (${conference}).`,
    canonicalPath: oddsPath,
    h1: `${name} Odds & ATS Intelligence`,
    lead: `${name} (${conference}) is currently classified as a Maximus ${oddsTier} — ${tierDesc} Track their spreads, ATS record, and line movement in real time.`,
    bullets: [
      `Live spread and moneyline for ${name}'s next game`,
      `ATS record: last 7, last 30, and full season`,
      `Line movement history and sharp money signals`,
      `Maximus Tier: ${oddsTier} — ${conference}`,
      'Championship futures odds with daily updates',
      'AI-generated team summary and outlook',
    ],
    body,
    ctaLabel: `Open ${name} Team Page →`,
    ctaPath: teamPath,
    jsonLd,
    trackEvent: 'seo_landing_view_team_odds',
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
