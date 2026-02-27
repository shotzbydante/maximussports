/**
 * GET /api/chat/homeSummary?force=0|1
 * Three-tier KV cache for AI-generated home briefings.
 * fresh KV (15 min) → lastKnown KV (72 h) → generate inline (force=1) or kick background.
 * Background generation: fire-and-forget GET ?force=1&bg=1 from the stale/missing path.
 * Never blocks the caller on generation unless force=1 is explicitly passed.
 */

import { getJson, setJson } from '../_globalCache.js';
import { getOriginFromReq, getQueryParam } from '../_requestUrl.js';

const FRESH_KEY = 'chat:home:summary:v1';
const LASTKNOWN_KEY = 'chat:home:lastKnown:v1';
const FRESH_TTL_SEC = 15 * 60;        // 15 min
const LASTKNOWN_TTL_SEC = 72 * 3600;  // 72 hours
const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 520;
const FETCH_TIMEOUT_MS = 5000;
const OPENAI_TIMEOUT_MS = 25000;

const isDev = process.env.NODE_ENV !== 'production';

function getPstDate() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function fetchJsonSafe(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (err) {
    clearTimeout(t);
    if (isDev) console.warn('[chat/homeSummary] fetchJsonSafe failed', url, err?.message);
    return null;
  }
}

async function gatherHomeData(origin) {
  const [fastResult, atsResult, oddsResult] = await Promise.allSettled([
    fetchJsonSafe(`${origin}/api/home/fast`),
    fetchJsonSafe(`${origin}/api/ats/leaders?window=last30`),
    fetchJsonSafe(`${origin}/api/odds/championship`),
  ]);

  const fast = fastResult.status === 'fulfilled' && fastResult.value ? fastResult.value : {};
  const ats = atsResult.status === 'fulfilled' && atsResult.value ? atsResult.value : {};
  const odds = oddsResult.status === 'fulfilled' && oddsResult.value ? oddsResult.value : {};

  const allGames = fast.scoresToday ?? [];
  const recentGames = allGames.filter((g) => {
    const s = (g.gameStatus || '').toLowerCase();
    return s === 'final' || s.includes('final');
  });
  const upcomingGames = allGames.filter((g) => {
    const s = (g.gameStatus || '').toLowerCase();
    return !(s === 'final' || s.includes('final'));
  });

  return {
    recentGames,
    upcomingGames,
    rankings: fast.rankings?.rankings ?? fast.rankingsTop25 ?? [],
    headlines: fast.headlines ?? [],
    atsLeaders: ats.atsLeaders ?? { best: [], worst: [] },
    atsMeta: ats.atsMeta ?? null,
    atsWindow: ats.atsWindow ?? 'last30',
    championshipOdds: odds.odds ?? {},
  };
}

function buildPrompt(data) {
  const { recentGames, upcomingGames, rankings, headlines, atsLeaders, atsMeta, atsWindow, championshipOdds } = data;
  const atsStatus = atsMeta?.status ?? (atsLeaders.best.length || atsLeaders.worst.length ? 'FULL' : null);
  const atsConfidence = atsMeta?.confidence ?? 'low';
  const hasAts = atsLeaders.best.length > 0 || atsLeaders.worst.length > 0;

  const recLines = recentGames.slice(0, 10).map((g) => {
    const away = g.awayTeam || 'Away';
    const home = g.homeTeam || 'Home';
    const score = (g.awayScore != null && g.homeScore != null) ? `${g.awayScore}–${g.homeScore}` : 'score TBD';
    return `${away} @ ${home}: ${score} (Final)`;
  }).join('\n') || 'No completed games in data.';

  const upLines = upcomingGames.slice(0, 8).map((g) => {
    const spread = g.spread != null ? ` — spread: ${g.spread}` : '';
    return `${g.awayTeam || ''} @ ${g.homeTeam || ''}${spread} (${g.gameStatus || 'Upcoming'})`;
  }).join('\n') || 'None listed.';

  const top25List = rankings.slice(0, 10).map((r, i) => `#${r.rank ?? i + 1} ${r.teamName || r.name || ''}`).join(', ') || 'Not available.';

  const atsBestLines = atsLeaders.best.slice(0, 5).map((r, i) => {
    const rec = r.rec || r[atsWindow] || r.season || r.last30;
    const wl = rec ? `${rec.w ?? 0}-${rec.l ?? 0}` : '';
    const pct = rec?.coverPct != null ? ` (${rec.coverPct}% cover)` : '';
    return `${i + 1}. ${r.name || r.slug} ${wl}${pct}`;
  }).join('\n') || 'Not available.';

  const atsWorstLines = atsLeaders.worst.slice(0, 5).map((r, i) => {
    const rec = r.rec || r[atsWindow] || r.season || r.last30;
    const wl = rec ? `${rec.w ?? 0}-${rec.l ?? 0}` : '';
    return `${i + 1}. ${r.name || r.slug} ${wl}`;
  }).join('\n') || 'Not available.';

  const oddsEntries = Object.entries(championshipOdds)
    .filter(([, v]) => v?.bestChanceAmerican != null || v?.american != null)
    .sort((a, b) => (a[1].bestChanceAmerican ?? a[1].american ?? 9999) - (b[1].bestChanceAmerican ?? b[1].american ?? 9999))
    .slice(0, 6);
  const oddsLines = oddsEntries.length
    ? oddsEntries.map(([slug, v]) => {
        const name = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const o = v.bestChanceAmerican ?? v.american;
        return `${name}: ${o > 0 ? '+' : ''}${o}`;
      }).join(', ')
    : 'Not available.';

  const headlineLines = headlines.slice(0, 6).map((h) => `- ${h.title || ''} (${h.source || 'News'})`).join('\n') || 'No headlines.';

  const atsQualifier = !hasAts
    ? 'No ATS data available — skip the ATS section or note it is still loading.'
    : atsStatus === 'FULL'
      ? 'ATS leaderboard is full-league data (high confidence). Mention ATS leaders definitively.'
      : atsConfidence === 'medium'
        ? 'ATS data is from a partial source (medium confidence). Be assertive but note partial data.'
        : 'ATS data is an early signal (low confidence). Qualify as "early signal" when mentioning.';

  const atsWindowPhrase = atsWindow === 'last7' ? 'over the last 7 days' : atsWindow === 'season' ? 'this season' : 'over the last 30 days';

  const systemPrompt = `You are a witty, energetic college basketball host for Maximus Sports — think SportsCenter energy. Write a home-page daily briefing using ONLY the structured data provided. Do NOT invent scores, teams, odds, or facts. If a data section is empty or missing, briefly note it's unavailable and move on.

FORMAT — 5 flowing paragraphs (no section headers, no bullet lists):
1. Yesterday recap: 3–5 marquee completed games — winner, loser, final score. Be specific.
2. Championship odds pulse: 2–3 teams from yesterday's games + their current title odds. ONE clean, brief quote only if it fits naturally (SportsCenter energy or light movie motivation — zero profanity).
3. Today + tomorrow slate: 1–3 matchups per bucket; mention spread when available.
4. News pulse: 2–3 headlines, light humor, let your personality show.
5. What to watch next: 1–2 punchy closing lines.

STYLE RULES:
- 180–320 words total.
- Bold (using **text**) ONLY 1–2 team names or one key phrase per paragraph — not entire sentences.
- Max 1 emoji per paragraph, drawn from: 🔥 😬 👀 🚨 🏆
- Conversational, fun, no profanity.
- ATS language: "covering the number", "beating the spread", "sharp money has noticed", "market hasn't caught up", "priced aggressively".
- ATS qualifier: ${atsQualifier}
- ATS window phrase to use: "${atsWindowPhrase}".`;

  const userPrompt = `Today (PST): ${getPstDate()}

--- Top 10 rankings ---
${top25List}

--- Recent completed games ---
${recLines}

--- Upcoming games (today + tomorrow) ---
${upLines}

--- Championship title odds ---
${oddsLines}

--- ATS leaders (${atsWindow}) ---
Best covers:
${atsBestLines}

Worst covers:
${atsWorstLines}

--- Headlines ---
${headlineLines}

Write the briefing now. Follow the 5-paragraph format and style rules exactly.`;

  return { systemPrompt, userPrompt };
}

async function generateWithOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    if (isDev) console.warn('[chat/homeSummary] OPENAI_API_KEY not set');
    return null;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.5,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.error('[chat/homeSummary] OpenAI error', r.status, errBody.slice(0, 200));
      return null;
    }
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    clearTimeout(t);
    console.error('[chat/homeSummary] OpenAI fetch error', err?.message);
    return null;
  }
}

function kickBackgroundGenerate(origin) {
  if (!origin) return;
  try {
    fetch(`${origin}/api/chat/homeSummary?force=1&bg=1`).catch(() => {});
  } catch (_) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const force = getQueryParam(req, 'force') === '1';
  const bg = getQueryParam(req, 'bg') === '1';

  // ── Force-generate path (inline generation) ──────────────────────────────
  if (force) {
    const origin = getOriginFromReq(req);
    if (!origin) {
      if (isDev) console.log('[chat/homeSummary] force=1 but origin unavailable');
      return res.status(200).json({ summary: null, status: 'missing', reason: 'no_origin' });
    }
    if (isDev) console.log('[chat/homeSummary] force=1, gathering data from', origin);
    let summary = null;
    try {
      const pageData = await gatherHomeData(origin);
      const { systemPrompt, userPrompt } = buildPrompt(pageData);
      summary = await generateWithOpenAI(systemPrompt, userPrompt);
      if (summary) {
        const payload = { summary, generatedAt: new Date().toISOString() };
        await Promise.all([
          setJson(FRESH_KEY, payload, { exSeconds: FRESH_TTL_SEC }),
          setJson(LASTKNOWN_KEY, payload, { exSeconds: LASTKNOWN_TTL_SEC }),
        ]).catch((e) => console.warn('[chat/homeSummary] KV write error', e?.message));
        if (isDev) console.log('[chat/homeSummary] generated + wrote KV');
      }
    } catch (err) {
      console.error('[chat/homeSummary] generate error', err?.message);
    }
    return res.status(200).json({
      summary: summary ?? null,
      status: summary ? 'fresh' : 'missing',
      generatedAt: summary ? new Date().toISOString() : null,
    });
  }

  // ── Read fresh KV ─────────────────────────────────────────────────────────
  const fresh = await getJson(FRESH_KEY).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) {
      if (isDev) console.log('[chat/homeSummary] fresh hit', { ageSec: Math.round(ageMs / 1000) });
      return res.status(200).json({ summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt });
    }
  }

  // ── Read lastKnown KV ─────────────────────────────────────────────────────
  const lastKnown = await getJson(LASTKNOWN_KEY).catch(() => null);
  const origin = getOriginFromReq(req);

  // Kick background generation (only from non-bg requests to avoid loops)
  if (!bg) kickBackgroundGenerate(origin);

  if (lastKnown?.summary) {
    if (isDev) console.log('[chat/homeSummary] lastKnown hit, kicked background generate');
    return res.status(200).json({ summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt });
  }

  if (isDev) console.log('[chat/homeSummary] missing, kicked background generate');
  return res.status(200).json({ summary: null, status: 'missing' });
}
