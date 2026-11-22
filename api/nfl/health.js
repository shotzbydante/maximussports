/**
 * GET /api/nfl/health
 *
 * One look at every outside feed the NFL workspace depends on. Each ESPN
 * endpoint is called live and its response is checked for the fields the
 * app reads, not just for a 200. The Odds API is not called (a call costs
 * credits); its last pull and remaining quota are reported instead.
 *
 * `ok` is false when a feed the picks engine cannot run without is down:
 * the ESPN scoreboard or the odds. Everything else degrades, and the
 * response says how.
 */

import { createCache } from '../_cache.js';
import { getJson } from '../_globalCache.js';
import { ESPN_SCOREBOARD } from './live/_normalize.js';
import { getOddsQuota } from './live/_odds.js';
import { getNflModelData, getNflverseStatus, nflverseWeek } from '../_lib/nflModelData.js';
import { getWeatherStatus, weatherProvider } from '../_lib/nflWeather.js';
import { canPersist } from '../_lib/nflPicksBuilder.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { NFLVERSE_BASE } from '../../src/features/nfl/data/nflverse.js';

const TIMEOUT_MS = 8000;
const cache = createCache(60_000);
const ESPN = 'https://site.api.espn.com/apis';

async function probe(name, url, check) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Date.now() - t0;
    if (!r.ok) return { name, ok: false, status: r.status, ms, detail: `HTTP ${r.status}` };
    const json = await r.json();
    const result = check(json);
    return { name, ok: result.ok, status: r.status, ms, ...result };
  } catch (err) {
    return { name, ok: false, status: null, ms: Date.now() - t0, detail: err?.name === 'TimeoutError' ? 'timed out' : (err?.message || 'failed') };
  }
}

function checkScoreboard(json) {
  const events = Array.isArray(json?.events) ? json.events : [];
  const shaped = events.filter((e) => e?.id && e?.competitions?.[0]?.competitors?.length === 2);
  const upcoming = events.filter((e) => e?.competitions?.[0]?.status?.type?.state === 'pre');
  const withOdds = upcoming.filter((e) => e.competitions[0].odds?.[0]);
  const withVenue = events.filter((e) => typeof e?.competitions?.[0]?.venue?.indoor === 'boolean');
  const ok = !!json?.week?.number && !!json?.season?.year && shaped.length === events.length;
  return {
    ok,
    week: json?.week?.number ?? null, seasonType: json?.season?.type ?? null, seasonYear: json?.season?.year ?? null,
    events: events.length, upcoming: upcoming.length, upcomingWithEspnOdds: withOdds.length, withRoofFlag: withVenue.length,
    detail: ok ? `week ${json.week.number}, ${events.length} games` : 'response is missing week, season or competitors',
  };
}

function checkInjuries(json) {
  const teams = Array.isArray(json?.injuries) ? json.injuries : [];
  const players = teams.reduce((n, t) => n + (t?.injuries?.length || 0), 0);
  const typed = teams.every((t) => (t?.injuries || []).every((i) => i?.athlete?.displayName && (i?.status || i?.type?.name)));
  return { ok: teams.length >= 28 && typed, teams: teams.length, players, detail: `${teams.length} teams, ${players} players listed` };
}

function checkStandings(json) {
  const groups = Array.isArray(json?.children) ? json.children : [];
  const entries = groups.reduce((n, g) => n + (g?.standings?.entries?.length || (g?.children || []).reduce((m, c) => m + (c?.standings?.entries?.length || 0), 0)), 0);
  return { ok: entries >= 32, teams: entries, detail: `${entries} teams in the standings` };
}

function checkTeamSchedule(json) {
  const events = Array.isArray(json?.events) ? json.events : [];
  return { ok: events.length >= 10, events: events.length, detail: `${events.length} games on a team schedule` };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const hit = cache.get('health');
  if (hit && req.query?.fresh !== '1') return res.status(200).json({ ...hit, _cached: true });

  const [scoreboard, injuries, standings, teamSchedule, nflverse] = await Promise.all([
    probe('espn.scoreboard', ESPN_SCOREBOARD, checkScoreboard),
    probe('espn.injuries', `${ESPN}/site/v2/sports/football/nfl/injuries`, checkInjuries),
    probe('espn.standings', `${ESPN}/v2/sports/football/nfl/standings`, checkStandings),
    probe('espn.teamSchedule', `${ESPN}/site/v2/sports/football/nfl/teams/12/schedule`, checkTeamSchedule),
    probe('nflverse.timestamp', `${NFLVERSE_BASE}/stats_team/timestamp.json`, (j) => ({ ok: !!j?.last_updated, lastUpdated: j?.last_updated || null, detail: `team stats updated ${j?.last_updated || 'unknown'}` })),
  ]);

  // Odds: the shared copy of the last pull, without spending a credit.
  const sharedOdds = await getJson('nfl:odds:week:v2').catch(() => null);
  const oddsEvents = Array.isArray(sharedOdds?.events) ? sharedOdds.events : [];
  const oddsAgeMin = sharedOdds?.at ? Math.round((Date.now() - sharedOdds.at) / 60_000) : null;
  const bookCounts = oddsEvents.map((e) => e?.books?.length || 0);
  const odds = {
    name: 'oddsApi',
    configured: !!process.env.ODDS_API_KEY,
    ok: !!process.env.ODDS_API_KEY && oddsEvents.length > 0 && oddsAgeMin != null && oddsAgeMin <= 90,
    events: oddsEvents.length,
    ageMinutes: oddsAgeMin,
    medianBooks: bookCounts.length ? [...bookCounts].sort((a, b) => a - b)[Math.floor(bookCounts.length / 2)] : 0,
    quota: getOddsQuota(),
    detail: !process.env.ODDS_API_KEY ? 'ODDS_API_KEY is not set'
      : oddsEvents.length === 0 ? 'no shared odds pull on file yet'
        : `${oddsEvents.length} games, last pull ${oddsAgeMin} min ago`,
  };

  // Model: built for the week ESPN says it is.
  let engine = { name: 'engine', ok: false, detail: 'scoreboard unavailable, model not built' };
  if (scoreboard.ok) {
    const model = await getNflModelData({ seasonYear: scoreboard.seasonYear, seasonType: scoreboard.seasonType, week: scoreboard.week });
    engine = {
      name: 'engine', ok: !!model.ok,
      asOf: model.asOf || { season: scoreboard.seasonYear, week: nflverseWeek(scoreboard) },
      teamsRated: Object.keys(model?.ratings?.teams || {}).length,
      quarterbacks: model?.qbTable?.byId?.size ?? 0,
      epaCoverage: model?.ratings?.epaCoverage ?? null,
      weeksBehind: model?.behind ?? null,
      source: model?.source || null,
      reasons: model?.reasons || [],
      detail: model.ok ? `ratings as of week ${model.asOf.week}` : (model?.reasons?.[0] || 'model unavailable'),
    };
  }

  // Storage: are the lock columns there?
  let storage = { name: 'storage', ok: false, persist: canPersist(), detail: 'Supabase unavailable' };
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('picks').select('id, locked_at, clv_ev').eq('sport', 'nfl').limit(1);
    const { error: snapError } = await sb.from('nfl_line_snapshots').select('game_id').limit(1);
    const migrated = !error && !snapError;
    storage = {
      name: 'storage', ok: migrated, persist: canPersist(),
      detail: migrated ? (canPersist() ? 'locking and closing-line capture are on' : 'schema is ready; writes are off outside production')
        : `run docs/nfl-picks-v2-migration.sql (${(error || snapError)?.message})`,
    };
  } catch (e) { storage.detail = e?.message || storage.detail; }

  const weather = { name: 'weather', provider: weatherProvider(), ...getWeatherStatus(), detail: `provider: ${weatherProvider() === 'google' ? 'Google Weather API' : 'National Weather Service'}` };
  const checks = { scoreboard, injuries, standings, teamSchedule, odds, nflverse: { ...nflverse, lastPull: getNflverseStatus() }, engine, weather, storage };
  const espnOk = scoreboard.ok && injuries.ok && standings.ok && teamSchedule.ok;
  const body = {
    ok: scoreboard.ok && odds.ok,
    espn: { ok: espnOk, failing: [scoreboard, injuries, standings, teamSchedule].filter((c) => !c.ok).map((c) => c.name) },
    degraded: Object.values(checks).filter((c) => c.ok === false).map((c) => c.name),
    checks,
    generatedAt: new Date().toISOString(),
  };
  cache.set('health', body);
  return res.status(200).json(body);
}
