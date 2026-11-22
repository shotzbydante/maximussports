/**
 * GET /api/nba/chat/homeSummary?force=0|1
 *
 * The NBA brief on the home page: what is on tonight, where our picks
 * stand, and what the numbers say. Returns { brief, summary, status, generatedAt }.
 *
 *   brief    structured: { headline, dek, now[], next[], numbers[], take, also, source }
 *   summary  the same brief as plain paragraphs, for the email and older callers
 *
 * How it stays current (the same rules as the NFL brief):
 *   - A cached brief is only "fresh" while the slate looks the way it did
 *     when the brief was written (same counts of live, finished and unplayed
 *     games, same picks) and for a few minutes at most while games are on.
 *   - When it is not fresh, this request writes a new one before answering.
 *     Regenerating after the response does not work on Vercel: the function
 *     is frozen once it replies, which is how a brief written the night
 *     before was still the lead at tip-off the next day.
 *   - The brief is built from facts first (api/_lib/nbaBrief.js): tonight's
 *     games with their lines, and our picks with their reasons. Claude
 *     rewrites it in Maximus's voice; if that call fails or the reply does
 *     not check out against the data, the factual brief is served instead.
 */

import { getJson, setJson, tryAcquireLock } from '../../_globalCache.js';
import { getQueryParam } from '../../_requestUrl.js';
import { claudeComplete, isClaudeConfigured } from '../../_lib/claude.js';
import { fetchScoreboard } from '../live/_normalize.js';
import { enrichGamesWithOdds } from '../live/_odds.js';
import { buildNbaPicksBoard } from '../../_lib/nbaPicksBuilder.js';
import { loadNbaChampionshipOdds } from '../odds/championship.js';
import { loadNbaHeadlines } from '../news/headlines.js';
import {
  buildNbaBriefData, buildNbaEngineBrief, nbaBriefPrompt, parseNbaBrief, nbaBriefToText, nbaBriefSignature,
} from '../../_lib/nbaBrief.js';

const FRESH_KEY      = 'chat:nba:home:brief:v2';
// The daily email reads these two; they keep getting the brief as text.
const EMAIL_FRESH_KEY     = 'chat:nba:home:summary:v1';
const EMAIL_LASTKNOWN_KEY = 'chat:nba:home:lastKnown:v1';
const GEN_LOCK_KEY   = 'chat:nba:home:briefLock';
const FORCE_LOCK_KEY = 'chat:nba:home:forceLock';

const TTL_LIVE_SEC      = 6 * 60;      // games are on: the story moves
const TTL_QUIET_SEC     = 20 * 60;
const TTL_FALLBACK_SEC  = 2 * 60;      // the model call failed: try again soon
const KEEP_SEC          = 6 * 3600;    // how long a brief stays readable as a stand-in
const EMAIL_FRESH_SEC     = 15 * 60;
const EMAIL_LASTKNOWN_SEC = 72 * 3600;
const GEN_LOCK_TTL_SEC  = 45;
const FORCE_LOCK_TTL_SEC = 45;

const MAX_TOKENS = 1500;
const LLM_BUDGET = 24000;   // ms for the model, across attempts

async function loadSlate() {
  let games = await fetchScoreboard();
  try { games = await enrichGamesWithOdds(games); } catch (err) { console.warn('[nba/chat/homeSummary] odds', err?.message); }
  return games;
}

async function gather(games, board) {
  const [champR, headlinesR] = await Promise.allSettled([loadNbaChampionshipOdds(), loadNbaHeadlines()]);
  return buildNbaBriefData({
    games,
    board,
    champOdds: champR.status === 'fulfilled' ? champR.value || {} : {},
    headlines: headlinesR.status === 'fulfilled' ? headlinesR.value?.headlines || [] : [],
  });
}

async function writeWithClaude(data, base) {
  if (!isClaudeConfigured()) return null;
  const { system, user } = nbaBriefPrompt(data, base);
  const started = Date.now();
  // The reader is waiting on this request, so the whole thing gets one
  // budget. A second try only happens when the first came back quickly and
  // unusable; a slow call falls back to the factual brief.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = LLM_BUDGET - (Date.now() - started);
    if (left < 8000) break;
    try {
      const raw = await claudeComplete({ system, user, maxTokens: MAX_TOKENS, timeoutMs: left });
      const brief = parseNbaBrief(raw, data);
      if (brief) return brief;
      console.warn('[nba/chat/homeSummary] model reply did not check out against the data, attempt', attempt);
    } catch (err) {
      console[err?.code === 'timeout' ? 'warn' : 'error']('[nba/chat/homeSummary] Claude', err?.message);
      return null;
    }
  }
  return null;
}

function ttlFor(record, liveNow) {
  if (record.brief?.source !== 'claude' && isClaudeConfigured()) return TTL_FALLBACK_SEC;
  return liveNow ? TTL_LIVE_SEC : TTL_QUIET_SEC;
}

function isFresh(record, sig, liveNow) {
  if (!record?.brief || !record.generatedAt || record.sig !== sig) return false;
  return Date.now() - new Date(record.generatedAt).getTime() < ttlFor(record, liveNow) * 1000;
}

async function generate(games, board, sig) {
  const data = await gather(games, board);
  const base = buildNbaEngineBrief(data);
  const brief = (await writeWithClaude(data, base)) || base;
  const record = { brief, summary: nbaBriefToText(brief, data), generatedAt: new Date().toISOString(), sig };
  const forEmail = { summary: record.summary, generatedAt: record.generatedAt };
  // Preview deployments share production's KV and have no Claude key, so a
  // preview only ever writes the factual brief. It must not become the text
  // the daily email sends.
  const writes = [setJson(FRESH_KEY, record, { exSeconds: KEEP_SEC })];
  if (process.env.VERCEL_ENV !== 'preview') {
    writes.push(
      setJson(EMAIL_FRESH_KEY, forEmail, { exSeconds: EMAIL_FRESH_SEC }),
      setJson(EMAIL_LASTKNOWN_KEY, forEmail, { exSeconds: EMAIL_LASTKNOWN_SEC }),
    );
  }
  await Promise.all(writes).catch((e) => console.warn('[nba/chat/homeSummary] KV write error', e?.message));
  return record;
}

const reply = (res, record, status, extra = {}) => res.status(200).json({
  brief: record?.brief ?? null,
  summary: record?.summary ?? null,
  status: record ? status : 'missing',
  generatedAt: record?.generatedAt ?? null,
  ...extra,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const force = getQueryParam(req, 'force') === '1';
  let games = [];
  let board = null;
  try {
    const [gamesR, boardR] = await Promise.allSettled([loadSlate(), buildNbaPicksBoard()]);
    if (gamesR.status === 'fulfilled') games = gamesR.value || [];
    if (boardR.status === 'fulfilled') board = boardR.value?.board || null;
  } catch (err) { console.error('[nba/chat/homeSummary] slate', err?.message); }

  const sig = nbaBriefSignature(games, board);
  const liveNow = games.some((g) => g.status === 'live');
  const cached = await getJson(FRESH_KEY).catch(() => null);

  if (force) {
    const gotForceLock = await tryAcquireLock(FORCE_LOCK_KEY, FORCE_LOCK_TTL_SEC).catch(() => false);
    if (!gotForceLock) return reply(res, cached, isFresh(cached, sig, liveNow) ? 'fresh' : 'stale', { rateLimited: true });
  } else if (isFresh(cached, sig, liveNow)) {
    return reply(res, cached, 'fresh');
  }

  // Out of date. Write a new one now, unless another request already is.
  const gotLock = force || await tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC).catch(() => false);
  if (gotLock) {
    try {
      const record = await generate(games, board, sig);
      if (record) return reply(res, record, 'fresh');
    } catch (err) { console.error('[nba/chat/homeSummary] generate error', err?.message); }
  }

  // Someone else is writing it, or writing failed. A brief from the same
  // state of the slate is a fair stand-in; an older one is not, so serve the
  // factual brief instead of last night's lead.
  if (cached?.sig === sig) return reply(res, cached, 'stale');
  try {
    const data = await gather(games, board);
    const brief = buildNbaEngineBrief(data);
    return reply(res, { brief, summary: nbaBriefToText(brief, data), generatedAt: new Date().toISOString() }, 'engine');
  } catch (err) {
    console.error('[nba/chat/homeSummary] engine brief error', err?.message);
    return reply(res, null, 'missing');
  }
}
