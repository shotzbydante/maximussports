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

  // ── Build queries ─────────────────────────────────────────────────────────
  const q1 = `${team.name} basketball highlights`;
  const q2 = (opponent && mode === 'today')
    ? `${team.name} vs ${opponent.name} highlights`
    : `${team.name} postgame interview OR press conference OR highlights`;

  if (debug) {
    console.log(`[api/youtube/team] teamSlug=${teamSlug} q1="${q1}" q2="${q2}"`);
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

  if (debug) {
    const allowlistHits = withScores.filter((i) => isItemAllowlisted(i)).length;
    console.log(
      `[api/youtube/team] merged=${merged.length} allowlistHits=${allowlistHits}`,
      `topScores=${withScores.slice(0, 3).map((i) => `${i._score}:"${i.title.slice(0, 40)}"`).join(', ')}`,
    );
  }

  // ── Cap, ensure allowlisted item leads ────────────────────────────────────
  const capped = withScores.slice(0, maxResults);
  const promoted = promoteAllowlisted(capped);
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

  return res.status(200).json({
    status:    'ok',
    teamSlug,
    teamName:  team.name,
    updatedAt: new Date().toISOString(),
    items,
  });
}
