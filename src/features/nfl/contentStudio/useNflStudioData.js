import { useEffect, useState } from 'react';

/**
 * Loads everything the NFL Content Studio needs, from the same endpoints the
 * NFL workspace pages use. Each request fails soft to null so one slow feed
 * cannot blank the whole studio; `errors` names the feeds that did not load.
 *
 * @param {boolean} enabled     only fetch while the NFL studio is open
 * @param {number}  refreshKey  bump to refetch (the Regenerate button)
 */
const SOURCES = {
  picks: '/api/nfl/picks/built',
  games: '/api/nfl/live/games?status=all&sort=startTime',
  season: '/api/nfl/season-model',
  scorecard: '/api/nfl/picks/scorecard',
};

const EMPTY = { picks: null, games: null, season: null, scorecard: null };

async function getJson(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useNflStudioData(enabled, refreshKey = 0) {
  // `key` records which refresh the stored data belongs to, so "loading" is
  // derived instead of being set from inside the effect.
  const [result, setResult] = useState({ ...EMPTY, errors: [], key: null });

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let cancelled = false;

    const keys = Object.keys(SOURCES);
    Promise.allSettled(keys.map((k) => getJson(SOURCES[k], controller.signal))).then((results) => {
      if (cancelled) return;
      const next = { ...EMPTY };
      const errors = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[keys[i]] = r.value;
        else errors.push(keys[i]);
      });
      setResult({ ...next, errors, key: refreshKey });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, refreshKey]);

  const { key, ...data } = result;
  return { ...data, loading: enabled && key !== refreshKey };
}
