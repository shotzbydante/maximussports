/**
 * GET /api/nfl/chat/homeSummary?force=0|1
 *
 * The NFL brief on the home page: what is live, what is next, and what the
 * numbers say. Returns { brief, summary, status, generatedAt }.
 *
 *   brief    structured: { headline, dek, now[], next[], numbers[], take, also, source }
 *   summary  the same brief as plain paragraphs, for older callers
 *
 * How it stays current:
 *   - A cached brief is only "fresh" while the slate looks the way it did
 *     when the brief was written (same week, same count of live, finished
 *     and unplayed games) and for a few minutes at most while games are on.
 *   - When it is not fresh, this request writes a new one before answering.
 *     Regenerating after the response does not work on Vercel: the function
 *     is frozen once it replies, which is how a Thursday-night lead was still
 *     being served on Sunday afternoon.
 *   - The brief is built from facts first (api/_lib/nflBrief.js). Claude
 *     rewrites it in Maximus's voice; if that call fails or the reply does
 *     not check out against the data, the factual brief is served instead.
 */

import { getJson, setJson, tryAcquireLock } from '../../_globalCache.js';
import { getQueryParam } from '../../_requestUrl.js';
import { claudeComplete, isClaudeConfigured } from '../../_lib/claude.js';
import { getNflSlate } from '../../_lib/nflSlate.js';
import { getNflStandings } from '../../_lib/nflStandings.js';
import { loadNflHeadlines } from '../news/headlines.js';
import { getNflChampionshipOdds } from '../odds/championship.js';
import { getLatestNflPicksBoard } from '../../_lib/nflPicksBuilder.js';
import { getWeekPicksInPlay } from '../../_lib/nflWeekPicks.js';
import { getLineSnapshots } from '../../_lib/nflPicksStore.js';
import { buildBriefData, buildEngineBrief, briefPrompt, parseBrief, briefToText, briefSignature } from '../../_lib/nflBrief.js';

const FRESH_KEY      = 'chat:nfl:home:brief:v3';
const GEN_LOCK_KEY   = 'chat:nfl:home:briefLock';
const FORCE_LOCK_KEY = 'chat:nfl:home:forceLock';

const TTL_LIVE_SEC      = 6 * 60;      // games are on: the story moves
const TTL_QUIET_SEC     = 20 * 60;
const TTL_FALLBACK_SEC  = 2 * 60;      // the model call failed: try again soon
const KEEP_SEC          = 6 * 3600;    // how long a brief stays readable as a stand-in
const GEN_LOCK_TTL_SEC  = 45;
const FORCE_LOCK_TTL_SEC = 45;

const MAX_TOKENS  = 1500;
const LLM_BUDGET = 24000;   // ms for the model, across attempts

async function gather(slate) {
  const [standingsR, headlinesR, champR, boardR, weekR] = await Promise.allSettled([
    getNflStandings(),
    loadNflHeadlines(),
    getNflChampionshipOdds(),
    getLatestNflPicksBoard(),
    getWeekPicksInPlay(slate),
  ]);
  const ok = (r, pick, empty) => (r.status === 'fulfilled' ? pick(r.value) ?? empty : empty);
  const week = ok(weekR, (v) => v, { picks: [], closes: new Map() });
  // Closing lines for every started game, not only the ones we have a pick on.
  let closes = week.closes;
  const started = (slate?.games || []).filter((g) => g.status !== 'upcoming').map((g) => g.gameId);
  if (started.length > 0 && (!closes || closes.size === 0)) closes = await getLineSnapshots(started).catch(() => new Map());
  return buildBriefData({
    slate,
    standings: ok(standingsR, (v) => v?.teams, {}),
    headlines: ok(headlinesR, (v) => v?.headlines, []),
    champOdds: ok(champR, (v) => v?.odds, {}),
    board: ok(boardR, (v) => v, null),
    weekPicks: week.picks || [],
    closes: closes || new Map(),
  });
}

async function writeWithClaude(data, base) {
  if (!isClaudeConfigured()) return null;
  const { system, user } = briefPrompt(data, base);
  const started = Date.now();
  // The reader is waiting on this request, so the whole thing gets one
  // budget. A second try only happens when the first came back quickly and
  // unusable; a slow call falls back to the factual brief, which is retried
  // a couple of minutes later.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = LLM_BUDGET - (Date.now() - started);
    if (left < 8000) break;
    try {
      const raw = await claudeComplete({ system, user, maxTokens: MAX_TOKENS, timeoutMs: left });
      const brief = parseBrief(raw, data);
      if (brief) return brief;
      console.warn('[nfl/chat/homeSummary] model reply did not check out against the data, attempt', attempt);
    } catch (err) {
      console[err?.code === 'timeout' ? 'warn' : 'error']('[nfl/chat/homeSummary] Claude', err?.message);
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

async function generate(slate, sig) {
  if ((slate?.games || []).length === 0) return null;
  const data = await gather(slate);
  const base = buildEngineBrief(data);
  const brief = (await writeWithClaude(data, base)) || base;
  const record = { brief, summary: briefToText(brief, data), generatedAt: new Date().toISOString(), week: data.week, sig };
  await setJson(FRESH_KEY, record, { exSeconds: KEEP_SEC }).catch((e) => console.warn('[nfl/chat/homeSummary] KV write error', e?.message));
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
  let slate = null;
  try { slate = await getNflSlate(); } catch (err) { console.error('[nfl/chat/homeSummary] slate', err?.message); }
  const sig = briefSignature(slate);
  const liveNow = (slate?.games || []).some((g) => g.status === 'live');
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
      const record = await generate(slate, sig);
      if (record) return reply(res, record, 'fresh');
    } catch (err) { console.error('[nfl/chat/homeSummary] generate error', err?.message); }
  }

  // Someone else is writing it, or writing failed. A brief from the same
  // state of the slate is still a fair stand-in; an older one is not, so
  // serve the factual brief instead of yesterday's lead.
  if (cached?.sig === sig) return reply(res, cached, 'stale');
  try {
    const data = await gather(slate);
    const brief = buildEngineBrief(data);
    return reply(res, { brief, summary: briefToText(brief, data), generatedAt: new Date().toISOString() }, 'engine');
  } catch (err) {
    console.error('[nfl/chat/homeSummary] engine brief error', err?.message);
    return reply(res, null, 'missing');
  }
}
