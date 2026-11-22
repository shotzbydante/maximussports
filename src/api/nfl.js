/**
 * Client fetchers for the NFL workspace.
 *
 * Each fetcher memoizes its last good response for a short window and
 * coalesces concurrent calls, so several components on one page share a
 * single request. On any failure they resolve to an empty payload of the
 * right shape instead of throwing.
 */

function createFetcher(url, { ttlMs, empty, shape = (d) => d }) {
  let inFlight = null;
  let last = { data: null, ts: 0 };
  return async function fetcher({ force = false } = {}) {
    const now = Date.now();
    if (!force && last.data != null && now - last.ts < ttlMs) return last.data;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return empty;
        const out = shape(await res.json());
        last = { data: out, ts: Date.now() };
        return out;
      } catch {
        return empty;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

/** The current NFL week: every game with odds, model projection and signals. */
export const fetchNflGames = createFetcher('/api/nfl/live/games?status=all&sort=startTime', {
  ttlMs: 30 * 1000,
  empty: { games: [], counts: { live: 0, upcoming: 0, final: 0 }, week: null, seasonType: null, seasonLabel: null, byeTeams: [] },
  shape: (d) => ({
    games: d.games ?? [],
    counts: d.counts ?? { live: 0, upcoming: 0, final: 0 },
    week: d.week ?? null,
    seasonType: d.seasonType ?? null,
    seasonLabel: d.seasonLabel ?? null,
    byeTeams: d.byeTeams ?? [],
  }),
});

/** All 32 teams with record, standing, seed and power rating. */
export const fetchNflTeamBoard = createFetcher('/api/nfl/team/board', {
  ttlMs: 2 * 60 * 1000,
  empty: { board: [], week: null },
  shape: (d) => ({ board: d.board ?? [], week: d.week ?? null, ratingSource: d.ratingSource ?? null }),
});

/** Super Bowl winner odds keyed by team slug. */
export const fetchNflChampionshipOdds = createFetcher('/api/nfl/odds/championship', {
  ttlMs: 60 * 1000,
  empty: { odds: {} },
  shape: (d) => ({ odds: d.odds ?? {}, updatedAt: d.updatedAt ?? null }),
});

/** League headlines. */
export const fetchNflHeadlines = createFetcher('/api/nfl/news/headlines', {
  ttlMs: 2 * 60 * 1000,
  empty: { headlines: [] },
  shape: (d) => ({ headlines: d.headlines ?? [] }),
});

/** Season Intelligence: projections, playoff odds and the playoff picture. */
export const fetchNflSeasonModel = createFetcher('/api/nfl/season-model', {
  ttlMs: 5 * 60 * 1000,
  empty: { teams: [], picture: { AFC: { in: [], hunt: [] }, NFC: { in: [], hunt: [] } }, week: null, meta: null },
  shape: (d) => ({
    teams: d.teams ?? [],
    picture: d.picture ?? { AFC: { in: [], hunt: [] }, NFC: { in: [], hunt: [] } },
    week: d.week ?? null,
    seasonType: d.seasonType ?? null,
    meta: d.meta ?? null,
    generatedAt: d.generatedAt ?? null,
  }),
});

async function getJson(url, empty) {
  try {
    const res = await fetch(url);
    if (!res.ok) return empty;
    return await res.json();
  } catch {
    return empty;
  }
}

/** Videos for the league, or for one team when `team` is given. */
export function fetchNflVideos({ team = null, maxResults = 8 } = {}) {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (team) params.set('team', team);
  return getJson(`/api/nfl/youtube/intelFeed?${params}`, { items: [] }).then((d) => ({ items: d.items ?? [] }));
}

export function fetchNflTeamHeadlines(team) {
  return getJson(`/api/nfl/news/headlines?team=${encodeURIComponent(team)}`, { headlines: [] })
    .then((d) => ({ headlines: d.headlines ?? [] }));
}

export function fetchNflTeamSchedule(team) {
  return getJson(`/api/nfl/team/schedule?slug=${encodeURIComponent(team)}`, { events: [] })
    .then((d) => ({ events: d.events ?? [], teamRecord: d.teamRecord ?? null, byeWeek: d.byeWeek ?? null }));
}

/** One team's injury report: players out, doubtful, questionable or on IR. */
export function fetchNflTeamInjuries(team) {
  return getJson(`/api/nfl/injuries?team=${encodeURIComponent(team)}`, { injuries: [] })
    .then((d) => ({ injuries: d.injuries ?? [], summary: d.summary ?? null, generatedAt: d.generatedAt ?? null }));
}

export function fetchNflScorecard({ days = 9 } = {}) {
  return getJson(`/api/nfl/picks/scorecard?days=${days}`, null);
}

const TALENT_EMPTY = { available: false, teams: [] };

/** Roster talent for one team: ranks, position groups, units, starters. */
export function fetchNflTeamTalent(team) {
  return getJson(`/api/nfl/talent?team=${encodeURIComponent(team)}`, TALENT_EMPTY);
}

/** Roster talent for both teams in a game, plus the unit matchups each way. */
export function fetchNflGameTalent({ away, home }) {
  return getJson(`/api/nfl/talent?away=${encodeURIComponent(away)}&home=${encodeURIComponent(home)}`, TALENT_EMPTY);
}
