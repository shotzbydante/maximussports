/**
 * GET /api/chat/homeSummary?force=0|1
 * Three-tier KV cache for AI-generated home briefings.
 * fresh KV (15 min) → lastKnown KV (72 h) → generate inline (force=1) or kick bg.
 * Rate limiting: forceLock (45 s) prevents OpenAI stampedes on force=1.
 * genLock (90 s) prevents concurrent bg generation.
 * No self-HTTP calls — uses buildHomeSummaryData() directly.
 */

import { getJson, setJson, tryAcquireLock } from '../_globalCache.js';
import { getQueryParam } from '../_requestUrl.js';
import { buildHomeSummaryData } from '../_lib/homeData.js';

const FRESH_KEY      = 'chat:home:summary:v1';
const LASTKNOWN_KEY  = 'chat:home:lastKnown:v1';
const GEN_LOCK_KEY   = 'chat:home:genLock';
const FORCE_LOCK_KEY = 'chat:home:forceLock';

const FRESH_TTL_SEC      = 15 * 60;       // 15 min
const LASTKNOWN_TTL_SEC  = 72 * 3600;     // 72 h
const GEN_LOCK_TTL_SEC   = 90;
const FORCE_LOCK_TTL_SEC = 45;

const OPENAI_MODEL    = 'gpt-4o-mini';
const MAX_TOKENS      = 850;
const TEMPERATURE     = 0.5;
const OPENAI_TIMEOUT  = 28000;

const isDev = process.env.NODE_ENV !== 'production';

// ── Approved quote set ────────────────────────────────────────────────────────
const APPROVED_QUOTES = [
  'Boo-yah!',
  "It's awesome, baby!",
  'As cool as the other side of the pillow',
  'En fuego',
  'A little dipsy-doo, dunk-a-roo!',
  'Diaper Dandy',
  "Clear eyes, full hearts, can't lose!",
  'Juuuuuuuuust a bit outside.',
  'Ducks fly together!',
  'Show me the money!',
  'Google me, Chuck!',
  'Rings, Erneh!',
  "That's turrible.",
  'Are you too good for your home?! Answer me!',
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

function buildPayload(data) {
  const {
    yesterdayGames, todayGames, tomorrowGames,
    rankings, headlines, atsLeaders, atsMeta, atsWindow, championshipOdds,
  } = data;

  // Top 10 rankings
  const rankingsTop10 = rankings.slice(0, 10).map((r) => ({
    rank: r.rank ?? null,
    team: r.teamName || r.name || '',
  }));

  // Yesterday games: top 5 marquee (sorted by rank involvement)
  const yesterdayTop5 = yesterdayGames.slice(0, 5).map((g) => {
    const hs = parseInt(g.homeScore, 10);
    const as = parseInt(g.awayScore, 10);
    const homeWon = !isNaN(hs) && !isNaN(as) && hs > as;
    return {
      away: g.awayTeam || '',
      home: g.homeTeam || '',
      awayScore: isNaN(as) ? null : as,
      homeScore: isNaN(hs) ? null : hs,
      winner: homeWon ? (g.homeTeam || '') : (g.awayTeam || ''),
      loser: homeWon ? (g.awayTeam || '') : (g.homeTeam || ''),
    };
  });

  // Today games: top 3
  const todayTop3 = todayGames.slice(0, 3).map((g) => ({
    away: g.awayTeam || '',
    home: g.homeTeam || '',
    spread: g.spread ?? null,
    status: g.gameStatus || 'Upcoming',
  }));

  // Tomorrow: top 3 (may be empty — ESPN doesn't always have it)
  const tomorrowTop3 = (tomorrowGames || []).slice(0, 3).map((g) => ({
    away: g.awayTeam || '',
    home: g.homeTeam || '',
    spread: g.spread ?? null,
    status: g.gameStatus || 'Upcoming',
  }));

  // Championship odds: top 6 (best implied %)
  const champEntries = Object.entries(championshipOdds)
    .filter(([, v]) => v?.bestChanceAmerican != null || v?.american != null)
    .map(([slug, v]) => {
      const o = v.bestChanceAmerican ?? v.american;
      return { team: slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), odds: typeof o === 'number' && o > 0 ? '+' + o : o, impliedPct: impliedPct(o) };
    })
    .sort((a, b) => (b.impliedPct ?? 0) - (a.impliedPct ?? 0))
    .slice(0, 6);

  // ATS leaders: best 3 + worst 3
  const hasAts = Array.isArray(atsLeaders?.best) && atsLeaders.best.length > 0;
  const atsBest3 = hasAts ? atsLeaders.best.slice(0, 3).map((r) => {
    const rec = r.rec || r[atsWindow] || r.season || r.last30;
    return {
      team: r.name || r.slug,
      wl: rec ? `${rec.w ?? 0}-${rec.l ?? 0}` : null,
      coverPct: rec?.coverPct ?? null,
    };
  }) : [];
  const atsWorst3 = hasAts ? atsLeaders.worst.slice(0, 3).map((r) => {
    const rec = r.rec || r[atsWindow] || r.season || r.last30;
    return {
      team: r.name || r.slug,
      wl: rec ? `${rec.w ?? 0}-${rec.l ?? 0}` : null,
      coverPct: rec?.coverPct ?? null,
    };
  }) : [];

  // Headlines: top 5
  const headlinesTop5 = headlines.slice(0, 5).map((h) => ({
    title: h.title || '',
    source: h.source || 'News',
    publishedAt: h.pubDate || null,
  }));

  const atsConfidence = atsMeta?.confidence ?? 'low';
  const atsStatus = atsMeta?.status ?? (hasAts ? 'FULL' : 'EMPTY');
  const atsWindowPhrase = atsWindow === 'last7' ? 'last 7 days' : atsWindow === 'season' ? 'this season' : 'last 30 days';

  return {
    payload: {
      dateNow: getPstDate(),
      timezone: 'America/Los_Angeles',
      rankings: rankingsTop10,
      yesterdayGames: yesterdayTop5,
      todayGames: todayTop3,
      tomorrowGames: tomorrowTop3,
      champOdds: champEntries,
      atsLeaders: {
        window: atsWindowPhrase,
        confidence: atsConfidence,
        status: atsStatus,
        best3: atsBest3,
        worst3: atsWorst3,
      },
      headlines: headlinesTop5,
    },
    meta: { hasAts, atsStatus, atsConfidence, atsWindowPhrase },
  };
}

function buildPrompt(data) {
  const { payload, meta } = buildPayload(data);
  const { hasAts, atsStatus, atsConfidence, atsWindowPhrase } = meta;

  const atsInstruction = !hasAts
    ? 'ATS data is not yet available — briefly note it is loading; skip ATS details.'
    : atsStatus === 'FULL'
      ? `ATS data is full-league (high confidence). Mention both best and worst ATS teams for "${atsWindowPhrase}" using bettor language.`
      : atsConfidence === 'medium'
        ? `ATS data is partial (medium confidence). Mention leading covers for "${atsWindowPhrase}" with a note it's partial data.`
        : `ATS data is an early signal (low confidence). Frame it as "early read" on the number for "${atsWindowPhrase}".`;

  const systemPrompt = `You are a witty, energetic college basketball host for Maximus Sports — think SportsCenter energy meets sharp bettor intel.

Write a home-page daily briefing using ONLY the JSON data provided. DO NOT invent any scores, teams, odds, players, or facts not present in the data.

FORMAT — exactly 5 short paragraphs (no headers, no bullet lists, no numbered sections):

¶1 YESTERDAY RECAP: Mention 3–5 completed games from yesterdayGames. State the winner, loser, and final score for each. Be specific and punchy.

¶2 ODDS PULSE: Reference 2–3 teams from yesterday + their championship odds from champOdds (impliedPct shows probability). Include ONE quote from the approved list only if it fits naturally — no forced quotes.

¶3 TODAY + TOMORROW: Cover 1–3 matchups each from todayGames and tomorrowGames. Mention spreads when present.

¶4 ATS SPOTLIGHT: ${atsInstruction}. Use bettor language: "covering the number", "beating the spread", "market hasn't caught up", "sharp money". Include cover % when available.

¶5 NEWS PULSE + CLOSER: 2–3 headlines from headlines[]. Light humor, personality. End with a punchy "what to watch" closer.

STYLE RULES:
- Target 200–300 words total (hard limit: 320 words).
- Bold (**text**) ONLY 1–2 team names OR one key phrase per paragraph — never full sentences.
- Max 1 emoji per paragraph from: 🔥 😬 👀 🚨 🏆
- Zero profanity. Clean humor only.
- APPROVED QUOTES (use at most ONE total, only if it fits): ${APPROVED_QUOTES}
- NEVER use: "Stay humble. Stay hungry." or anything not in the approved list.
- If a data section is empty, acknowledge it briefly and move on.`;

  const userPrompt = `DATA:\n${JSON.stringify(payload, null, 2)}\n\nWrite the briefing now. Exactly 5 paragraphs, no headers.`;

  return { systemPrompt, userPrompt };
}

async function generateWithOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    if (isDev) console.warn('[chat/homeSummary] OPENAI_API_KEY not set');
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
      console.error('[chat/homeSummary] OpenAI error', r.status, body.slice(0, 200));
      return null;
    }
    const json = await r.json();
    return json?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    clearTimeout(t);
    console.error('[chat/homeSummary] OpenAI fetch error', err?.message);
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
  const data = await buildHomeSummaryData();
  const { systemPrompt, userPrompt } = buildPrompt(data);
  const summary = await generateWithOpenAI(systemPrompt, userPrompt);
  if (summary) {
    const payload = { summary, generatedAt: new Date().toISOString() };
    await Promise.all([
      setJson(FRESH_KEY, payload, { exSeconds: FRESH_TTL_SEC }),
      setJson(LASTKNOWN_KEY, payload, { exSeconds: LASTKNOWN_TTL_SEC }),
    ]).catch((e) => console.warn('[chat/homeSummary] KV write error', e?.message));
    if (isDev) console.log('[chat/homeSummary] generated + wrote KV');
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
  const bg    = getQueryParam(req, 'bg') === '1';

  // ── force=1: rate-limited inline generation ───────────────────────────────
  if (force) {
    // Rate limit force refresh: one per 45 s across all instances
    const gotForceLock = await tryAcquireLock(FORCE_LOCK_KEY, FORCE_LOCK_TTL_SEC);
    if (!gotForceLock) {
      if (isDev) console.log('[chat/homeSummary] force rate-limited');
      const cached = await readCached();
      return res.status(200).json({
        summary: cached?.summary ?? null,
        status: cached?.status ?? 'missing',
        generatedAt: cached?.generatedAt ?? null,
        rateLimited: true,
      });
    }
    if (isDev) console.log('[chat/homeSummary] force=1, generating');
    let summary = null;
    try {
      summary = await generateAndCache();
    } catch (err) {
      console.error('[chat/homeSummary] force generate error', err?.message);
    }
    if (summary) return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
    // Generation failed — return whatever we have
    const fallback = await readCached();
    return res.status(200).json({
      summary: fallback?.summary ?? null,
      status: fallback?.status ?? 'missing',
      generatedAt: fallback?.generatedAt ?? null,
    });
  }

  // ── Normal path: read KV tiers ────────────────────────────────────────────
  const fresh = await getJson(FRESH_KEY).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) {
      if (isDev) console.log('[chat/homeSummary] fresh hit', { ageSec: Math.round(ageMs / 1000) });
      return res.status(200).json({ summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt });
    }
  }

  const lastKnown = await getJson(LASTKNOWN_KEY).catch(() => null);

  // Kick background generation (guard with genLock to prevent stampede)
  if (!bg) {
    tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC).then((acquired) => {
      if (!acquired) {
        if (isDev) console.log('[chat/homeSummary] bg already running (genLock held)');
        return;
      }
      if (isDev) console.log('[chat/homeSummary] kicking bg generate');
      generateAndCache().catch(() => {});
    }).catch(() => {});
  }

  if (lastKnown?.summary) {
    if (isDev) console.log('[chat/homeSummary] lastKnown hit, kicked bg');
    return res.status(200).json({ summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt });
  }

  if (isDev) console.log('[chat/homeSummary] missing, kicked bg');
  return res.status(200).json({ summary: null, status: 'missing' });
}
