import { useState, useEffect, useCallback } from 'react';
import { topMatchups } from '../data/mockData';
import { fetchScores } from '../api/scores';
import KeyDatesWidget from '../components/home/KeyDatesWidget';
import DailySchedule from '../components/home/DailySchedule';
import LiveScores from '../components/scores/LiveScores';
import SourceBadge from '../components/shared/SourceBadge';
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
        <KeyDatesWidget />
      </section>

      <section className={styles.section}>
        <DailySchedule />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Live Scores</h2>
          <SourceBadge source="ESPN" />
        </div>
        <LiveScores
          games={scores.games}
          loading={scores.loading}
          error={scores.error}
          compact={false}
          showTitle={false}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Key Matchups</h2>
          <SourceBadge source="Mock" />
        </div>
        <div className={styles.matchupList}>
          {topMatchups.map((m) => (
            <MatchupPreview key={m.id} matchup={m} />
          ))}
        </div>
      </section>
    </div>
  );
}
