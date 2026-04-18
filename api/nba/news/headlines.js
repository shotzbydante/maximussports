/**
 * GET /api/nba/news/headlines — NBA headlines via Google News RSS.
 * Playoff-aware: heavily prefers last 24-72h postseason content.
 */

import { createCache } from '../../_cache.js';

const cache = createCache(5 * 60 * 1000); // 5min (was 15min) — fresher during playoffs
const CACHE_KEY = 'nba:headlines:v2';
const MAX_ITEMS = 30;

// Queries narrowed to playoff-relevant terms with short time windows
const NBA_QUERIES = [
  { q: 'NBA playoffs', window: '3d' },
  { q: 'NBA play-in', window: '2d' },
  { q: 'NBA series preview', window: '2d' },
  { q: 'NBA playoff injury report', window: '2d' },
  { q: 'NBA title odds', window: '4d' },
];

// Strong boost keywords
const PLAYOFF_KEYWORDS = /\b(play.?in|playoffs?|bracket|series|finals?|conference.?finals?|semifinals?|elimination|closeout|game.?7|game.?6|clinched?|matchup.?preview|game.?preview|series.?preview|postseason|title.?odds|first.?round|second.?round|injury.?update|probable|questionable|out.?for)\b/i;

// Stale patterns
const STALE_PATTERNS = /\b(regular.?season.?recap|season.?preview.?20\d\d|year.?in.?review|top.?\d+.?of.?20\d\d|classic|throwback|all.?time|20\d\d.?season)\b/i;

// Source quality tiers
const PREMIUM_SOURCES = /espn|nba\.com|the.?athletic|bleacher.?report|ap.?news|associated.?press/i;
const GOOD_SOURCES = /fox.?sports|cbs.?sports|yahoo|sports.?illustrated|nbc.?sports|usa.?today|action.?network/i;

// Low-signal patterns
const LOW_SIGNAL = /\b(watch|stream.?free|subscribe|podcast|odds.?to.?win|best.?bets.?today|promo.?code|parlay.?pick)\b/i;

function scoreItem(item) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const src = (item.source || '').toLowerCase();

  // Recency — heavy weight for playoff freshness
  if (item.pubDate) {
    const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3_600_000;
    if      (ageH <= 6)   s += 12;   // last 6h — blazing hot
    else if (ageH <= 24)  s += 8;    // today
    else if (ageH <= 48)  s += 5;    // yesterday
    else if (ageH <= 72)  s += 2;    // 3 days
    else if (ageH <= 168) s += 0;    // within a week
    else                  s -= 8;    // older — heavy penalty
  }

  // Playoff keyword boost
  if (PLAYOFF_KEYWORDS.test(t)) s += 8;

  // NBA mention required for positive base score
  if (/\bnba\b|\bbasketball\b/i.test(t)) s += 2;

  // Stale deboost
  if (STALE_PATTERNS.test(t)) s -= 8;
  if (LOW_SIGNAL.test(t)) s -= 4;

  // Source quality
  if (PREMIUM_SOURCES.test(src)) s += 3;
  else if (GOOD_SOURCES.test(src)) s += 2;

  // Non-basketball negatives
  if (/\b(mlb|nfl|nhl|soccer|baseball|football|hockey)\b/i.test(t)) s -= 6;

  return s;
}

async function fetchGoogleNewsRSS(query, window = '3d') {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${query}" when:${window}`)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(rssUrl, { headers: { 'User-Agent': 'MaximusSports/1.0' } });
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
    items.push({ title: title.trim(), link: link.trim(), pubDate, source: source.trim() });
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
    const d = new Date(pubDate);
    const now = new Date();
    const diffM = Math.floor((now - d) / (1000 * 60));
    if (diffM < 60) return `${Math.max(diffM, 1)}m ago`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  } catch { return ''; }
}

/** Classify a headline into a topic chip label. */
function classifyTopic(title) {
  const t = (title || '').toLowerCase();
  if (/\bplay.?in\b/.test(t)) return 'play-in';
  if (/\binjury|questionable|probable|out.?for|sidelined|minutes.?restriction\b/.test(t)) return 'injury';
  if (/\bseries.?preview|matchup.?preview|game.?preview\b/.test(t)) return 'preview';
  if (/\btitle.?odds|championship.?odds|futures|mvp.?odds\b/.test(t)) return 'odds';
  if (/\bplayoffs?|bracket|postseason|first.?round|finals?|elimination\b/.test(t)) return 'playoffs';
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600'); // 5min (was 10min)
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  try {
    const results = await Promise.allSettled(NBA_QUERIES.map(q => fetchGoogleNewsRSS(q.q, q.window)));
    let all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    all = dedup(all);
    all.forEach((it) => { it._score = scoreItem(it); });
    // Filter to only items that actually scored positive (playoff or fresh)
    all = all.filter(it => it._score > 0);
    all.sort((a, b) => b._score - a._score);

    const headlines = all.slice(0, MAX_ITEMS).map((it, i) => ({
      id: `nba-news-${i}`,
      title: it.title,
      link: it.link,
      source: it.source || 'News',
      time: formatTime(it.pubDate),
      topic: classifyTopic(it.title),
    }));

    const payload = { headlines, fetchedAt: new Date().toISOString() };
    cache.set(CACHE_KEY, payload);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ headlines: [], error: err?.message });
  }
}
