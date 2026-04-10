/**
 * NBA Games — ranked daily game slate with live intelligence.
 * Tabs: Live / Starting Soon / All Games
 * Sortable by: Importance, Edge, Watchability, Start Time
 */

import { useState, useEffect } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import NbaLiveGameCard from '../../components/nba/NbaLiveGameCard';
import styles from './NbaGames.module.css';

const REFRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

const TABS = [
  { key: 'all', label: 'All Games' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Starting Soon' },
];

const SORT_OPTIONS = [
  { key: 'importance', label: 'Importance' },
  { key: 'edge', label: 'Edge' },
  { key: 'watchability', label: 'Watchability' },
  { key: 'startTime', label: 'Start Time' },
];

export default function NbaGames() {
  const { workspace } = useWorkspace();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('importance');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const statusParam = tab === 'all' ? 'all' : tab;
        const r = await fetch(`/api/nba/live/games?status=${statusParam}&sort=${sort}`, { signal: controller.signal });
        clearTimeout(timer);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setGames(d.games || []);
      } catch { /* network error */ }
      finally { if (!cancelled) setLoading(false); }
    }

    setLoading(true);
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [tab, sort]);

  const liveCount = games.filter((g) => g.status === 'live').length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} NBA Games</h1>
        <p className={styles.subtitle}>Ranked by intelligence — scores, lines, and insights</p>
      </header>

      <div className={styles.controls}>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === 'live' && liveCount > 0 && (
                <span className={styles.liveBadge}>{liveCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className={styles.sortRow}>
          <span className={styles.sortLabel}>Sort:</span>
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.key}
              className={`${styles.sortBtn} ${sort === s.key ? styles.sortBtnActive : ''}`}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}><p>Loading today's slate...</p></div>
      ) : games.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No {tab === 'live' ? 'live' : tab === 'upcoming' ? 'upcoming' : ''} games right now. Check back closer to game time.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {games.map((game) => (
            <NbaLiveGameCard key={game.gameId} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
