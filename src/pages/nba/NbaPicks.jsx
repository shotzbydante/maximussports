/**
 * NBA Odds Insights — standalone picks/odds intelligence page.
 * Shows games with odds enrichment.
 */

import { useState, useEffect } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import NbaLiveGameCard from '../../components/nba/NbaLiveGameCard';
import styles from './NbaShared.module.css';

export default function NbaPicks() {
  const { workspace } = useWorkspace();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/nba/live/games?status=all&sort=edge')
      .then(r => r.json())
      .then(d => setGames(d.games || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} NBA Odds Insights</h1>
        <p className={styles.subtitle}>Lines, edges, and market intelligence across today's NBA slate</p>
      </header>

      {loading ? (
        <div className={styles.emptyState}>
          <p>Loading odds insights...</p>
        </div>
      ) : games.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>&#x1F3C0;</span>
          <h3>No Games on Today's Board</h3>
          <p>Check back when games are scheduled for odds insights and market intelligence.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-md)' }}>
          {games.map((game) => (
            <NbaLiveGameCard key={game.gameId} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
