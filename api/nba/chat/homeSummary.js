/**
 * GET /api/nba/chat/homeSummary?force=0|1
 * AI-generated NBA home briefing using OpenAI + Odds API + Google News.
 * Three-tier KV cache: fresh (15 min) -> lastKnown (72 h) -> generate.
 */

import { getJson, setJson, tryAcquireLock } from '../../_globalCache.js';
import { getQueryParam } from '../../_requestUrl.js';
import { createCache } from '../../_cache.js';
import { NBA_TEAMS } from '../../../src/sports/nba/teams.js';

const FRESH_KEY      = 'chat:nba:home:summary:v1';
const LASTKNOWN_KEY  = 'chat:nba:home:lastKnown:v1';
const GEN_LOCK_KEY   = 'chat:nba:home:genLock';
const FORCE_LOCK_KEY = 'chat:nba:home:forceLock';

const FRESH_TTL_SEC      = 15 * 60;
const LASTKNOWN_TTL_SEC  = 72 * 3600;
const GEN_LOCK_TTL_SEC   = 90;
const FORCE_LOCK_TTL_SEC = 45;

const OPENAI_MODEL    = 'gpt-4o-mini';
const MAX_TOKENS      = 1200;
const TEMPERATURE     = 0.5;
const OPENAI_TIMEOUT  = 18000;
const NEWS_FETCH_TIMEOUT_MS = 5000;

const isDev = process.env.NODE_ENV !== 'production';

const NBA_QUERIES = [
  'NBA basketball',
  'NBA trade rumors',
  'NBA injuries roster moves',
  'NBA standings playoffs',
];

const newsCache = createCache(15 * 60 * 1000);

function getPstDate() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function impliedPct(american) {
  if (american == null) return null;
  const p = american < 0 ? (-american) / ((-american) + 100) : 100 / (american + 100);
  return Math.round(p * 1000) / 10;
}

async function fetchGoogleNewsRSS(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${query}" when:3d`)}&hl=en-US&gl=US&ceid=US:en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEWS_FETCH_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(rssUrl, { headers: { 'User-Agent': 'MaximusSports/1.0' }, signal: controller.signal });
  } finally { clearTimeout(timer); }
  if (!r.ok) return [];
  const text = await r.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
    if (title) items.push({ title: title.trim(), source: source.trim() });
  }
  return items;
}

async function fetchNbaHeadlines() {
  const cached = newsCache.get('nba:headlines:brief');
  if (cached) return cached;
  try {
    const results = await Promise.allSettled(NBA_QUERIES.map(fetchGoogleNewsRSS));
    const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const seen = new Set();
    const deduped = all.filter((it) => {
      const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const headlines = deduped.slice(0, 15).map((it) => ({ title: it.title, source: it.source }));
    newsCache.set('nba:headlines:brief', headlines);
    return headlines;
  } catch { return []; }
}

async function fetchNbaOdds() {
  const kvKey = 'odds:championship:nba:v1';
  const cached = await getJson(kvKey).catch(() => null);
  return cached?.odds ?? {};
}

async function buildNbaSummaryData() {
  const [headlines, champOdds] = await Promise.allSettled([
    fetchNbaHeadlines(),
    fetchNbaOdds(),
  ]);
  return {
    headlines: headlines.status === 'fulfilled' ? headlines.value : [],
    championshipOdds: champOdds.status === 'fulfilled' ? champOdds.value : {},
  };
}

function getNbaSeasonPhase() {
  const d = new Date().toISOString().slice(0, 10);
  const n = Number(d.replace(/-/g, ''));
  if (n >= 20251022 && n < 20260415) return 'regular_season';
  if (n >= 20260415 && n < 20260625) return 'playoffs';
  if (n >= 20260625 && n < 20261022) return 'offseason';
  return 'preseason';
}

const TEAM_EMOJIS = {
  bos: '\u2618\uFE0F', lal: '\uD83D\uDFE1', gsw: '\uD83D\uDFE1', nyk: '\uD83D\uDDFD',
  mil: '\uD83E\uDD8C', phi: '\uD83D\uDD14', den: '\u26CF\uFE0F', phx: '\u2600\uFE0F',
  mia: '\uD83D\uDD25', dal: '\uD83D\uDC0E', cle: '\u2694\uFE0F', mem: '\uD83D\uDC3B',
  sac: '\uD83D\uDC51', okc: '\u26A1', min: '\uD83D\uDC3A', ind: '\uD83C\uDFCE\uFE0F',
  atl: '\uD83E\uDD85', chi: '\uD83D\uDC02', tor: '\uD83E\uDD96', bkn: '\uD83C\uDF09',
  orl: '\u2728', cha: '\uD83D\uDC1D', was: '\uD83C\uDDFA\uD83C\uDDF8', det: '\uD83D\uDD27',
  hou: '\uD83D\uDE80', nop: '\u269C\uFE0F', sas: '\uD83E\uDDB6', por: '\uD83C\uDF32',
  uta: '\u26F7\uFE0F', lac: '\u2693', gsw_2: '\uD83C\uDF09',
};

function buildPayload(data) {
  const { headlines, championshipOdds } = data;
  const slugToName = Object.fromEntries(NBA_TEAMS.map((t) => [t.slug, t.name]));

  const champEntries = Object.entries(championshipOdds)
    .filter(([, v]) => v?.bestChanceAmerican != null)
    .map(([slug, v]) => {
      const o = v.bestChanceAmerican;
      return {
        team: slugToName[slug] || slug, slug,
        odds: typeof o === 'number' && o > 0 ? '+' + o : o,
        impliedPct: impliedPct(o),
      };
    })
    .sort((a, b) => (b.impliedPct ?? 0) - (a.impliedPct ?? 0));

  return {
    dateNow: getPstDate(),
    timezone: 'America/Los_Angeles',
    champOdds: champEntries.slice(0, 10),
    champSleepers: champEntries.slice(10, 16),
    headlines: headlines.slice(0, 12).map((h) => ({ title: h.title || '', source: h.source || 'News' })),
    seasonPhase: getNbaSeasonPhase(),
  };
}

function buildPrompt(data) {
  const payload = buildPayload(data);
  const slugToName = Object.fromEntries(NBA_TEAMS.map((t) => [t.slug, t.name]));
  const emojiMap = Object.entries(TEAM_EMOJIS)
    .filter(([slug]) => slugToName[slug])
    .map(([slug, emoji]) => `${slugToName[slug]}: ${emoji}`)
    .join(', ');

  const systemPrompt = `You are a sharp, energetic NBA basketball intelligence host for Maximus Sports — think Inside the NBA meets sharp bettor insight meets premium editorial sports journalism.

Write a home-page daily briefing using ONLY the JSON data provided. DO NOT invent any scores, teams, odds, players, or facts not present in the data.

TEAM EMOJIS (use the matching emoji when mentioning a team by name):
${emojiMap}

FORMAT — exactly 5 substantive paragraphs (no headers, no bullet lists, no numbered sections):

P1 AROUND THE LEAGUE: Open with 3-4 top headlines from headlines[] with team emojis. Set the scene — where are we in the NBA season? Reference specific stories.

P2 CHAMPIONSHIP ODDS PULSE: Reference 4-5 teams from champOdds whose stock is moving with exact odds (positive odds MUST include "+") and team emojis. Frame as market reads.

P3 CONFERENCE WATCH: Discuss 2-3 tight conference or playoff races. Use champOdds context and team emojis.

P4 SLEEPERS & VALUE: Call out 1-2 teams from champSleepers overperforming, plus any major injury/roster news. Use team emojis.

P5 CLOSER: 2-3 remaining headlines. Surface buzzy storylines. End with a sharp, punchy closer.

STYLE RULES:
- Target 350-450 words total (hard limit: 500 words).
- Bold (**text**) team names or 1-2 key phrases per paragraph.
- Use the team emoji AFTER the bolded team name when first mentioned.
- Max 1 additional decorative emoji per paragraph from: 🔥 😬 👀 🚨 🏆 🏀
- Zero profanity. Clean humor only.
- Use basketball language: "court", "paint", "three-ball", "roster", "rotation", "backcourt", "frontcourt", "matchup", "playoffs", "conference", "seed".
- Do NOT use baseball terminology.
- Each paragraph should have narrative flow and editorial opinion.
- Write like a premium sports intelligence product.`;

  const userPrompt = `DATA:\n${JSON.stringify(payload, null, 2)}\n\nWrite the briefing now. Exactly 5 substantive paragraphs, no headers. Use team emojis from the mapping above.`;

  return { systemPrompt, userPrompt };
}

function fixPositiveOdds(text) {
  if (!text) return text;
  return text
    .replace(/\bat\s+(\d{3,4})(?=[\s.,;!?)\-\u2013\u2014]|$)/g, (match, num) => {
      const n = parseInt(num, 10);
      if (n >= 100 && n <= 9999) return `at +${num}`;
      return match;
    })
    .replace(/\((\d{3,4})\)/g, (match, num) => {
      const n = parseInt(num, 10);
      if (n >= 100 && n <= 9999) return `(+${num})`;
      return match;
    });
}

async function generateWithOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    if (isDev) console.warn('[nba/chat/homeSummary] OPENAI_API_KEY not set');
    return null;
  }
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT);
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
        }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error('[nba/chat/homeSummary] OpenAI error', r.status, body.slice(0, 200));
        return null;
      }
      const json = await r.json();
      const raw = json?.choices?.[0]?.message?.content?.trim() || null;
      return raw ? fixPositiveOdds(raw) : null;
    } catch (err) {
      clearTimeout(t);
      if (err?.name === 'AbortError' && attempt < maxAttempts) continue;
      console[err?.name === 'AbortError' ? 'warn' : 'error']('[nba/chat/homeSummary]', err?.message);
      return null;
    }
  }
  return null;
}

async function readCached() {
  const fresh = await getJson(FRESH_KEY).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) return { summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt };
  }
  const lastKnown = await getJson(LASTKNOWN_KEY).catch(() => null);
  if (lastKnown?.summary) return { summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt };
  return null;
}

async function generateAndCache() {
  const data = await buildNbaSummaryData();
  const { systemPrompt, userPrompt } = buildPrompt(data);
  const summary = await generateWithOpenAI(systemPrompt, userPrompt);
  if (summary) {
    const payload = { summary, generatedAt: new Date().toISOString() };
    await Promise.all([
      setJson(FRESH_KEY, payload, { exSeconds: FRESH_TTL_SEC }),
      setJson(LASTKNOWN_KEY, payload, { exSeconds: LASTKNOWN_TTL_SEC }),
    ]).catch((e) => console.warn('[nba/chat/homeSummary] KV write error', e?.message));
  }
  return summary;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const force = getQueryParam(req, 'force') === '1';

  if (force) {
    const gotForceLock = await tryAcquireLock(FORCE_LOCK_KEY, FORCE_LOCK_TTL_SEC);
    if (!gotForceLock) {
      const cached = await readCached();
      return res.status(200).json({ summary: cached?.summary ?? null, status: cached?.status ?? 'missing', generatedAt: cached?.generatedAt ?? null, rateLimited: true });
    }
    let summary = null;
    try { summary = await generateAndCache(); }
    catch (err) { console.error('[nba/chat/homeSummary] force error', err?.message); }
    if (summary) return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
    const fallback = await readCached();
    return res.status(200).json({ summary: fallback?.summary ?? null, status: fallback?.status ?? 'missing', generatedAt: fallback?.generatedAt ?? null });
  }

  const fresh = await getJson(FRESH_KEY).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) {
      return res.status(200).json({ summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt });
    }
  }

  const lastKnown = await getJson(LASTKNOWN_KEY).catch(() => null);
  if (lastKnown?.summary) {
    tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC).then((acquired) => {
      if (acquired) generateAndCache().catch(() => {});
    }).catch(() => {});
    return res.status(200).json({ summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt });
  }

  const gotLock = await tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC);
  if (gotLock) {
    try {
      const summary = await generateAndCache();
      if (summary) return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
    } catch (err) { console.error('[nba/chat/homeSummary] inline gen error', err?.message); }
  }

  return res.status(200).json({ summary: null, status: 'missing' });
}
