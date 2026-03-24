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
const OPENAI_TIMEOUT  = 18000; // 18s — leaves 12s buffer for data build + KV + response within Vercel 30s limit

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

  // Tomorrow: top 5 (expanded from 3 for better between-rounds previews)
  const tomorrowTop3 = (tomorrowGames || []).slice(0, 5).map((g) => ({
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

// ── Tournament calendar (2026) ───────────────────────────────────────────────
const T_SELECTION_SUNDAY  = '2026-03-15';
const T_FIRST_FOUR_START  = '2026-03-17';
const T_FIRST_ROUND_START = '2026-03-19';
const T_SECOND_ROUND_END  = '2026-03-22';
const T_SWEET_16_START    = '2026-03-26';
const T_ELITE_EIGHT_END   = '2026-03-29';
const T_FINAL_FOUR        = '2026-04-04';
const T_CHAMPIONSHIP      = '2026-04-06';
const T_TOURNAMENT_END    = '2026-04-07';

function _toDateNum(s) { return Number(s.replace(/-/g, '')); }

function _getTournamentPhase() {
  const d = new Date().toISOString().slice(0, 10);
  const n = _toDateNum(d);
  if (n >= _toDateNum(T_SELECTION_SUNDAY) && n < _toDateNum(T_FIRST_FOUR_START)) return 'pre_tournament';
  if (n >= _toDateNum(T_FIRST_FOUR_START) && n < _toDateNum(T_FIRST_ROUND_START)) return 'first_four';
  if (n >= _toDateNum(T_FIRST_ROUND_START) && n <= _toDateNum(T_SECOND_ROUND_END)) return 'first_round';
  if (n >= _toDateNum(T_SWEET_16_START) && n <= _toDateNum(T_ELITE_EIGHT_END)) return 'sweet_sixteen';
  if (n === _toDateNum(T_FINAL_FOUR)) return 'final_four';
  if (n >= _toDateNum(T_CHAMPIONSHIP) && n <= _toDateNum(T_TOURNAMENT_END)) return 'championship';
  return 'off';
}

function _getDayOfWeek() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' });
}

function buildPrompt(data) {
  const { payload, meta } = buildPayload(data);
  const { hasAts, atsStatus, atsConfidence, atsWindowPhrase } = meta;
  const tournamentPhase = _getTournamentPhase();
  const dayOfWeek = _getDayOfWeek();
  const isTournament = tournamentPhase !== 'off';

  const atsInstruction = !hasAts
    ? 'ATS data is not yet available — briefly note it is loading; skip ATS details.'
    : atsStatus === 'FULL'
      ? `ATS data is full-league (high confidence). Mention both best and worst ATS teams for "${atsWindowPhrase}" using bettor language.`
      : atsConfidence === 'medium'
        ? `ATS data is partial (medium confidence). Mention leading covers for "${atsWindowPhrase}" with a note it's partial data.`
        : `ATS data is an early signal (low confidence). Frame it as "early read" on the number for "${atsWindowPhrase}".`;

  // Build tournament-aware paragraph instructions
  let p1, p2, p3, p4, p5;

  if (!isTournament) {
    // Regular season prompt (unchanged)
    p1 = '¶1 YESTERDAY RECAP: Mention 3–5 completed games from yesterdayGames. State the winner, loser, and final score for each. Be specific and punchy.';
    p2 = '¶2 ODDS PULSE: Reference 2–3 teams from yesterday + their championship odds from champOdds (impliedPct shows probability). ALWAYS preserve the exact odds format from the data — positive odds MUST include the leading "+" sign (e.g. write "+320", never just "320"). Include ONE quote from the approved list only if it fits naturally — no forced quotes.';
    p3 = '¶3 TODAY + TOMORROW: Cover 1–3 matchups each from todayGames and tomorrowGames. Mention spreads when present.';
    p4 = `¶4 ATS SPOTLIGHT: ${atsInstruction}. Use bettor language: "covering the number", "beating the spread", "market hasn't caught up", "sharp money". Include cover % when available.`;
    p5 = '¶5 NEWS PULSE + CLOSER: 2–3 headlines from headlines[]. Light humor, personality. End with a punchy "what to watch" closer.';
  } else if (tournamentPhase === 'pre_tournament') {
    p1 = '¶1 BRACKET IS SET: The official NCAA tournament bracket is live. Frame this as a pivotal moment — the field is finalized. If yesterdayGames has conference tournament finals, recap the biggest 1–2 results. Otherwise, note the bracket is locked and the tournament begins soon.';
    p2 = '¶2 CHAMPIONSHIP ODDS: Reference 2–3 top championship contenders from champOdds. ALWAYS preserve the exact odds format (positive odds MUST include "+" sign). Frame as "who the market likes heading into March Madness." Include ONE approved quote if natural.';
    p3 = '¶3 TOURNAMENT PREVIEW: Preview the upcoming First Four or first-round games from todayGames/tomorrowGames. Call out seed matchups, potential upsets, and marquee games. If no games today, frame this as the calm before the storm — bracket prep time.';
    p4 = `¶4 ATS + MODEL EDGES: ${atsInstruction}. Frame ATS trends in tournament context — which teams have been covering consistently and might carry that into March? Use bettor language.`;
    p5 = '¶5 BRACKET INTEL + CLOSER: 1–2 headlines from headlines[]. Add a tournament anticipation angle. End with a sharp "what to watch for" closer that builds excitement for the tournament.';
  } else if (tournamentPhase === 'first_four') {
    p1 = '¶1 FIRST FOUR: The NCAA tournament officially tips off with the First Four. If yesterdayGames has results, recap them. Otherwise, build excitement for tonight\'s games — these are play-in games where bubble teams earn their spot.';
    p2 = '¶2 CHAMPIONSHIP ODDS: Reference 2–3 top favorites from champOdds with exact odds format (positive odds MUST include "+"). Frame as pre-tournament market positioning.';
    p3 = '¶3 TODAY\'S SLATE: Cover today\'s First Four matchups from todayGames. Mention seeds, spreads, and what\'s at stake for each team. Preview the upcoming first round if data is available.';
    p4 = `¶4 ATS + UPSET RADAR: ${atsInstruction}. Which teams have been sharp against the spread heading into the tournament? Frame any ATS trends as potential upset or cover signals for the bracket.`;
    p5 = '¶5 NEWS + MARCH MADNESS OPENER: 1–2 headlines from headlines[]. End with a punchy tournament-opening closer — bracket season is HERE.';
  } else if (tournamentPhase === 'first_round' || tournamentPhase === 'sweet_sixteen') {
    const roundLabel = tournamentPhase === 'first_round' ? 'First/Second Round' : 'Sweet 16 / Elite Eight';

    if (dayOfWeek === 'Monday') {
      p1 = `¶1 WEEKEND RECAP: The ${roundLabel} weekend is in the books. Recap the biggest 3–5 results from yesterdayGames — call out upsets, dominant wins, and any bracket-busting outcomes. Be specific with scores.`;
      p2 = '¶2 CHAMPIONSHIP ODDS SHIFT: How have the odds moved? Reference 2–3 teams from champOdds whose stock rose or fell over the weekend. Positive odds MUST include "+".';
      p3 = '¶3 WHAT\'S NEXT: Preview the upcoming round or next set of games from todayGames/tomorrowGames. If no games today, frame this as a rest/prep day — the bracket narrows from here.';
      p4 = `¶4 ATS + BRACKET CHECK: ${atsInstruction}. Which teams have been covering in the tournament? Which teams are the market still sleeping on?`;
      p5 = '¶5 NEWS + BRACKET PULSE: 1–2 headlines. End with a "state of the bracket" closer — who\'s still alive, whose bracket is busted, what to watch next.';
    } else if (dayOfWeek === 'Tuesday' || dayOfWeek === 'Wednesday') {
      p1 = '¶1 TOURNAMENT UPDATE: Recap the most recent tournament results from yesterdayGames if any. If no games were played, acknowledge we are between rounds but frame it with energy — the bracket resets, the next slate is loaded with marquee matchups. NEVER say "it was a quiet day" or imply nothing is happening. The tournament is LIVE.';
      p2 = '¶2 ODDS MOVEMENT: Reference 2–3 teams from champOdds whose stock shifted after recent results. Positive odds MUST include "+". Frame as how the market is adjusting between rounds — which favorites survived, which contenders emerged.';
      p3 = '¶3 UPCOMING SLATE PREVIEW: This is the most important paragraph on transition days. Preview the NEXT round\'s key games from todayGames/tomorrowGames. Call out the marquee matchups by seed, potential upsets the model flags, and any must-watch games. If data shows upcoming Thursday/Friday games, highlight them. Even if todayGames is empty, use tomorrowGames. Frame with urgency — these games are COMING.';
      p4 = `¶4 ATS + MODEL EDGES: ${atsInstruction}. Frame which teams the model likes for the upcoming round. Which ATS trends are carrying into the tournament? Which underdogs have the strongest cover signals? Use bettor language.`;
      p5 = '¶5 BRACKET CHECK + CLOSER: 1–2 headlines from headlines[]. End with a sharp "state of the bracket" closer — who\'s still standing, who\'s on upset watch, what the model is flagging for the next wave of games. Make the reader feel the tournament is alive even on a transition day.';
    } else {
      p1 = `¶1 TOURNAMENT GAME DAY: ${roundLabel} action continues! Recap yesterday's results from yesterdayGames if any — call out upsets, close finishes, and standout performances. Be specific with scores.`;
      p2 = '¶2 ODDS PULSE: Reference 2–3 teams from champOdds. Positive odds MUST include "+". Frame as live tournament market reads.';
      p3 = '¶3 TODAY\'S GAMES: Preview today\'s tournament matchups from todayGames. Highlight seeds, spreads, and the matchups most likely to produce drama or upsets.';
      p4 = `¶4 ATS + UPSET WATCH: ${atsInstruction}. Which of today's games have the strongest model edge? Which underdogs are worth watching against the spread?`;
      p5 = '¶5 NEWS + GAME DAY CLOSER: 1–2 headlines. End with a punchy game-day hook — who to watch, what to bet, what could bust the bracket today.';
    }
  } else if (tournamentPhase === 'final_four' || tournamentPhase === 'championship') {
    const label = tournamentPhase === 'final_four' ? 'Final Four' : 'National Championship';
    p1 = `¶1 ${label.toUpperCase()}: We're at the ${label}. Recap the most recent results from yesterdayGames. Call out the dominant performances, clutch moments, and what got these teams here.`;
    p2 = `¶2 TITLE ODDS: Reference 2–3 remaining contenders from champOdds. Positive odds MUST include "+". Frame as the final market read before the ${label}.`;
    p3 = `¶3 TODAY'S ${label.toUpperCase()}: Preview today's ${label} matchup(s) from todayGames. Seeds, spreads, key storylines. This is the biggest stage in college basketball.`;
    p4 = `¶4 ATS + EDGE: ${atsInstruction}. What does the model say about today's ${label} matchup(s)? Any sharp-money signals or ATS trends to watch?`;
    p5 = `¶5 NEWS + ${label.toUpperCase()} CLOSER: 1–2 headlines. End with an epic closer worthy of the ${label} — one shining moment.`;
  } else {
    // Fallback generic
    p1 = '¶1 YESTERDAY RECAP: Mention 3–5 completed games from yesterdayGames. State the winner, loser, and final score for each.';
    p2 = '¶2 ODDS PULSE: Reference 2–3 teams from champOdds. Positive odds MUST include "+".';
    p3 = '¶3 TODAY + TOMORROW: Cover matchups from todayGames and tomorrowGames.';
    p4 = `¶4 ATS SPOTLIGHT: ${atsInstruction}. Use bettor language.`;
    p5 = '¶5 NEWS + CLOSER: 2–3 headlines from headlines[]. End with a punchy closer.';
  }

  const tournamentContext = isTournament
    ? `\n\nIMPORTANT TOURNAMENT CONTEXT: We are currently in the ${tournamentPhase.replace(/_/g, ' ')} phase of the NCAA tournament. Today is ${dayOfWeek}. Frame ALL copy with March Madness awareness. Do NOT use regular-season language like "quiet day on the hardwood" — instead, use tournament-specific framing (bracket impact, upset watch, advancing/eliminated, seed storylines, March Madness rhythm). If there are no games today, frame it as a transition day between rounds, NOT as a slow day.`
    : '';

  const systemPrompt = `You are a witty, energetic college basketball host for Maximus Sports — think SportsCenter energy meets sharp bettor intel.${tournamentContext}

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
- Max 1 emoji per paragraph from: 🔥 😬 👀 🚨 🏆
- Zero profanity. Clean humor only.
- APPROVED QUOTES (use at most ONE total, only if it fits): ${APPROVED_QUOTES}
- NEVER use: "Stay humble. Stay hungry." or anything not in the approved list.
- If a data section is empty, acknowledge it briefly and move on.${isTournament ? '\n- NEVER say "quiet day on the hardwood" or similar regular-season filler during tournament time.\n- Use tournament language: "bracket", "seed", "upset", "advancing", "eliminated", "Cinderella", "March Madness".' : ''}`;

  const userPrompt = `DATA:\n${JSON.stringify(payload, null, 2)}\n\nWrite the briefing now. Exactly 5 paragraphs, no headers.`;

  return { systemPrompt, userPrompt };
}

/**
 * Post-process LLM output to fix positive American odds missing their "+" sign.
 * Matches patterns like "at 320" or "at 1400" in championship-odds contexts
 * and ensures the "+" is present.
 */
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
    if (isDev) console.warn('[chat/homeSummary] OPENAI_API_KEY not set');
    return null;
  }
  // Single attempt with bounded timeout — no retry to stay within Vercel 30s limit
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
      console.warn('[chat/homeSummary] OpenAI error', r.status, body.slice(0, 200));
      return null;
    }
    const json = await r.json();
    const raw = json?.choices?.[0]?.message?.content?.trim() || null;
    return raw ? fixPositiveOdds(raw) : null;
  } catch (err) {
    clearTimeout(t);
    const isAbort = err?.name === 'AbortError' || err?.message?.includes('aborted');
    console.warn(`[chat/homeSummary] OpenAI ${isAbort ? 'timeout' : 'error'}:`, err?.message);
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
