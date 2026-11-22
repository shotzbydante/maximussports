/**
 * GET /api/nfl/chat/homeSummary?force=0|1
 *
 * AI-written NFL home briefing. Same three-tier KV cache as the MLB and
 * NBA briefings: fresh (15 min) → last known (72 h) → generate.
 *
 * The prompt is fed real data only: this week's slate with lines and the
 * model's lean on each game, the playoff seeds, Super Bowl prices and the
 * headline feed. The model is told to use nothing else.
 */

import { getJson, setJson, tryAcquireLock } from '../../_globalCache.js';
import { getQueryParam } from '../../_requestUrl.js';
import { claudeComplete, isClaudeConfigured } from '../../_lib/claude.js';
import { fixPositiveOdds } from '../../_lib/oddsText.js';
import { NFL_TEAMS } from '../../../src/sports/nfl/teams.js';
import { getNflSlate } from '../../_lib/nflSlate.js';
import { getNflStandings } from '../../_lib/nflStandings.js';
import { loadNflHeadlines } from '../news/headlines.js';
import { getNflChampionshipOdds } from '../odds/championship.js';
import { getLatestNflPicksBoard } from '../../_lib/nflPicksBuilder.js';
import { recommendedPicks, summarizePick } from '../../../src/features/nfl/picks/pickSummary.js';

const FRESH_KEY      = 'chat:nfl:home:summary:v2';
const LASTKNOWN_KEY  = 'chat:nfl:home:lastKnown:v1';
const GEN_LOCK_KEY   = 'chat:nfl:home:genLock';
const FORCE_LOCK_KEY = 'chat:nfl:home:forceLock';

const FRESH_TTL_SEC      = 15 * 60;
const LASTKNOWN_TTL_SEC  = 72 * 3600;
const GEN_LOCK_TTL_SEC   = 90;
const FORCE_LOCK_TTL_SEC = 45;

const MAX_TOKENS  = 1800;
const LLM_TIMEOUT = 18000;

const SEASON_PHASE = { 1: 'preseason', 2: 'regular_season', 3: 'playoffs', 4: 'offseason' };

function impliedPct(american) {
  if (typeof american !== 'number' || american === 0) return null;
  const p = american < 0 ? -american / (-american + 100) : 100 / (american + 100);
  return Math.round(p * 1000) / 10;
}

function fmtOdds(v) { return typeof v === 'number' && v > 0 ? `+${v}` : v; }

function kickoffLabel(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit',
    }) + ' ET';
  } catch { return null; }
}

async function buildPayload() {
  const [slateR, standingsR, headlinesR, champR, boardR] = await Promise.allSettled([
    getNflSlate(),
    getNflStandings(),
    loadNflHeadlines(),
    getNflChampionshipOdds(),
    getLatestNflPicksBoard(),
  ]);
  const board = boardR.status === 'fulfilled' ? boardR.value : null;
  const upcomingPick = (p) => Date.parse(p.matchup?.startTime || 0) > Date.now();
  const picks = recommendedPicks(board).filter(upcomingPick).slice(0, 4).map((p) => {
    const x = summarizePick(p);
    return {
      game: x.matchup, pick: x.pick, price: x.price || undefined, book: x.book || undefined,
      expectedValue: x.expectedValue || undefined, conditions: x.conditions || undefined, why: x.why,
    };
  });
  const slate = slateR.status === 'fulfilled' ? slateR.value : null;
  const standings = standingsR.status === 'fulfilled' ? standingsR.value?.teams || {} : {};
  const headlines = headlinesR.status === 'fulfilled' ? headlinesR.value?.headlines || [] : [];
  const champOdds = champR.status === 'fulfilled' ? champR.value?.odds || {} : {};

  const slugToName = Object.fromEntries(NFL_TEAMS.map((t) => [t.slug, t.name]));

  const games = (slate?.games || []).map((g) => {
    const home = g.teams.home, away = g.teams.away;
    const base = {
      matchup: `${away.name} at ${home.name}`,
      awayRecord: away.record, homeRecord: home.record,
      status: g.status,
      network: g.broadcast?.network || null,
    };
    if (g.status === 'final') {
      return { ...base, finalScore: `${away.abbrev} ${away.score}, ${home.abbrev} ${home.score}` };
    }
    if (g.status === 'live') {
      return { ...base, liveScore: `${away.abbrev} ${away.score}, ${home.abbrev} ${home.score}`, clock: g.gameState?.periodLabel };
    }
    const out = {
      ...base,
      kickoff: kickoffLabel(g.startTime),
      spread: g.betting?.spreadDisplay !== '—' ? g.betting?.spreadDisplay : null,
      total: g.market?.pregameTotal ?? null,
    };
    if (g.model?.fairSpread != null && g.market?.pregameSpread != null) {
      const gap = g.model.fairSpread - g.market.pregameSpread;
      if (Math.abs(gap) >= 1.5) {
        const line = (v) => (v > 0 ? `+${v}` : `${v}`);
        out.modelLean = `${gap < 0 ? home.abbrev : away.abbrev} by ${Math.abs(gap).toFixed(1)} points against the spread`;
        out.modelLeanWhy = `the ratings make it ${home.abbrev} ${line(Math.round(g.model.fairSpread * 10) / 10)} and the market has ${home.abbrev} ${line(g.market.pregameSpread)}`;
      }
    }
    if (g.engine?.env?.label) out.conditions = g.engine.env.label;
    if (g.market?.openSpread != null && g.market?.pregameSpread != null) {
      const move = g.market.pregameSpread - g.market.openSpread;
      if (Math.abs(move) >= 1) out.lineMove = `${Math.abs(move).toFixed(1)} points toward ${move < 0 ? home.abbrev : away.abbrev} since open`;
    }
    const qbs = [
      ...(g.injuries?.away?.quarterbacks || []).map((q) => `${away.abbrev} QB ${q.name}: ${q.status}`),
      ...(g.injuries?.home?.quarterbacks || []).map((q) => `${home.abbrev} QB ${q.name}: ${q.status}`),
    ];
    if (qbs.length > 0) out.quarterbackInjuries = qbs;
    return out;
  });

  const seeds = (conf) => Object.values(standings)
    .filter((t) => t.conference === conf && t.playoffSeed != null && t.playoffSeed <= 7)
    .sort((a, b) => a.playoffSeed - b.playoffSeed)
    .map((t) => ({ seed: t.playoffSeed, team: t.name, record: t.record, streak: t.streak }));

  const champEntries = Object.entries(champOdds)
    .filter(([, v]) => typeof v?.bestChanceAmerican === 'number')
    .map(([slug, v]) => ({
      team: slugToName[slug] || slug,
      odds: fmtOdds(v.bestChanceAmerican),
      impliedPct: impliedPct(v.bestChanceAmerican),
    }))
    .sort((a, b) => (b.impliedPct ?? 0) - (a.impliedPct ?? 0));

  return {
    dateNow: new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    seasonPhase: SEASON_PHASE[slate?.seasonType] || 'regular_season',
    week: slate?.week ?? null,
    byeTeams: (slate?.byeTeams || []).map((s) => slugToName[s] || s),
    recommendedPicks: picks,
    games,
    playoffPicture: { AFC: seeds('AFC'), NFC: seeds('NFC') },
    superBowlOdds: champEntries.slice(0, 8),
    superBowlSleepers: champEntries.slice(8, 14),
    headlines: headlines.slice(0, 12).map((h) => ({ title: h.title, source: h.source, topic: h.topic })),
  };
}

function buildPrompt(payload) {
  const systemPrompt = `You are the NFL intelligence host for Maximus Sports: sharp, plain-spoken, and useful to someone who bets. Think a film-room analyst who also reads the market.

Write the home-page briefing using ONLY the JSON data provided. Do NOT invent scores, injuries, players, odds, records, or facts that are not in the data. If a section's data is empty, skip that section rather than filling it in.

FORMAT: 4 or 5 paragraphs, no headers, no bullet lists.

P1 THE WEEK: Open on the biggest stories in headlines[] and where the slate stands (use week, and any finalScore or liveScore in games[]).
P2 THE BOARD: If recommendedPicks[] is not empty, lead with those picks: name each pick with its price and book exactly as given, and in the same sentence or the next give the reason from its why field in plain words. Then walk through 2 or 3 other games still to be played from games[]. Quote the spread and total exactly as given. Where a game has modelLean, say so and give its reason from modelLeanWhy; where it has lineMove, say so in plain terms. Where a game has quarterbackInjuries, mention it and note that the model lean does not account for it.
P3 PLAYOFF PICTURE: Use playoffPicture to say who holds the top seeds in each conference and who is on a streak.
P4 SUPER BOWL MARKET: Reference 3 or 4 teams from superBowlOdds with exact odds (positive odds MUST include "+"), and one from superBowlSleepers if present.
P5 CLOSER: One or two sentences on what to watch next. Mention byeTeams if any.

STYLE RULES:
- 300 to 420 words total (hard limit 480).
- Bold (**text**) team names on first mention.
- Football language only: spread, total, moneyline, cover, key numbers, bye, short week, division, wild card, seed.
- No profanity. No guarantees, no "lock", no "can't lose".
- Model leans are leans, not predictions of the result.
- Never state a pick or a lean without its reason. Use only the reason given in the data ("why" or "modelLeanWhy"); do not invent one.
- Only the picks in recommendedPicks[] are recommended bets. Do not call a modelLean a pick or a recommendation.`;

  const userPrompt = `DATA:\n${JSON.stringify(payload, null, 2)}\n\nWrite the briefing now.`;
  return { systemPrompt, userPrompt };
}

async function generateWithClaude(systemPrompt, userPrompt) {
  if (!isClaudeConfigured()) return null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await claudeComplete({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: MAX_TOKENS,
        timeoutMs: LLM_TIMEOUT,
      });
      return raw ? fixPositiveOdds(raw) : null;
    } catch (err) {
      const timedOut = err?.code === 'timeout';
      if (timedOut && attempt < 2) continue;
      console[timedOut ? 'warn' : 'error']('[nfl/chat/homeSummary] Claude', err?.message);
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
  const payload = await buildPayload();
  // Nothing to write about: do not ask the model to fill an empty page.
  if (payload.games.length === 0 && payload.headlines.length === 0) return null;
  const { systemPrompt, userPrompt } = buildPrompt(payload);
  const summary = await generateWithClaude(systemPrompt, userPrompt);
  if (summary) {
    const record = { summary, generatedAt: new Date().toISOString(), week: payload.week };
    await Promise.all([
      setJson(FRESH_KEY, record, { exSeconds: FRESH_TTL_SEC }),
      setJson(LASTKNOWN_KEY, record, { exSeconds: LASTKNOWN_TTL_SEC }),
    ]).catch((e) => console.warn('[nfl/chat/homeSummary] KV write error', e?.message));
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
    const gotForceLock = await tryAcquireLock(FORCE_LOCK_KEY, FORCE_LOCK_TTL_SEC).catch(() => false);
    if (!gotForceLock) {
      const cached = await readCached();
      return res.status(200).json({ summary: cached?.summary ?? null, status: cached?.status ?? 'missing', generatedAt: cached?.generatedAt ?? null, rateLimited: true });
    }
    let summary = null;
    try { summary = await generateAndCache(); }
    catch (err) { console.error('[nfl/chat/homeSummary] force error', err?.message); }
    if (summary) return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
    const fallback = await readCached();
    return res.status(200).json({ summary: fallback?.summary ?? null, status: fallback?.status ?? 'missing', generatedAt: fallback?.generatedAt ?? null });
  }

  const cached = await readCached();
  if (cached?.status === 'fresh') return res.status(200).json(cached);

  if (cached?.status === 'stale') {
    tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC)
      .then((acquired) => { if (acquired) generateAndCache().catch(() => {}); })
      .catch(() => {});
    return res.status(200).json(cached);
  }

  const gotLock = await tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC).catch(() => false);
  if (gotLock) {
    try {
      const summary = await generateAndCache();
      if (summary) return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
    } catch (err) { console.error('[nfl/chat/homeSummary] inline gen error', err?.message); }
  }

  return res.status(200).json({ summary: null, status: 'missing' });
}
