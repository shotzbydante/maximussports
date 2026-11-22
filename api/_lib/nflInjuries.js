/**
 * NFL injury report — ESPN's league-wide injuries feed, trimmed to what the
 * app shows: who is out, doubtful, questionable or on injured reserve.
 *
 * The power ratings are built from results and know nothing about who is
 * playing this week. This module exists so the rest of the app can say so
 * honestly: game cards show how many players each side is missing, team
 * pages list the report, and the picks builder holds a game to tracking
 * when a quarterback carries a game-week Out or Doubtful tag.
 *
 * The raw feed is several megabytes, so only the trimmed result is cached.
 */

import { createCache, coalesce } from '../_cache.js';
import { getJson, setJson } from '../_globalCache.js';
import { getNflTeamByEspnId, resolveNflTeam } from '../../src/sports/nfl/teams.js';

const ESPN_INJURIES = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
const FETCH_TIMEOUT_MS = 12_000;
const MEMO_TTL_MS = 20 * 60 * 1000;
const KV_KEY = 'nfl:injuries:v1';
const KV_TTL_SEC = 30 * 60;
const CACHE_KEY = 'nfl:injuries';

const cache = createCache(MEMO_TTL_MS);

/** Most severe first; used for sorting and for the summary counts. */
export const INJURY_STATUS_ORDER = ['out', 'doubtful', 'ir', 'questionable', 'other'];

const STATUS_LABEL = {
  out: 'Out',
  doubtful: 'Doubtful',
  questionable: 'Questionable',
  ir: 'Injured reserve',
  other: 'Other',
};

/** ESPN status → one of INJURY_STATUS_ORDER, or null for a healthy player. */
export function normalizeInjuryStatus(item) {
  const name = String(item?.type?.name || '').toUpperCase();
  const text = String(item?.status || item?.type?.description || '').toLowerCase();
  if (name.endsWith('_ACTIVE') || text === 'active') return null;
  if (name.endsWith('_OUT') || text === 'out') return 'out';
  if (name.endsWith('_DOUBTFUL') || text === 'doubtful') return 'doubtful';
  if (name.endsWith('_QUESTIONABLE') || text === 'questionable') return 'questionable';
  if (name.includes('_IR') || text.includes('injured reserve')) return 'ir';
  return 'other';
}

function clip(text, max) {
  const t = String(text || '').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function bodyPart(details) {
  const t = String(details?.type || '').trim();
  return t && t.toLowerCase() !== 'not specified' ? t : null;
}

/**
 * @param {object} json — raw ESPN injuries response
 * @returns {{ teams: Record<string, Array<object>> }} keyed by team slug
 */
export function parseInjuries(json) {
  const teams = {};
  for (const entry of json?.injuries || []) {
    const team = getNflTeamByEspnId(entry?.id) || resolveNflTeam(entry?.displayName);
    if (!team) continue;
    const list = [];
    for (const item of entry?.injuries || []) {
      const status = normalizeInjuryStatus(item);
      const name = item?.athlete?.displayName;
      if (!status || !name) continue;
      list.push({
        id: String(item.id || `${team.slug}-${name}`),
        name,
        position: item.athlete?.position?.abbreviation || null,
        status,
        statusLabel: status === 'other' ? (item.status || STATUS_LABEL.other) : STATUS_LABEL[status],
        injury: bodyPart(item.details),
        returnDate: item.details?.returnDate || null,
        comment: clip(item.shortComment, 180) || null,
        updatedAt: item.date || null,
      });
    }
    list.sort((a, b) =>
      INJURY_STATUS_ORDER.indexOf(a.status) - INJURY_STATUS_ORDER.indexOf(b.status)
      || String(a.name).localeCompare(String(b.name)));
    teams[team.slug] = list;
  }
  return { teams };
}

/**
 * Counts for one team, plus any quarterback with a game-week Out or
 * Doubtful tag. Injured reserve is left out of the quarterback flag: those
 * absences are weeks old and already in both the results and the line.
 */
export function summarizeTeamInjuries(list = []) {
  const summary = {
    out: 0, doubtful: 0, questionable: 0, ir: 0, other: 0, total: list.length,
    quarterbacks: [],
    // Every listed quarterback with a raw status key. The picks engine uses
    // this to tell a starter from a backup and "out" from "in doubt".
    quarterbackStatuses: [],
  };
  for (const p of list) {
    if (summary[p.status] != null) summary[p.status] += 1;
    if (p.position !== 'QB') continue;
    summary.quarterbackStatuses.push({ name: p.name, status: p.status });
    if (p.status === 'out' || p.status === 'doubtful') {
      summary.quarterbacks.push({ name: p.name, status: p.statusLabel });
    }
  }
  return summary;
}

/**
 * @returns {Promise<{ teams: Record<string, Array<object>>, generatedAt: string|null, ok: boolean, stale?: boolean }>}
 */
export async function getNflInjuries() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    const result = await coalesce(CACHE_KEY, async () => {
      const fromKv = await getJson(KV_KEY).catch(() => null);
      if (fromKv?.teams && fromKv.generatedAt
        && Date.now() - Date.parse(fromKv.generatedAt) < KV_TTL_SEC * 1000) {
        return fromKv;
      }
      const r = await fetch(ESPN_INJURIES, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!r.ok) throw new Error(`ESPN NFL injuries: ${r.status}`);
      const parsed = parseInjuries(await r.json());
      if (Object.keys(parsed.teams).length === 0) throw new Error('ESPN NFL injuries: empty');
      const fresh = { ...parsed, generatedAt: new Date().toISOString(), ok: true };
      setJson(KV_KEY, fresh, { exSeconds: KV_TTL_SEC * 4 }).catch(() => {});
      return fresh;
    });
    cache.set(CACHE_KEY, result);
    return result;
  } catch (err) {
    const stale = cache.getMaybeStale(CACHE_KEY);
    if (stale?.value) return { ...stale.value, stale: true };
    const lastKnown = await getJson(KV_KEY).catch(() => null);
    if (lastKnown?.teams) return { ...lastKnown, stale: true };
    return { teams: {}, generatedAt: null, ok: false, error: err?.message };
  }
}

/** Attach `{ away, home }` injury summaries to each game that has not finished. */
export function attachInjuries(games, injuries) {
  if (!injuries?.teams || Object.keys(injuries.teams).length === 0) return games;
  // `ok` tells the picks engine the report loaded. A team with nobody
  // listed gets an empty summary, not null: "no injuries" and "no report"
  // must not look the same, because a missing report holds picks.
  const side = (slug) => (slug ? summarizeTeamInjuries(injuries.teams[slug] || []) : null);
  return games.map((g) => {
    if (g?.gameState?.isFinal || g?.status === 'final') return g;
    const away = side(g.teams?.away?.slug);
    const home = side(g.teams?.home?.slug);
    return {
      ...g,
      injuries: { away, home, ok: true, stale: !!injuries.stale, generatedAt: injuries.generatedAt || null },
    };
  });
}
