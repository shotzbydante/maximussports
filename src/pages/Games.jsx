import { useState, useEffect, useCallback } from 'react';
import { topMatchups } from '../data/mockData';
import { fetchScores } from '../api/scores';
import LiveScores from '../components/scores/LiveScores';
import MatchupPreview from '../components/dashboard/MatchupPreview';
import styles from './Games.module.css';

const REFRESH_INTERVAL_MS = 60 * 1000;

export default function Games() {
  const [scores, setScores] = useState({ games: [], loading: true, error: null });

  const loadScores = useCallback(() => {
    setScores((s) => ({ ...s, loading: true }));
    fetchScores()
      .then((games) => setScores({ games, loading: false, error: null }))
      .catch((err) => setScores((s) => ({ ...s, loading: false, error: err.message })));
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  useEffect(() => {
    const id = setInterval(loadScores, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadScores]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Games</h1>
        <p className={styles.subtitle}>Live scores, key matchups, spreads, and upset watch</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Live Scores</h2>
        <LiveScores
          games={scores.games}
          loading={scores.loading}
          error={scores.error}
          compact={false}
          showTitle={false}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Key Matchups</h2>
        <div className={styles.matchupList}>
          {topMatchups.map((m) => (
            <MatchupPreview key={m.id} matchup={m} />
          ))}
        </div>
      </section>
    </div>
  );
}
