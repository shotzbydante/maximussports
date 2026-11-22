/**
 * NFL Games — the full weekly slate with live scores, lines and the
 * model's projection for each game.
 * Tabs: All / Live / Upcoming / Final. Sort by kickoff, importance, edge
 * or watchability.
 */

import { useState, useEffect, useMemo } from 'react';
import NflGameCard from '../../components/nfl/NflGameCard';
import SEOHead from '../../components/seo/SEOHead';
import { getNflTeamBySlug } from '../../sports/nfl/teams';
import s from '../../components/nfl/nfl.module.css';
import { trackFilterChange } from '../../analytics/sportEvents';

const REFRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

const TABS = [
  { key: 'all', label: 'All games' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'final', label: 'Final' },
];

const SORT_OPTIONS = [
  { key: 'startTime', label: 'Kickoff' },
  { key: 'importance', label: 'Importance' },
  { key: 'edge', label: 'Model edge' },
  { key: 'watchability', label: 'Watchability' },
];

function dayKey(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch { return ''; }
}

export default function NflGames() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('startTime');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const r = await fetch(`/api/nfl/live/games?status=all&sort=${sort}`, { signal: controller.signal });
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

  const games = useMemo(() => data?.games || [], [data]);
  const counts = data?.counts || { live: 0, upcoming: 0, final: 0 };
  const visible = useMemo(
    () => (tab === 'all' ? games : games.filter((g) => g.status === tab)),
    [games, tab],
  );

  // Kickoff order reads best grouped by day; ranked orders stay flat.
  const groups = useMemo(() => {
    if (sort !== 'startTime') return [{ label: null, games: visible }];
    const map = new Map();
    for (const g of visible) {
      const k = dayKey(g.startTime);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(g);
    }
    return [...map.entries()].map(([label, list]) => ({ label, games: list }));
  }, [visible, sort]);

  const weekLabel = data?.week != null
    ? (data.seasonType === 3 ? 'Playoffs' : `Week ${data.week}`)
    : null;

  return (
    <div className={s.page}>
      <SEOHead
        title="NFL Games, Scores, Spreads & Totals This Week"
        description="Every NFL game this week with live scores, consensus spreads and totals, moneylines and the Maximus model projection."
      />
      <header className={s.pageHeader}>
        <span className={s.eyebrow}>{weekLabel || 'NFL'}{data?.seasonLabel ? ` · ${data.seasonLabel}` : ''}</span>
        <h1 className={s.pageTitle}>NFL games</h1>
        <p className={s.pageSubtitle}>
          Scores, consensus lines and the model’s number for every game this week. Live games refresh every minute.
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
                  trackFilterChange({ sport: 'nfl', page: 'games', filter: 'status', value: t.key });
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
                trackFilterChange({ sport: 'nfl', page: 'games', filter: 'sort', value: o.key });
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
            {tab === 'live' ? 'No games in progress' : tab === 'upcoming' ? 'No games left this week' : tab === 'final' ? 'No finals yet this week' : 'No games on the board'}
          </span>
          {tab === 'all' ? 'The next slate appears here as soon as the schedule posts.' : 'Try another tab.'}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label || 'ranked'} className={s.section}>
            {group.label && <h2 className={s.sectionTitle}>{group.label}</h2>}
            <div className={s.gridGames}>
              {group.games.map((g) => <NflGameCard key={g.gameId} game={g} />)}
            </div>
          </section>
        ))
      )}

      {data?.byeTeams?.length > 0 && (
        <p className={s.note}>
          On bye this week: {data.byeTeams.map((t) => getNflTeamBySlug(t)?.name || t).join(', ')}.
        </p>
      )}
      <p className={s.note}>
        “Model” is the power-rating projection before the market is weighed in. A gap of a touchdown or more
        between model and market usually means news the ratings cannot see.
      </p>
    </div>
  );
}
