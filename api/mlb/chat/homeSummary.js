/**
 * GET /api/mlb/chat/homeSummary?force=0|1
 * AI-generated MLB home briefing using OpenAI + Odds API + Google News.
 * Three-tier KV cache: fresh (15 min) → lastKnown (72 h) → generate.
 * Mirrors the NCAAM homeSummary architecture.
 */

import { getJson, setJson, tryAcquireLock } from '../../_globalCache.js';
import { getQueryParam } from '../../_requestUrl.js';
import { createCache } from '../../_cache.js';

const FRESH_KEY      = 'chat:mlb:home:summary:v1';
const LASTKNOWN_KEY  = 'chat:mlb:home:lastKnown:v1';
const GEN_LOCK_KEY   = 'chat:mlb:home:genLock';
const FORCE_LOCK_KEY = 'chat:mlb:home:forceLock';

const FRESH_TTL_SEC      = 15 * 60;
const LASTKNOWN_TTL_SEC  = 72 * 3600;
const GEN_LOCK_TTL_SEC   = 90;
const FORCE_LOCK_TTL_SEC = 45;

const OPENAI_MODEL    = 'gpt-4o-mini';
const MAX_TOKENS      = 850;
const TEMPERATURE     = 0.5;
const OPENAI_TIMEOUT  = 28000;

const isDev = process.env.NODE_ENV !== 'production';

const MLB_QUERIES = [
  'MLB baseball',
  'Major League Baseball',
  'MLB trade rumors',
  'MLB standings',
  'MLB spring training',
];

const newsCache = createCache(15 * 60 * 1000);

const APPROVED_QUOTES = [
  'Juuuuuuuuust a bit outside.',
  'It might be, it could be, it IS!',
  'How about that!',
  "You can't stop what you can't catch.",
  'Holy cow!',
  'Touch \'em all!',
  'Going, going, gone!',
  "That ball is high! It is far! It is... gone!",
  'And the pitch...',
].join(' | ');

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
  const r = await fetch(rssUrl, { headers: { 'User-Agent': 'MaximusSports/1.0' } });
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

async function fetchMlbHeadlines() {
  const cached = newsCache.get('mlb:headlines:brief');
  if (cached) return cached;
  try {
    const results = await Promise.allSettled(MLB_QUERIES.map(fetchGoogleNewsRSS));
    const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const seen = new Set();
    const deduped = all.filter((it) => {
      const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const headlines = deduped.slice(0, 10).map((it) => ({ title: it.title, source: it.source }));
    newsCache.set('mlb:headlines:brief', headlines);
    return headlines;
  } catch { return []; }
}

async function fetchMlbOdds() {
  const kvKey = 'odds:championship:mlb:v1';
  const cached = await getJson(kvKey).catch(() => null);
  return cached?.odds ?? {};
}

async function buildMlbSummaryData() {
  const [headlines, champOdds] = await Promise.allSettled([
    fetchMlbHeadlines(),
    fetchMlbOdds(),
  ]);

  return {
    headlines: headlines.status === 'fulfilled' ? headlines.value : [],
    championshipOdds: champOdds.status === 'fulfilled' ? champOdds.value : {},
  };
}

function getMlbSeasonPhase() {
  const d = new Date().toISOString().slice(0, 10);
  const n = Number(d.replace(/-/g, ''));
  if (n < 20260327) return 'spring_training';
  if (n < 20260930) return 'regular_season';
  if (n < 20261101) return 'postseason';
  return 'offseason';
}

function buildPayload(data) {
  const { headlines, championshipOdds } = data;

  const champEntries = Object.entries(championshipOdds)
    .filter(([, v]) => v?.bestChanceAmerican != null)
    .map(([slug, v]) => {
      const o = v.bestChanceAmerican;
      return {
        team: slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
        odds: typeof o === 'number' && o > 0 ? '+' + o : o,
        impliedPct: impliedPct(o),
      };
    })
    .sort((a, b) => (b.impliedPct ?? 0) - (a.impliedPct ?? 0))
    .slice(0, 8);

  const headlinesTop = headlines.slice(0, 8).map((h) => ({
    title: h.title || '',
    source: h.source || 'News',
  }));

  return {
    dateNow: getPstDate(),
    timezone: 'America/Los_Angeles',
    champOdds: champEntries,
    headlines: headlinesTop,
    seasonPhase: getMlbSeasonPhase(),
  };
}

function buildPrompt(data) {
  const payload = buildPayload(data);
  const phase = payload.seasonPhase;

  let p1, p2, p3, p4, p5;

  if (phase === 'spring_training') {
    p1 = '¶1 SPRING TRAINING PULSE: Open with where we are in spring training. Reference 2–3 headlines from headlines[]. Set the scene for the upcoming MLB season with energy.';
    p2 = '¶2 WORLD SERIES FUTURES: Reference 3–4 top contenders from champOdds (use their exact odds format — positive odds MUST include "+"). Frame as pre-season market reads. Call out favorites and value picks.';
    p3 = '¶3 STORYLINES + SLEEPERS: Call out 1–2 interesting storylines from headlines[] — trade rumors, roster shakeups, breakout candidates. Mention 1–2 sleeper teams from champOdds with longer odds that could surprise.';
    p4 = '¶4 DIVISION WATCH: Reference 2–3 divisions with the tightest projected races. Which rivals should we watch? Frame with odds context from champOdds where relevant.';
    p5 = '¶5 NEWS + CLOSER: 1–2 remaining headlines from headlines[]. End with a punchy "what to watch" closer building anticipation for Opening Day and the season ahead.';
  } else if (phase === 'regular_season') {
    p1 = '¶1 AROUND THE LEAGUE: Open with 2–3 top headlines from headlines[]. Set the scene — where are we in the season? Call out interesting games, trades, or storylines.';
    p2 = '¶2 WORLD SERIES ODDS PULSE: Reference 3–4 teams from champOdds whose stock is moving. Positive odds MUST include "+". Frame as market reads — who\'s rising, who\'s fading.';
    p3 = '¶3 PENNANT RACE: Discuss 1–2 tight division or wild-card races. Use champOdds context. Mention any teams making a push or falling back.';
    p4 = '¶4 VALUE + SLEEPERS: Call out 1–2 teams with longer champOdds that are overperforming. Frame as betting value or Cinderella stories.';
    p5 = '¶5 NEWS + CLOSER: 1–2 remaining headlines from headlines[]. End with a sharp, punchy closer — what to watch tonight or this week.';
  } else if (phase === 'postseason') {
    p1 = '¶1 POSTSEASON: We\'re in October baseball. Recap any recent headlines from headlines[]. Frame the bracket/series matchups with urgency.';
    p2 = '¶2 WORLD SERIES ODDS: Reference 3–4 remaining contenders from champOdds with exact odds. Positive odds MUST include "+". Who does the market like?';
    p3 = '¶3 SERIES WATCH: Break down the key matchup storylines. Who has the edge? What\'s the narrative?';
    p4 = '¶4 VALUE + UPSET WATCH: Any underdogs with live odds? Frame with champOdds context.';
    p5 = '¶5 NEWS + CLOSER: 1–2 headlines. End with October baseball energy.';
  } else {
    p1 = '¶1 OFFSEASON INTEL: Open with 2–3 headlines from headlines[]. What\'s happening in the MLB offseason? Trades, free agency, signings.';
    p2 = '¶2 WORLD SERIES FUTURES: Reference 3–4 early championship favorites from champOdds. Positive odds MUST include "+".';
    p3 = '¶3 STORYLINES: Key offseason moves, managerial changes, or surprises from headlines[].';
    p4 = '¶4 EARLY VALUE: 1–2 sleeper teams from champOdds with longer odds worth watching.';
    p5 = '¶5 CLOSER: Build anticipation for the upcoming season.';
  }

  const systemPrompt = `You are a sharp, energetic MLB baseball host for Maximus Sports — think Baseball Tonight energy meets sharp bettor intel.

Write a home-page daily briefing using ONLY the JSON data provided. DO NOT invent any scores, teams, odds, players, or facts not present in the data.

FORMAT — exactly 5 short paragraphs (no headers, no bullet lists, no numbered sections):

${p1}

${p2}

${p3}

${p4}

${p5}

STYLE RULES:
- Target 200–300 words total (hard limit: 320 words).
- Bold (**text**) ONLY 1–2 team names OR one key phrase per paragraph — never full sentences.
- Max 1 emoji per paragraph from: 🔥 😬 👀 🚨 🏆 ⚾
- Zero profanity. Clean humor only.
- APPROVED QUOTES (use at most ONE total, only if it fits): ${APPROVED_QUOTES}
- NEVER use quotes not in the approved list.
- If a data section is empty, acknowledge it briefly and move on.
- Use baseball language: "pennant race", "arm", "bat", "bullpen", "lineup", "rotation", "slugger", "aces", "on the mound", "diamond".
- Do NOT use college basketball terminology (bracket, seed, March Madness, etc.).`;

  const userPrompt = `DATA:\n${JSON.stringify(payload, null, 2)}\n\nWrite the briefing now. Exactly 5 paragraphs, no headers.`;

  return { systemPrompt, userPrompt };
}

function fixPositiveOdds(text) {
  if (!text) return text;
  return text
    .replace(/\bat\s+(\d{3,4})(?=[\s.,;!?)\-–—]|$)/g, (match, num) => {
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
    if (isDev) console.warn('[mlb/chat/homeSummary] OPENAI_API_KEY not set');
    return null;
  }
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
      console.error('[mlb/chat/homeSummary] OpenAI error', r.status, body.slice(0, 200));
      return null;
    }
    const json = await r.json();
    const raw = json?.choices?.[0]?.message?.content?.trim() || null;
    return raw ? fixPositiveOdds(raw) : null;
  } catch (err) {
    clearTimeout(t);
    console[err?.name === 'AbortError' ? 'warn' : 'error']('[mlb/chat/homeSummary]', err?.message);
    return null;
  }
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
  const data = await buildMlbSummaryData();
  const { systemPrompt, userPrompt } = buildPrompt(data);
  const summary = await generateWithOpenAI(systemPrompt, userPrompt);
  if (summary) {
    const payload = { summary, generatedAt: new Date().toISOString() };
    await Promise.all([
      setJson(FRESH_KEY, payload, { exSeconds: FRESH_TTL_SEC }),
      setJson(LASTKNOWN_KEY, payload, { exSeconds: LASTKNOWN_TTL_SEC }),
    ]).catch((e) => console.warn('[mlb/chat/homeSummary] KV write error', e?.message));
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
      return res.status(200).json({
        summary: cached?.summary ?? null,
        status: cached?.status ?? 'missing',
        generatedAt: cached?.generatedAt ?? null,
        rateLimited: true,
      });
    }
    let summary = null;
    try { summary = await generateAndCache(); }
    catch (err) { console.error('[mlb/chat/homeSummary] force error', err?.message); }
    if (summary) return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
    const fallback = await readCached();
    return res.status(200).json({
      summary: fallback?.summary ?? null,
      status: fallback?.status ?? 'missing',
      generatedAt: fallback?.generatedAt ?? null,
    });
  }

  const fresh = await getJson(FRESH_KEY).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) {
      return res.status(200).json({ summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt });
    }
  }

  const lastKnown = await getJson(LASTKNOWN_KEY).catch(() => null);

  tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC).then((acquired) => {
    if (acquired) generateAndCache().catch(() => {});
  }).catch(() => {});

  if (lastKnown?.summary) {
    return res.status(200).json({ summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt });
  }

  return res.status(200).json({ summary: null, status: 'missing' });
}
