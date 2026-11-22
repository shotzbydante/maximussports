/**
 * NFL standings — one fetch, shared by every endpoint that needs records.
 *
 * ESPN's default standings response groups all 16 teams of a conference
 * together with `playoffSeed` already resolved through the NFL tiebreaker
 * rules, so seeds are read straight from the feed and never re-derived.
 * Division rank is computed here from the team registry.
 */

import { createCache, coalesce } from '../_cache.js';
import { NFL_TEAMS, getNflTeamByEspnId, getNflTeamByAbbrev } from '../../src/sports/nfl/teams.js';

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings';
const FETCH_TIMEOUT_MS = 8000;
const cache = createCache(5 * 60 * 1000);
const CACHE_KEY = 'nfl:standings:v1';

function stat(stats, ...names) {
  for (const name of names) {
    const s = stats.find((x) => x.name === name || x.type === name);
    if (s) return s;
  }
  return null;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatRecord(w, l, t) {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export function parseStandings(data) {
  const teams = {};
  let season = null;

  for (const conf of data?.children || []) {
    const confAbbr = conf?.abbreviation || (/american/i.test(conf?.name || '') ? 'AFC' : /national/i.test(conf?.name || '') ? 'NFC' : null);
    if (season == null && conf?.standings?.season != null) season = conf.standings.season;

    // Entries sit directly under the conference by default; older and
    // `level=3` responses nest them one level down under divisions.
    const groups = [conf, ...(conf?.children || [])];
    for (const group of groups) {
      for (const entry of group?.standings?.entries || []) {
        const meta = getNflTeamByEspnId(entry?.team?.id) || getNflTeamByAbbrev(entry?.team?.abbreviation);
        if (!meta || teams[meta.slug]) continue;

        const stats = entry.stats || [];
        const wins = Math.round(stat(stats, 'wins')?.value ?? 0);
        const losses = Math.round(stat(stats, 'losses')?.value ?? 0);
        const ties = Math.round(stat(stats, 'ties')?.value ?? 0);
        const games = wins + losses + ties;
        const pointsFor = stat(stats, 'pointsFor')?.value ?? null;
        const pointsAgainst = stat(stats, 'pointsAgainst')?.value ?? null;
        const seed = stat(stats, 'playoffSeed')?.value;
        const streakStat = stat(stats, 'streak');
        const clincher = stat(stats, 'clincher')?.displayValue || null;

        teams[meta.slug] = {
          slug: meta.slug,
          name: meta.name,
          abbrev: meta.abbrev,
          conference: confAbbr || meta.conference,
          division: meta.division,
          wins, losses, ties, games,
          record: formatRecord(wins, losses, ties),
          pct: games > 0 ? Math.round(((wins + ties / 2) / games) * 1000) / 1000 : 0,
          pointsFor, pointsAgainst,
          pointDiff: pointsFor != null && pointsAgainst != null ? pointsFor - pointsAgainst : null,
          streak: streakStat?.displayValue ?? null,
          playoffSeed: seed != null ? Number(seed) : null,
          clincher,
          homeRecord: stat(stats, 'Home', 'home')?.displayValue ?? stat(stats, 'Home', 'home')?.summary ?? null,
          roadRecord: stat(stats, 'Road', 'road')?.displayValue ?? stat(stats, 'Road', 'road')?.summary ?? null,
          divisionRecord: stat(stats, 'vs. Div.', 'vsdiv', 'divisionRecord')?.displayValue ?? null,
          conferenceRecord: stat(stats, 'vs. Conf.', 'vsconf')?.displayValue ?? null,
        };
      }
    }
  }

  // Division rank. Division leaders hold seeds 1-4, so sorting by seed
  // first respects ESPN's tiebreakers wherever a seed is available.
  const byDivision = {};
  for (const t of Object.values(teams)) (byDivision[t.division] ||= []).push(t);
  for (const list of Object.values(byDivision)) {
    list.sort((a, b) =>
      (b.pct - a.pct)
      || ((a.playoffSeed ?? 99) - (b.playoffSeed ?? 99))
      || ((b.pointDiff ?? 0) - (a.pointDiff ?? 0)));
    list.forEach((t, i) => {
      t.divisionRank = i + 1;
      t.standing = `${ordinal(i + 1)} in ${t.division}`;
    });
  }

  // Any team missing from the feed still appears, with an empty record.
  for (const meta of NFL_TEAMS) {
    if (!teams[meta.slug]) {
      teams[meta.slug] = {
        slug: meta.slug, name: meta.name, abbrev: meta.abbrev,
        conference: meta.conference, division: meta.division,
        wins: 0, losses: 0, ties: 0, games: 0, record: '0-0', pct: 0,
        pointsFor: null, pointsAgainst: null, pointDiff: null,
        streak: null, playoffSeed: null, clincher: null,
        homeRecord: null, roadRecord: null, divisionRecord: null, conferenceRecord: null,
        divisionRank: null, standing: null,
      };
    }
  }

  return { teams, season };
}

/**
 * @returns {Promise<{ teams: Record<string, object>, season: number|null, generatedAt: string, stale?: boolean }>}
 */
export async function getNflStandings() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    const result = await coalesce(CACHE_KEY, async () => {
      const r = await fetch(ESPN_STANDINGS, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!r.ok) throw new Error(`ESPN NFL standings: ${r.status}`);
      const parsed = parseStandings(await r.json());
      return { ...parsed, generatedAt: new Date().toISOString() };
    });
    cache.set(CACHE_KEY, result);
    return result;
  } catch (err) {
    const stale = cache.getMaybeStale(CACHE_KEY);
    if (stale?.value) return { ...stale.value, stale: true };
    return { ...parseStandings(null), generatedAt: new Date().toISOString(), error: err?.message };
  }
}
