import { useState, useEffect, useCallback } from 'react';
import { topMatchups } from '../data/mockData';
import { fetchScores } from '../api/scores';
import { fetchOdds, mergeGamesWithOdds } from '../api/odds';
import { getTeamSlug } from '../utils/teamSlug';
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
    setScores((s) => ({ ...s, loading: true, oddsError: null, oddsMessage: null }));
    Promise.all([
      fetchScores(),
      fetchOdds().catch(() => ({ games: [], error: 'fetch_failed' })),
    ])
      .then(([games, oddsRes]) => {
        const oddsGames = oddsRes?.games ?? [];
        const merged = mergeGamesWithOdds(games, oddsGames, getTeamSlug);
        let oddsMessage = null;
        if (oddsRes?.error === 'missing_key') {
          oddsMessage = 'Odds API key missing in production.';
        } else if (oddsRes?.hasOddsKey === true && oddsGames.length === 0) {
          oddsMessage = games.length > 0 ? 'Odds API returned no games.' : 'No odds currently available.';
        }
        setScores({ games: merged, loading: false, error: null, oddsError: oddsRes?.error, oddsMessage });
      })
      .catch((err) => setScores((s) => ({ ...s, loading: false, error: err.message, oddsError: null, oddsMessage: null })));
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
          oddsMessage={scores.oddsMessage}
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
