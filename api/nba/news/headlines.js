/**
 * GET /api/nba/news/headlines — NBA headlines via Google News RSS.
 * Season-aware: playoff searches and the playoff boost only apply from the
 * play-in to the Finals. The rest of the year it looks for game results,
 * injuries, trades and standings.
 */

import { createCache } from '../../_cache.js';
import { nbaSeasonPhase } from '../../../src/sports/nba/season.js';

const cache = createCache(5 * 60 * 1000); // 5min (was 15min) — fresher during playoffs
const CACHE_KEY = 'nba:headlines:v3';
const MAX_ITEMS = 30;

const PLAYOFF_QUERIES = [
  { q: 'NBA playoffs', window: '3d' },
  { q: 'NBA play-in', window: '2d' },
  { q: 'NBA series preview', window: '2d' },
  { q: 'NBA playoff injury report', window: '2d' },
  { q: 'NBA title odds', window: '4d' },
];
const SEASON_QUERIES = [
  { q: 'NBA', window: '1d' },
  { q: 'NBA injury report', window: '2d' },
  { q: 'NBA trade', window: '3d' },
  { q: 'NBA standings', window: '3d' },
  { q: 'NBA title odds', window: '4d' },
];
// Stories about a series or a round are last spring's when read in November.
const POSTSEASON_ONLY = /\b(conference.?finals?|nba.?finals|game.?[67]|first.?round|second.?round|closeout|elimination|play.?in|series)\b/i;
export function queriesFor(phase) {
  return phase === 'playoffs' ? PLAYOFF_QUERIES : SEASON_QUERIES;
}

// What matters between opening night and the play-in.
const SEASON_KEYWORDS = /\b(injur(y|ies|ed)|questionable|probable|out.?for|return(s|ing)?|trade[sd]?|signs?|signed|waive[sd]?|extension|standings|streak|career.?high|triple.?double|game.?winner|buzzer|overtime|suspend(ed|sion)|title.?odds|mvp)\b/i;

// Strong boost keywords
const PLAYOFF_KEYWORDS = /\b(play.?in|playoffs?|bracket|series|finals?|conference.?finals?|semifinals?|elimination|closeout|game.?7|game.?6|clinched?|matchup.?preview|game.?preview|series.?preview|postseason|title.?odds|first.?round|second.?round|injury.?update|probable|questionable|out.?for)\b/i;

// Stale patterns
const STALE_PATTERNS = /\b(regular.?season.?recap|season.?preview.?20\d\d|year.?in.?review|top.?\d+.?of.?20\d\d|classic|throwback|all.?time|20\d\d.?season)\b/i;

// Source quality tiers
const PREMIUM_SOURCES = /espn|nba\.com|the.?athletic|bleacher.?report|ap.?news|associated.?press/i;
const GOOD_SOURCES = /fox.?sports|cbs.?sports|yahoo|sports.?illustrated|nbc.?sports|usa.?today|action.?network/i;

// Low-signal patterns
const LOW_SIGNAL = /\b(watch|stream.?free|subscribe|podcast|odds.?to.?win|best.?bets.?today|promo.?code|parlay.?pick)\b/i;

export function scoreItem(item, phase = nbaSeasonPhase()) {
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

  // During the playoffs, playoff stories lead. The rest of the year they
  // are usually speculation or last spring's recap, so they get no boost.
  if (phase === 'playoffs') { if (PLAYOFF_KEYWORDS.test(t)) s += 8; }
  else {
    if (SEASON_KEYWORDS.test(t)) s += 4;
    if (POSTSEASON_ONLY.test(t)) s -= 6;
  }

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
  if (/\btrade[sd]?\b|\bsigns?\b|\bsigned\b|\bwaive[sd]?\b|\bextension\b/.test(t)) return 'transactions';
  if (/\bseries.?preview|matchup.?preview|game.?preview\b/.test(t)) return 'preview';
  if (/\btitle.?odds|championship.?odds|futures|mvp.?odds\b/.test(t)) return 'odds';
  if (/\bplayoffs?|bracket|postseason|first.?round|finals?|elimination\b/.test(t)) return 'playoffs';
  return null;
}

/** The scored, de-duplicated headline list, memoised for five minutes. Throws on a failed fetch. */
export async function loadNbaHeadlines() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const phase = nbaSeasonPhase();
  const results = await Promise.allSettled(queriesFor(phase).map(q => fetchGoogleNewsRSS(q.q, q.window)));
  let all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  all = dedup(all);
  all.forEach((it) => { it._score = scoreItem(it, phase); });
  // Keep only items that scored positive: fresh, relevant and about the NBA.
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
  if (headlines.length > 0) cache.set(CACHE_KEY, payload);
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    return res.status(200).json(await loadNbaHeadlines());
  } catch (err) {
    return res.status(200).json({ headlines: [], error: err?.message });
  }
}
