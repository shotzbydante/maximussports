/**
 * GET /api/chat/teamSummary?teamSlug=...&force=0|1
 * Three-tier KV cache for AI-generated team page summaries.
 * fresh KV (15 min) → lastKnown KV (72 h) → generate inline (force=1) or kick bg.
 * Rate limiting: forceLock (45 s), genLock (90 s).
 * No self-HTTP calls — uses buildTeamSummaryData() directly.
 */

import { getJson, setJson, tryAcquireLock } from '../_globalCache.js';
import { getQueryParam } from '../_requestUrl.js';
import { buildTeamSummaryData } from '../_lib/teamData.js';
import { claudeComplete, isClaudeConfigured } from '../_lib/claude.js';

const FRESH_TTL_SEC      = 15 * 60;
const LASTKNOWN_TTL_SEC  = 72 * 3600;
const GEN_LOCK_TTL_SEC   = 90;
const FORCE_LOCK_TTL_SEC = 45;

const MAX_TOKENS     = 800;
const LLM_TIMEOUT    = 25000;

const isDev = process.env.NODE_ENV !== 'production';

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

function freshKey(slug)     { return `chat:team:${slug}:summary:v1`; }
function lastKnownKey(slug) { return `chat:team:${slug}:lastKnown:v1`; }
function genLockKey(slug)   { return `chat:team:${slug}:genLock`; }
function forceLockKey(slug) { return `chat:team:${slug}:forceLock`; }

function getPstDate() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function buildPayload(data) {
  const { team, schedule, ats, teamNews, rank, tier, titleOdds = null, nextGameLine = null } = data;

  // Results are stated from this team's side (W/L, its score first) so the
  // model never has to guess who won from a bare "99–78".
  const recentResults = (schedule.recent || []).slice(0, 5).map((g) => {
    const opp = g.opponent || 'Unknown';
    const us = parseInt(g.ourScore, 10);
    const them = parseInt(g.oppScore, 10);
    if (isNaN(us) || isNaN(them)) return { opponent: opp, result: null, score: null };
    return {
      opponent: opp,
      result: us > them ? 'W' : us < them ? 'L' : 'T',
      teamScore: us,
      opponentScore: them,
      site: g.homeAway === 'home' ? 'home' : g.homeAway === 'away' ? 'away' : null,
    };
  });

  const upcomingGames = (schedule.upcoming || []).slice(0, 3).map((g) => ({
    opponent: g.opponent || 'TBD',
    date: (g.date || g.gameDate || '').slice(0, 10) || null,
    site: g.homeAway === 'home' ? 'home' : g.homeAway === 'away' ? 'away' : null,
  }));

  const atsRec = ats?.last7 || ats?.last30 || ats?.season || null;
  const atsSummary = atsRec
    ? { wl: `${atsRec.w ?? 0}-${atsRec.l ?? 0}`, coverPct: atsRec.coverPct ?? null, total: atsRec.total ?? null }
    : null;

  const headlines = (teamNews || []).slice(0, 4).map((h) => ({
    title: typeof h === 'string' ? h : (h.title || ''),
    source: h.source || null,
  }));

  return {
    dateNow: getPstDate(),
    team: team?.name ?? 'Unknown',
    conference: team?.conference ?? null,
    nationalRank: rank != null ? `#${rank}` : 'Unranked',   // national poll, not conference standing
    bracketTier: tier ?? null,
    recentResults,       // last 5 finals, newest first: { opponent, result: W|L, teamScore, opponentScore, site }
    upcomingGames,       // next 3
    atsSummary,          // { wl, coverPct, total } or null
    titleOdds,           // { odds: '+750', impliedPct } or null — national title price
    nextGameLine,        // { home, away, spread, total } or null — line for the next game
    headlines,           // top 4 team news items
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

function _isInTournamentWindow() {
  const d = new Date().toISOString().slice(0, 10);
  const n = _toDateNum(d);
  return n >= _toDateNum(T_SELECTION_SUNDAY) && n <= _toDateNum(T_TOURNAMENT_END);
}

function _getTournamentPhaseLabel() {
  const d = new Date().toISOString().slice(0, 10);
  const n = _toDateNum(d);
  if (n >= _toDateNum(T_SELECTION_SUNDAY) && n < _toDateNum(T_FIRST_FOUR_START)) return 'pre-tournament (bracket set)';
  if (n >= _toDateNum(T_FIRST_FOUR_START) && n < _toDateNum(T_FIRST_ROUND_START)) return 'First Four';
  if (n >= _toDateNum(T_FIRST_ROUND_START) && n <= _toDateNum(T_SECOND_ROUND_END)) return 'First/Second Round';
  if (n >= _toDateNum(T_SWEET_16_START) && n <= _toDateNum(T_ELITE_EIGHT_END)) return 'Sweet 16 / Elite Eight';
  if (n === _toDateNum(T_FINAL_FOUR)) return 'Final Four';
  if (n >= _toDateNum(T_CHAMPIONSHIP) && n <= _toDateNum(T_TOURNAMENT_END)) return 'National Championship';
  return null;
}

function buildPrompt(data) {
  const payload = buildPayload(data);
  const hasAts = payload.atsSummary != null;
  const atsInstruction = hasAts
    ? `ATS record: ${payload.atsSummary.wl}${payload.atsSummary.coverPct != null ? ` (${payload.atsSummary.coverPct}% cover)` : ''}. Use bettor language.`
    : 'There is no ATS record for this team yet. Use this paragraph for the market view instead: titleOdds and nextGameLine if present, otherwise recent margins from recentResults.';

  const isTournament = _isInTournamentWindow();
  const tournamentPhaseLabel = _getTournamentPhaseLabel();

  const tournamentContext = isTournament
    ? `\n\nIMPORTANT: We are in the ${tournamentPhaseLabel} phase of the NCAA tournament. Frame this team's insight with March Madness awareness. If the team made the tournament, reference their seed and tournament matchup context. If they were eliminated, note it. If they didn't make the tournament, frame them around NIT/off-season context. Do NOT use regular-season filler language — use tournament framing.`
    : '';

  const p1 = isTournament
    ? '¶1 TOURNAMENT STATUS: Team name, tournament seed (if applicable from bracketTier), conference, and recent form. Frame in tournament context — are they a contender, Cinderella, or early exit risk? If titleOdds is present, state the title price exactly. Include ONE approved quote if natural.'
    : '¶1 IDENTITY + FORM: Team name, national ranking (nationalRank is the national poll, not a conference position), conference, bracket tier, and recent results (recentResults is newest first; result is W or L from this team\'s side, with teamScore listed before opponentScore). If titleOdds is present, state the national title price exactly (e.g. "+750") with its implied probability. Include ONE quote from the approved list if it fits naturally.';

  const p3 = isTournament
    ? '¶3 TOURNAMENT MATCHUP: First opponent from upcomingGames. Frame as a tournament betting setup — seed matchup and, if nextGameLine is present for that opponent, its spread and total exactly as given. If eliminated or no tournament game, note their season is over or discuss NIT/offseason outlook.'
    : '¶3 NEXT GAME: First opponent from upcomingGames. Frame it as a betting setup. If nextGameLine is present and is for that opponent, quote its spread and total exactly as given. If there is no line, preview the matchup without mentioning lines.';

  const p4 = isTournament
    ? '¶4 TOURNAMENT CLOSER: 1–3 headlines from headlines[]. End with a tournament-aware hook — bracket implications, upset potential, or what this team needs to do to advance.'
    : '¶4 NEWS + CLOSER: 1–3 headlines from headlines[]. Punchy closing hook.';

  const systemPrompt = `You are a sharp, witty college basketball analyst for Maximus Sports. Write a concise team insight using ONLY the JSON data provided. DO NOT invent facts.${tournamentContext}

FORMAT — exactly 4 short paragraphs (no headers):

${p1}

¶2 ATS ANALYSIS: ${atsInstruction}. Use bettor language: "covering the number", "market hasn't caught up", "priced aggressively", "sharp money has noticed". Include cover % if available.

${p3}

${p4}

STYLE RULES:
- Target 140–200 words (hard limit: 220 words).
- Bold (**text**) only 1–2 team names or one key phrase per paragraph — never full sentences.
- Max 1 emoji per paragraph from: 🔥 😬 👀 🚨 🏆
- Conversational, confident, bettor-friendly. Zero profanity.
- APPROVED QUOTES (at most ONE total): ${APPROVED_QUOTES}
- NEVER use: "Stay humble. Stay hungry." or anything not in the approved list.${isTournament ? '\n- Use tournament language: "seed", "bracket", "upset", "advancing", "eliminated", "March Madness", "Cinderella".\n- NEVER use regular-season filler like "quiet day on the hardwood".' : ''}`;

  const userPrompt = `DATA:\n${JSON.stringify(payload, null, 2)}\n\nWrite the team insight now. Exactly 4 paragraphs, no headers.`;
  return { systemPrompt, userPrompt };
}

async function generateWithClaude(systemPrompt, userPrompt) {
  if (!isClaudeConfigured()) {
    if (isDev) console.warn('[chat/teamSummary] ANTHROPIC_API_KEY not set');
    return null;
  }
  try {
    return await claudeComplete({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: MAX_TOKENS,
      timeoutMs: LLM_TIMEOUT,
    });
  } catch (err) {
    console.error('[chat/teamSummary] Claude error', err?.message);
    return null;
  }
}

async function readCached(slug) {
  const fKey = freshKey(slug);
  const lKey = lastKnownKey(slug);
  const fresh = await getJson(fKey).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) return { summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt };
  }
  const lk = await getJson(lKey).catch(() => null);
  if (lk?.summary) return { summary: lk.summary, status: 'stale', generatedAt: lk.generatedAt };
  return null;
}

async function generateAndCache(slug) {
  const data = await buildTeamSummaryData(slug);
  const { systemPrompt, userPrompt } = buildPrompt(data);
  const summary = await generateWithClaude(systemPrompt, userPrompt);
  if (summary) {
    const payload = { summary, generatedAt: new Date().toISOString() };
    await Promise.all([
      setJson(freshKey(slug), payload, { exSeconds: FRESH_TTL_SEC }),
      setJson(lastKnownKey(slug), payload, { exSeconds: LASTKNOWN_TTL_SEC }),
    ]).catch((e) => console.warn('[chat/teamSummary] KV write error', e?.message));
    if (isDev) console.log('[chat/teamSummary] generated + wrote KV for', slug);
  }
  return summary;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const teamSlug = getQueryParam(req, 'teamSlug', '');
  if (!teamSlug?.trim()) return res.status(400).json({ error: 'teamSlug is required' });
  const slug = teamSlug.trim().toLowerCase();

  const force = getQueryParam(req, 'force') === '1';
  const bg    = getQueryParam(req, 'bg') === '1';

  // ── force=1: rate-limited inline generation ───────────────────────────────
  if (force) {
    const gotForceLock = await tryAcquireLock(forceLockKey(slug), FORCE_LOCK_TTL_SEC);
    if (!gotForceLock) {
      if (isDev) console.log('[chat/teamSummary] force rate-limited', slug);
      const cached = await readCached(slug);
      return res.status(200).json({
        summary: cached?.summary ?? null,
        status: cached?.status ?? 'missing',
        generatedAt: cached?.generatedAt ?? null,
        rateLimited: true,
      });
    }
    if (isDev) console.log('[chat/teamSummary] force=1, generating for', slug);
    let summary = null;
    try {
      summary = await generateAndCache(slug);
    } catch (err) {
      console.error('[chat/teamSummary] force generate error', err?.message);
    }
    if (summary) return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
    const fallback = await readCached(slug);
    return res.status(200).json({
      summary: fallback?.summary ?? null,
      status: fallback?.status ?? 'missing',
      generatedAt: fallback?.generatedAt ?? null,
    });
  }

  // ── Normal path: read KV tiers ────────────────────────────────────────────
  const fKey = freshKey(slug);
  const lKey = lastKnownKey(slug);

  const fresh = await getJson(fKey).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) {
      if (isDev) console.log('[chat/teamSummary] fresh hit', slug, { ageSec: Math.round(ageMs / 1000) });
      return res.status(200).json({ summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt });
    }
  }

  const lastKnown = await getJson(lKey).catch(() => null);

  // Kick background generation with genLock to prevent stampede
  if (!bg) {
    tryAcquireLock(genLockKey(slug), GEN_LOCK_TTL_SEC).then((acquired) => {
      if (!acquired) {
        if (isDev) console.log('[chat/teamSummary] bg already running', slug);
        return;
      }
      if (isDev) console.log('[chat/teamSummary] kicking bg generate for', slug);
      generateAndCache(slug).catch(() => {});
    }).catch(() => {});
  }

  if (lastKnown?.summary) {
    if (isDev) console.log('[chat/teamSummary] lastKnown hit', slug);
    return res.status(200).json({ summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt });
  }

  if (isDev) console.log('[chat/teamSummary] missing', slug);
  return res.status(200).json({ summary: null, status: 'missing' });
}
