/**
 * GET /api/nfl/news/headlines — NFL headlines via Google News RSS.
 * Optional ?team=<slug> narrows to one team.
 *
 * Scoring favours the things that move NFL lines: injuries and practice
 * reports, quarterback changes, trades, and playoff-picture news.
 */

import { createCache } from '../../_cache.js';
import { getNflTeamBySlug } from '../../../src/sports/nfl/teams.js';

const cache = createCache(5 * 60 * 1000);
const MAX_ITEMS = 30;

const LEAGUE_QUERIES = [
  { q: 'NFL', window: '2d' },
  { q: 'NFL injury report', window: '2d' },
  { q: 'NFL playoff picture', window: '4d' },
  { q: 'NFL power rankings', window: '5d' },
  { q: 'NFL trade', window: '4d' },
  { q: 'Super Bowl odds', window: '5d' },
];

const HOT_KEYWORDS = /\b(injur|questionable|doubtful|ruled out|out for|inactive|ir\b|practice report|concussion|quarterback|qb|starter|benched|trade|signed|released|playoff|wild.?card|division|clinch|seed|super bowl|odds|spread|line move)/i;
const STALE_PATTERNS = /\b(mock draft|all.?time|throwback|on this day|ranking every|history of|fantasy football rankings)\b/i;
const LOW_SIGNAL = /\b(how to watch|live stream|stream free|promo code|bonus code|sportsbook promo|bet365 bonus|parlay picks|free picks)\b/i;
const PREMIUM_SOURCES = /espn|nfl\.com|the.?athletic|associated.?press|ap.?news|pro.?football.?talk|nbc.?sports/i;
const GOOD_SOURCES = /cbs.?sports|fox.?sports|yahoo|sports.?illustrated|usa.?today|the.?ringer|bleacher|action.?network|pro.?football.?focus|pff/i;
const OTHER_SPORTS = /\b(nba|mlb|nhl|mls|ncaa basketball|college basketball|premier league|baseball|hockey|soccer)\b/i;

function scoreItem(item) {
  let s = 0;
  const t = item.title || '';
  const src = item.source || '';

  if (item.pubDate) {
    const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3_600_000;
    if (ageH <= 6) s += 12;
    else if (ageH <= 24) s += 8;
    else if (ageH <= 48) s += 5;
    else if (ageH <= 96) s += 2;
    else if (ageH > 168) s -= 8;
  }

  if (HOT_KEYWORDS.test(t)) s += 6;
  if (/\bnfl\b|\bfootball\b/i.test(t)) s += 2;
  if (STALE_PATTERNS.test(t)) s -= 8;
  if (LOW_SIGNAL.test(t)) s -= 10;
  if (PREMIUM_SOURCES.test(src)) s += 3;
  else if (GOOD_SOURCES.test(src)) s += 2;
  if (OTHER_SPORTS.test(t) && !/\bnfl\b/i.test(t)) s -= 6;
  if (/\bcollege football\b|\bcfp\b/i.test(t)) s -= 4;

  return s;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

async function fetchGoogleNewsRSS(query, window = '3d') {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${window}`)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(rssUrl, {
    headers: { 'User-Agent': 'MaximusSports/1.0' },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) return [];
  const text = await r.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
    if (!title) continue;
    const cleanSource = decodeEntities(source.trim());
    // Google appends " - Source" to every title; the source has its own field.
    let cleanTitle = decodeEntities(title.trim());
    if (cleanSource && cleanTitle.endsWith(` - ${cleanSource}`)) {
      cleanTitle = cleanTitle.slice(0, -(` - ${cleanSource}`).length);
    }
    items.push({ title: cleanTitle, link: link.trim(), pubDate, source: cleanSource });
  }
  return items;
}

function dedup(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatTime(pubDate) {
  if (!pubDate) return '';
  try {
    const diffM = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60000);
    if (diffM < 60) return `${Math.max(diffM, 1)}m ago`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  } catch { return ''; }
}

function classifyTopic(title) {
  const t = (title || '').toLowerCase();
  if (/injur|questionable|doubtful|ruled out|inactive|concussion|practice report|\bir\b/.test(t)) return 'injury';
  if (/trade|signed|released|waived|contract|extension/.test(t)) return 'transactions';
  if (/odds|spread|betting|line move|futures|favorite|underdog/.test(t)) return 'odds';
  if (/playoff|wild.?card|clinch|seed|super bowl|division title/.test(t)) return 'playoffs';
  if (/power rankings|preview|prediction|picks/.test(t)) return 'preview';
  return null;
}

/**
 * Load scored, de-duplicated NFL headlines. Exported so the briefing can
 * read the same feed in process instead of calling this route over HTTP.
 *
 * @param {object} [opts]
 * @param {object} [opts.team] — NFL_TEAMS entry to narrow to one team
 */
export async function loadNflHeadlines({ team = null } = {}) {
  const cacheKey = team ? `nfl:headlines:team:${team.slug}` : 'nfl:headlines:v1';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const queries = team
    ? [
        { q: `"${team.name}"`, window: '4d' },
        { q: `"${team.nickname}" NFL injury`, window: '4d' },
      ]
    : LEAGUE_QUERIES;

  const results = await Promise.allSettled(queries.map((q) => fetchGoogleNewsRSS(q.q, q.window)));
  let all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  all = dedup(all);
  all.forEach((it) => { it._score = scoreItem(it); });
  all = all.filter((it) => it._score > 0);
  all.sort((a, b) => b._score - a._score);

  const prefix = team ? `nfl-${team.slug}-news` : 'nfl-news';
  const headlines = all.slice(0, MAX_ITEMS).map((it, i) => ({
    id: `${prefix}-${i}`,
    title: it.title,
    link: it.link,
    url: it.link,
    source: it.source || 'News',
    time: formatTime(it.pubDate),
    publishedAt: it.pubDate || null,
    topic: classifyTopic(it.title),
  }));

  const payload = { headlines, team: team?.slug || null, fetchedAt: new Date().toISOString() };
  if (headlines.length > 0) cache.set(cacheKey, payload);
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const teamSlug = (url.searchParams.get('team') || '').toLowerCase();
  const team = teamSlug ? getNflTeamBySlug(teamSlug) : null;
  if (teamSlug && !team) return res.status(404).json({ headlines: [], error: `Unknown team slug: ${teamSlug}` });

  try {
    return res.status(200).json(await loadNflHeadlines({ team }));
  } catch (err) {
    return res.status(200).json({ headlines: [], error: err?.message });
  }
}
