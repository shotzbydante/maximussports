/**
 * Team video feed endpoint.
 * GET /api/youtube/team?teamSlug=...&opponentSlug=...&mode=recent&maxResults=6
 *
 * Query params:
 *   teamSlug     (required) — slug matching data/teams.js
 *   opponentSlug (optional) — slug of opponent team
 *   mode         (optional) — "today" | "recent" (default "recent")
 *   maxResults   (optional) — 1–10, default 6
 *
 * Response 200:
 *   { status:"ok", teamSlug, teamName, updatedAt, items:[...] }
 *
 * Response 400:
 *   { status:"error", message }
 *
 * Response 500:
 *   { status:"error", message }
 *
 * Cached at CDN for 1 hour (stale-while-revalidate 24 h).
 */

import { TEAMS } from '../../data/teams.js';
import { ytSearch, scoreItem } from './_yt.js';

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
  } = req.query ?? {};

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

  let q2;
  if (opponent && mode === 'today') {
    q2 = `${team.name} vs ${opponent.name} highlights`;
  } else {
    q2 = `${team.name} postgame interview OR press conference OR highlights`;
  }

  // ── Fetch both queries in parallel ────────────────────────────────────────
  let raw1 = [];
  let raw2 = [];

  try {
    [raw1, raw2] = await Promise.all([
      ytSearch({ q: q1, maxResults: MAX_MAX }).catch((err) => {
        console.error('[api/youtube/team] q1 failed:', err.message);
        return [];
      }),
      ytSearch({ q: q2, maxResults: MAX_MAX }).catch((err) => {
        console.error('[api/youtube/team] q2 failed:', err.message);
        return [];
      }),
    ]);
  } catch (err) {
    console.error('[api/youtube/team] unexpected error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch videos' });
  }

  // ── Merge, deduplicate, score, sort, cap ──────────────────────────────────
  const merged = dedupeById([...raw1, ...raw2]);
  const scored = merged
    .map((item) => ({ ...item, _score: scoreItem(item, team.name) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults)
    .map(({ _score: _s, ...item }) => item); // strip internal score

  return res.status(200).json({
    status:    'ok',
    teamSlug,
    teamName:  team.name,
    updatedAt: new Date().toISOString(),
    items:     scored,
  });
}
