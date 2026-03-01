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
import { ytSearch, ytVideosDetails, scoreItem, isItemAllowlisted } from './_yt.js';
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
 * Diversity pass: prevent ESPN from occupying more than half the top results
 * when other quality content is available.
 * Swaps the lowest-ranked ESPN item in the top slice for the best non-ESPN
 * item from the remainder. Deterministic; no randomness.
 *
 * @param {Array} sorted  Full sorted list (scored, descending)
 * @param {number} maxN   Number of items to return
 * @returns {Array}       Top-N items with diversity applied
 */
function diversityPass(sorted, maxN) {
  const top = sorted.slice(0, maxN);
  const rest = sorted.slice(maxN);
  if (rest.length === 0) return top;

  const espnInTop = top.filter(
    (i) => (i.channelTitle ?? '').toLowerCase().includes('espn'),
  ).length;

  // Only intervene when ESPN fills strictly more than half of the top slots
  if (espnInTop <= Math.ceil(maxN / 2)) return top;

  const bestNonEspn = rest.find(
    (i) => !(i.channelTitle ?? '').toLowerCase().includes('espn'),
  );
  if (!bestNonEspn) return top;

  // Swap the lowest-ranked ESPN item in the top slice
  const lastEspnIdx = [...top.keys()].reverse().find(
    (idx) => (top[idx].channelTitle ?? '').toLowerCase().includes('espn'),
  );
  if (lastEspnIdx == null) return top;

  const result = top.slice();
  result[lastEspnIdx] = bestNonEspn;
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
  // q1: primary highlights query (always)
  const q1 = `${team.name} basketball highlights`;

  // q2: conference network OR opponent match OR postgame fallback
  // Conference network query surfaces SEC/ACC/BTN content before ESPN dominates
  const confNetwork = getConferenceNetwork(team.conference);
  let q2;
  if (opponent && mode === 'today') {
    q2 = `${team.name} vs ${opponent.name} highlights`;
  } else if (confNetwork) {
    q2 = `${team.name} ${confNetwork} highlights`;
  } else {
    q2 = `${team.name} postgame interview OR press conference OR highlights`;
  }

  if (debug) {
    console.log(`[api/youtube/team] teamSlug=${teamSlug} conf=${team.conference ?? 'n/a'} q1="${q1}" q2="${q2}"`);
  }

  // ── Fetch both queries in parallel ────────────────────────────────────────
  let raw1 = [];
  let raw2 = [];

  try {
    [raw1, raw2] = await Promise.all([
      ytSearch({ q: q1, maxResults: MAX_MAX, debug }).catch((err) => {
        console.error('[api/youtube/team] q1 failed:', err.message);
        return [];
      }),
      ytSearch({ q: q2, maxResults: MAX_MAX, debug }).catch((err) => {
        console.error('[api/youtube/team] q2 failed:', err.message);
        return [];
      }),
    ]);
  } catch (err) {
    console.error('[api/youtube/team] unexpected error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch videos' });
  }

  // ── Merge, deduplicate, score, sort ───────────────────────────────────────
  const merged = dedupeById([...raw1, ...raw2]);
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

  // ── Diversity pass → cap → ensure allowlisted item leads ─────────────────
  const diverse = diversityPass(withScores, maxResults);
  const promoted = promoteAllowlisted(diverse);
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
      { q: q1, weight: 100 },
      { q: q2, weight: 90 },
    ],
    counts: { q1: raw1.length, q2: raw2.length, merged: merged.length },
    allowlistHits,
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
