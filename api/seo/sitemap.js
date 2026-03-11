/**
 * GET /sitemap.xml — Dynamic sitemap.
 * Rewritten from vercel.json: /sitemap.xml → /api/seo/sitemap
 *
 * Includes: fixed landing pages, team pages, team odds pages.
 * Teams data is imported directly — no external API calls needed.
 */

import { TEAMS } from '../../src/data/teams.js';

const ORIGIN = 'https://maximussports.ai';

function url(path, opts = {}) {
  const { changefreq = 'daily', priority = '0.7', lastmod = null } = opts;
  return `  <url>
    <loc>${ORIGIN}${path}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');

  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = [
    url('/', { changefreq: 'hourly', priority: '1.0', lastmod: today }),
    url('/insights', { changefreq: 'hourly', priority: '0.95', lastmod: today }),
    url('/teams', { changefreq: 'daily', priority: '0.9', lastmod: today }),
    url('/news', { changefreq: 'hourly', priority: '0.85', lastmod: today }),
    url('/games', { changefreq: 'hourly', priority: '0.8', lastmod: today }),
    url('/alerts', { changefreq: 'hourly', priority: '0.75', lastmod: today }),
    url('/college-basketball-picks-today', { changefreq: 'hourly', priority: '0.95', lastmod: today }),
    url('/march-madness-betting-intelligence', { changefreq: 'daily', priority: '0.92', lastmod: today }),
    // SEO landing pages
    url('/march-madness-odds', { changefreq: 'daily', priority: '0.9', lastmod: today }),
    url('/upset-picks', { changefreq: 'daily', priority: '0.88', lastmod: today }),
    url('/best-bracket-picks', { changefreq: 'daily', priority: '0.88', lastmod: today }),
  ].join('\n');

  const teamUrls = TEAMS.map((t) => [
    url(`/teams/${t.slug}`, { changefreq: 'daily', priority: '0.75', lastmod: today }),
    url(`/teams/${t.slug}/odds`, { changefreq: 'daily', priority: '0.7', lastmod: today }),
  ].join('\n')).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${teamUrls}
</urlset>`;

  return res.status(200).send(xml);
}
