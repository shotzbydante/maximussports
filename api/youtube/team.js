/**
 * Team video feed endpoint.
 * GET /api/youtube/team?teamSlug=...&opponentSlug=...&mode=recent&maxResults=6&debugYT=1
 *
 * Query params:
 *   teamSlug     (required) — slug matching data/teams.js
 *   opponentSlug (optional) — slug of opponent team
 *   mode         (optional) — "today" | "recent" (default "recent")
 *   maxResults   (optional) — 1–10, default 6
 *   debugYT      (optional) — "1" to enable server-side debug logging
 *
 * Response 200:
 *   { status:"ok", teamSlug, teamName, updatedAt, items:[...] }
 *
 * Response 400 / 500:
 *   { status:"error", message }
 *
 * Cached at CDN for 1 hour (stale-while-revalidate 24 h).
 */

import { TEAMS } from '../../data/teams.js';
import { ytSearch, ytVideosDetails, scoreItem, isItemAllowlisted, isBasketballItem, classifyBasketballItem } from './_yt.js';
import { getConferenceNetwork } from './_conferenceNetworks.js';

const DEFAULT_MAX = 6;
const MIN_MAX     = 1;
const MAX_MAX     = 10;

function resolveTeam(slug) {
  return TEAMS.find((t) => t.slug === slug) ?? null;
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.videoId)) return false;
    seen.add(item.videoId);
    return true;
  });
}

/**
 * If any allowlisted item exists in the list, ensure index 0 is allowlisted
 * by swapping the first allowlisted item into position 0.
 * All other items retain their relative sort order.
 */
function promoteAllowlisted(items) {
  const firstIdx = items.findIndex((item) => isItemAllowlisted(item));
  if (firstIdx <= 0) return items; // already first, or none exist
  const result = items.slice();
  const [promoted] = result.splice(firstIdx, 1);
  result.unshift(promoted);
  return result;
}

/**
 * Filter an array of items to men's basketball-only content, returning the filtered list
 * plus counts for debug output.
 *
 * @param {Array} items
 * @returns {{ items: Array, footballCount: number, womenCount: number, noBballCount: number }}
 */
function filterBasketball(items) {
  let footballCount = 0;
  let womenCount   = 0;
  let noBballCount = 0;
  const filtered = items.filter((item) => {
    const reason = classifyBasketballItem(item);
    if (reason === 'accept') return true;
    if (reason === 'football') footballCount++;
    else if (reason === 'women') womenCount++;
    else noBballCount++;
    return false;
  });
  return { items: filtered, footballCount, womenCount, noBballCount };
}

/**
 * Diversity pass: prevent ESPN from dominating the top results when quality
 * non-ESPN content is available.
 *
 * Quality guard: only swap if the best non-ESPN candidate has:
 *   score >= MIN_CANDIDATE_SCORE (55)  AND
 *   score >= lowestEspnScore - MAX_SCORE_DELTA (15)
 *
 * @param {Array}  sorted     Full scored+sorted list (descending)
 * @param {number} maxN       How many items to return
 * @param {Object} [dbg={}]   Mutable object for debug output
 * @returns {Array}
 */
const DIVERSITY_MIN_SCORE   = 55;
const DIVERSITY_MAX_DELTA   = 15;

function diversityPass(sorted, maxN, dbg = {}) {
  const top  = sorted.slice(0, maxN);
  const rest = sorted.slice(maxN);

  dbg.swapOccurred = false;
  dbg.swapReason   = 'no_action';

  if (rest.length === 0) {
    dbg.swapReason = 'rest_empty';
    return top;
  }

  const espnInTop = top.filter(
    (i) => (i.channelTitle ?? '').toLowerCase().includes('espn'),
  ).length;

  // Only intervene when ESPN fills strictly more than half of the top slots
  if (espnInTop <= Math.ceil(maxN / 2)) {
    dbg.swapReason = `espn_share_ok(${espnInTop}/${maxN})`;
    return top;
  }

  const lowestEspnIdx = [...top.keys()].reverse().find(
    (idx) => (top[idx].channelTitle ?? '').toLowerCase().includes('espn'),
  );
  const lowestEspnScore = top[lowestEspnIdx]?._score ?? 0;

  const bestNonEspn = rest.find(
    (i) => !(i.channelTitle ?? '').toLowerCase().includes('espn'),
  );

  if (!bestNonEspn) {
    dbg.swapReason = 'no_non_espn_candidate';
    return top;
  }

  // Quality guard: do not swap in low-quality content just to reduce ESPN share
  if (
    bestNonEspn._score < DIVERSITY_MIN_SCORE
    || bestNonEspn._score < lowestEspnScore - DIVERSITY_MAX_DELTA
  ) {
    dbg.swapReason = `quality_guard_blocked(nonEspn=${bestNonEspn._score},lowestEspn=${lowestEspnScore})`;
    return top;
  }

  const result = top.slice();
  result[lowestEspnIdx] = bestNonEspn;
  dbg.swapOccurred = true;
  dbg.swapReason = `swapped[${lowestEspnIdx}]:espn(${lowestEspnScore})→${bestNonEspn.channelTitle}(${bestNonEspn._score})`;
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  // ── Params ────────────────────────────────────────────────────────────────
  const {
    teamSlug,
    opponentSlug,
    mode = 'recent',
    maxResults: rawMax,
    debugYT,
  } = req.query ?? {};

  const debug = debugYT === '1';
  const t0 = debug ? Date.now() : 0;

  if (!teamSlug || typeof teamSlug !== 'string') {
    return res.status(400).json({ status: 'error', message: 'Missing required param: teamSlug' });
  }

  const team = resolveTeam(teamSlug.trim());
  if (!team) {
    return res.status(400).json({ status: 'error', message: `Unknown teamSlug: ${teamSlug}` });
  }

  const opponent = opponentSlug ? resolveTeam(opponentSlug.trim()) : null;
  const parsedMax = parseInt(rawMax, 10);
  const maxResults = isNaN(parsedMax)
    ? DEFAULT_MAX
    : Math.min(MAX_MAX, Math.max(MIN_MAX, parsedMax));

  // ── Build query plan ──────────────────────────────────────────────────────
  // q1: primary highlights (always)
  const q1 = `${team.name} basketball highlights`;

  // q2: conference network if available → surfaces BTN/SEC/ACC before ESPN dominates
  const confNetwork = getConferenceNetwork(team.conference);
  let q2;
  if (opponent && mode === 'today') {
    q2 = `${team.name} vs ${opponent.name} basketball highlights`;
  } else if (confNetwork) {
    q2 = `${team.name} ${confNetwork} basketball`;
  } else {
    q2 = `${team.name} basketball postgame press conference`;
  }

  // q3: press conference / locker room content (small fetch to keep quota low)
  const q3 = `${team.name} basketball press conference postgame`;

  if (debug) {
    console.log(`[api/youtube/team] teamSlug=${teamSlug} conf=${team.conference ?? 'n/a'} q1="${q1}" q2="${q2}" q3="${q3}"`);
  }

  // ── Fetch all queries in parallel ─────────────────────────────────────────
  let raw1 = [];
  let raw2 = [];
  let raw3 = [];

  try {
    [raw1, raw2, raw3] = await Promise.all([
      ytSearch({ q: q1, maxResults: MAX_MAX, debug }).catch((err) => {
        console.error('[api/youtube/team] q1 failed:', err.message);
        return [];
      }),
      ytSearch({ q: q2, maxResults: MAX_MAX, debug }).catch((err) => {
        console.error('[api/youtube/team] q2 failed:', err.message);
        return [];
      }),
      ytSearch({ q: q3, maxResults: 8, debug }).catch((err) => {
        console.error('[api/youtube/team] q3 failed:', err.message);
        return [];
      }),
    ]);
  } catch (err) {
    console.error('[api/youtube/team] unexpected error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch videos' });
  }

  // ── Men's basketball-only filter ───────────────────────────────────────────
  const f1 = filterBasketball(raw1);
  const f2 = filterBasketball(raw2);
  const f3 = filterBasketball(raw3);
  const totalFootballFiltered = f1.footballCount + f2.footballCount + f3.footballCount;
  const totalWomenFiltered   = f1.womenCount   + f2.womenCount   + f3.womenCount;
  const totalNoBballFiltered = f1.noBballCount + f2.noBballCount + f3.noBballCount;

  if (debug) {
    console.log(`[api/youtube/team] filtered: football=${totalFootballFiltered} women=${totalWomenFiltered} noBball=${totalNoBballFiltered}`);
  }

  // ── Merge, deduplicate, score, sort ───────────────────────────────────────
  const merged = dedupeById([...f1.items, ...f2.items, ...f3.items]);
  const withScores = merged.map((item) => ({
    ...item,
    _score: scoreItem(item, team.name),
  }));
  withScores.sort((a, b) => b._score - a._score);

  const allowlistHits = debug ? withScores.filter((i) => isItemAllowlisted(i)).length : 0;

  if (debug) {
    console.log(
      `[api/youtube/team] merged=${merged.length} allowlistHits=${allowlistHits}`,
      `topScores=${withScores.slice(0, 3).map((i) => `${i._score}:"${i.title.slice(0, 40)}"`).join(', ')}`,
    );
  }

  // ── Diversity pass → ensure allowlisted item leads ────────────────────────
  const diversityDbg = {};
  const diverse   = diversityPass(withScores, maxResults, diversityDbg);
  const promoted  = promoteAllowlisted(diverse);
  const scored = promoted.map(({ _score: _s, ...item }) => item);

  // ── Enrich with durations (single videos.list call) ───────────────────────
  const videoIds = scored.map((i) => i.videoId);
  const details = await ytVideosDetails(videoIds, { debug });

  const items = scored.map((item) => ({
    ...item,
    durationSeconds: details[item.videoId]?.durationSeconds ?? null,
  }));

  if (debug) {
    console.log(`[api/youtube/team] completed in ${Date.now() - t0}ms, returning ${items.length} items`);
  }

  const debugOutput = debug ? {
    queryPlan: [
      { q: q1, maxResults: MAX_MAX },
      { q: q2, maxResults: MAX_MAX },
      { q: q3, maxResults: 8 },
    ],
    counts: {
      q1: raw1.length, q2: raw2.length, q3: raw3.length,
      merged: merged.length,
      filteredOutFootball:     totalFootballFiltered,
      filteredOutWomen:       totalWomenFiltered,
      filteredOutNoBballSignal: totalNoBballFiltered,
    },
    allowlistHits,
    diversity: diversityDbg,
    topScores: withScores.slice(0, 5).map((i) => ({
      title:        i.title.slice(0, 60),
      channelTitle: i.channelTitle,
      score:        i._score,
    })),
    elapsedMs: Date.now() - t0,
  } : undefined;

  return res.status(200).json({
    status:    'ok',
    teamSlug,
    teamName:  team.name,
    updatedAt: new Date().toISOString(),
    items,
    ...(debugOutput ? { _debug: debugOutput } : {}),
  });
}
