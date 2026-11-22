/**
 * NBA Games — today's slate with live scores, lines and our call on each
 * game. Every card opens with an aerial flyover of the arena.
 * Tabs: All / Live / Upcoming / Final. Sort by tip-off, importance or
 * watchability.
 */

import { useState, useEffect, useMemo } from 'react';
import NbaGameCard from '../../components/nba/NbaGameCard';
import SEOHead from '../../components/seo/SEOHead';
import { fetchNbaPicks } from '../../api/nba';
import { bestPerGame } from '../../components/nba/home/nbaPickHelpers';
import { trackFilterChange } from '../../analytics/sportEvents';
import s from '../../components/nfl/nfl.module.css';

const REFRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

const TABS = [
  { key: 'all', label: 'All games' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'final', label: 'Final' },
];

const SORT_OPTIONS = [
  { key: 'startTime', label: 'Tip-off' },
  { key: 'importance', label: 'Importance' },
  { key: 'watchability', label: 'Watchability' },
];

export default function NbaGames() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('startTime');
  const [board, setBoard] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const r = await fetch(`/api/nba/live/games?status=all&sort=${sort}`, { signal: controller.signal });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setData(d);
      } catch { /* keep the last good slate on screen */ }
      finally {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [sort]);

  useEffect(() => {
    let cancelled = false;
    fetchNbaPicks().then((d) => { if (!cancelled) setBoard(d || null); });
    return () => { cancelled = true; };
  }, []);

  const games = useMemo(() => data?.games || [], [data]);
  const counts = useMemo(() => {
    if (data?.counts) return data.counts;
    const c = { live: 0, upcoming: 0, final: 0 };
    for (const g of games) if (c[g.status] != null) c[g.status] += 1;
    return c;
  }, [data, games]);
  const visible = useMemo(() => (tab === 'all' ? games : games.filter((g) => g.status === tab)), [games, tab]);
  // The strongest call on each game, so every card can say what we think and why.
  const callByGame = useMemo(
    () => new Map(bestPerGame(board?.fullSlatePicks || []).map((p) => [String(p.gameId), p])),
    [board],
  );
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className={s.page}>
      <SEOHead
        title="NBA Games Today: Scores, Spreads, Totals & Moneylines"
        description="Every NBA game today with live scores, consensus spreads, totals and moneylines, and the Maximus call on each game."
      />
      <header className={s.pageHeader}>
        <span className={s.eyebrow}>{today}</span>
        <h1 className={s.pageTitle}>NBA games</h1>
        <p className={s.pageSubtitle}>
          Scores, consensus lines and our call for every game today. Live games refresh every minute.
        </p>
      </header>

      <div className={s.controls}>
        <div className={s.tabs} role="tablist" aria-label="Filter games">
          {TABS.map((t) => {
            const count = t.key === 'all' ? games.length : counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`${s.tab} ${tab === t.key ? s.tabActive : ''}`}
                onClick={() => {
                  setTab(t.key);
                  trackFilterChange({ sport: 'nba', page: 'games', filter: 'status', value: t.key });
                }}
              >
                {t.label}
                {count > 0 && <span className={s.tabCount}>{count}</span>}
              </button>
            );
          })}
        </div>
        <div className={s.sortRow}>
          <span>Sort by</span>
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`${s.sortBtn} ${sort === o.key ? s.sortBtnActive : ''}`}
              onClick={() => {
                setSort(o.key);
                trackFilterChange({ sport: 'nba', page: 'games', filter: 'sort', value: o.key });
              }}
              aria-pressed={sort === o.key}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className={s.gridGames}>
          {Array.from({ length: 6 }, (_, i) => <div key={i} className={s.skeleton} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyTitle}>
            {tab === 'live' ? 'No games in progress' : tab === 'upcoming' ? 'No games left today' : tab === 'final' ? 'No finals yet today' : 'No games today'}
          </span>
          {tab === 'all' ? 'The next slate appears here as soon as it is the day’s schedule.' : 'Try another tab.'}
        </div>
      ) : (
        <div className={s.gridGames}>
          {visible.map((g) => <NbaGameCard key={g.gameId} game={g} call={callByGame.get(String(g.gameId))} />)}
        </div>
      )}

      <p className={s.note}>
        Lines are the consensus across sportsbooks. A call marked “Maximus’s pick” is one of the engine’s
        highest-conviction calls; a “lean” is tracked and graded but is not a pick. The model has no injury
        report yet, so check the lineup before acting on any of it.
      </p>
    </div>
  );
}
