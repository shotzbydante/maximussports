/**
 * Client fetchers for the NBA workspace pages built on the shared home
 * layout. Each memoizes its last good response briefly and coalesces
 * concurrent calls, so several sections on one page share a request. On
 * failure they resolve to an empty payload of the right shape.
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

function countByStatus(games) {
  const counts = { live: 0, upcoming: 0, final: 0 };
  for (const g of games) if (counts[g.status] != null) counts[g.status] += 1;
  return counts;
}

/** Today's NBA slate: every game with lines and the model's numbers. */
export const fetchNbaGames = createFetcher('/api/nba/live/games?status=all&sort=startTime', {
  ttlMs: 30 * 1000,
  empty: { games: [], counts: { live: 0, upcoming: 0, final: 0 } },
  shape: (d) => {
    const games = d.games ?? [];
    return { games, counts: d.counts ?? countByStatus(games) };
  },
});

/** The picks board: Maximus's picks plus a lean on every game and market. */
export const fetchNbaPicks = createFetcher('/api/nba/picks/built', {
  ttlMs: 60 * 1000,
  empty: null,
});

/** The latest graded slate and the running record. */
export const fetchNbaScorecard = createFetcher('/api/nba/picks/scorecard', {
  ttlMs: 5 * 60 * 1000,
  empty: null,
});

export function fetchNbaVideos({ maxResults = 8 } = {}) {
  return fetch(`/api/nba/youtube/intelFeed?maxResults=${maxResults}`)
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((d) => ({ items: d.items ?? [] }))
    .catch(() => ({ items: [] }));
}
