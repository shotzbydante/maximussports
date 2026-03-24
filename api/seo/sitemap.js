/**
 * GET /sitemap.xml — Dynamic sitemap.
 * Rewritten from vercel.json: /sitemap.xml → /api/seo/sitemap
 *
 * Routes use canonical /ncaam/... prefix for sport-specific pages.
 * Global pages (settings, privacy, terms) at root.
 */

import { TEAMS } from '../../src/data/teams.js';

const ORIGIN = 'https://maximussports.ai';

function urlEntry(path, opts = {}) {
  const { changefreq = 'daily', priority = '0.7', lastmod = null } = opts;
  return `  <url>
    <loc>${ORIGIN}${path}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function buildMatchupSlug(slugA, slugB) {
  const sorted = [slugA, slugB].sort();
  return `${sorted[0]}-vs-${sorted[1]}-prediction`;
}

const POWER_CONFERENCES = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'WCC'];
const TOP_TIERS = ['Lock', 'Should be in'];

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');

  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = [
    // Root → canonical NCAAM home
    urlEntry('/ncaam', { changefreq: 'hourly', priority: '1.0', lastmod: today }),
    urlEntry('/ncaam/insights', { changefreq: 'hourly', priority: '0.95', lastmod: today }),
    urlEntry('/ncaam/teams', { changefreq: 'daily', priority: '0.9', lastmod: today }),
    urlEntry('/ncaam/news', { changefreq: 'hourly', priority: '0.85', lastmod: today }),
    urlEntry('/ncaam/games', { changefreq: 'hourly', priority: '0.8', lastmod: today }),
    urlEntry('/ncaam/bracketology', { changefreq: 'daily', priority: '0.9', lastmod: today }),
    urlEntry('/ncaam/college-basketball-picks-today', { changefreq: 'hourly', priority: '0.95', lastmod: today }),
    urlEntry('/ncaam/march-madness-betting-intelligence', { changefreq: 'daily', priority: '0.92', lastmod: today }),
  ].join('\n');

  const teamUrls = TEAMS.map((t) => [
    urlEntry(`/ncaam/teams/${t.slug}`, { changefreq: 'daily', priority: '0.75', lastmod: today }),
  ].join('\n')).join('\n');

  const topTeams = TEAMS.filter(
    (t) => POWER_CONFERENCES.includes(t.conference) && TOP_TIERS.includes(t.oddsTier)
  );
  const matchupSeen = new Set();
  const matchupUrls = [];
  for (let i = 0; i < topTeams.length; i++) {
    for (let j = i + 1; j < topTeams.length; j++) {
      if (topTeams[i].conference !== topTeams[j].conference) continue;
      const mSlug = buildMatchupSlug(topTeams[i].slug, topTeams[j].slug);
      if (matchupSeen.has(mSlug)) continue;
      matchupSeen.add(mSlug);
      matchupUrls.push(
        urlEntry(`/ncaam/games/${mSlug}`, { changefreq: 'daily', priority: '0.68', lastmod: today })
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${teamUrls}
${matchupUrls.join('\n')}
</urlset>`;

  return res.status(200).send(xml);
}
