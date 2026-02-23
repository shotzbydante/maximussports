import { useState, useEffect, useCallback } from 'react';
import { fetchScores } from '../api/scores';
import { fetchOdds, mergeGamesWithOdds } from '../api/odds';
import { getTeamSlug } from '../utils/teamSlug';
import KeyDatesWidget from '../components/home/KeyDatesWidget';
import DailySchedule from '../components/home/DailySchedule';
import LiveScores from '../components/scores/LiveScores';
import SourceBadge from '../components/shared/SourceBadge';
import styles from './Games.module.css';

const REFRESH_INTERVAL_MS = 60 * 1000;

function isLiveOrInProgress(status) {
  const s = (status || '').toLowerCase();
  return (
    s.startsWith('q1 ') ||
    s.startsWith('q2 ') ||
    s.startsWith('1st ') ||
    s.startsWith('2nd ') ||
    s === 'halftime' ||
    (s.includes(':') && !s.includes('AM') && !s.includes('PM'))
  );
}

function getLiveScoresDateLabel() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
  });
}

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

  const hasLiveOrInProgress = scores.games.some((g) => isLiveOrInProgress(g.gameStatus));
  const showLiveScores = scores.games.length > 0 && hasLiveOrInProgress;
  const liveScoresDateLabel = getLiveScoresDateLabel();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Games</h1>
        <p className={styles.subtitle}>Live scores, spreads, and daily schedule</p>
      </header>

      <section className={styles.sectionCompact}>
        <KeyDatesWidget />
      </section>

      {showLiveScores && (
        <section className={`${styles.liveScoresSection} ${styles.hasLive}`}>
          <div className={styles.liveScoresHeader}>
            <div className={styles.liveScoresTitleRow}>
              <h2 className={styles.sectionTitle}>
                Live Scores — Today ({liveScoresDateLabel}, PST)
              </h2>
              <span className={styles.livePill} aria-hidden>LIVE</span>
            </div>
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
      )}

      <section className={styles.section}>
        <DailySchedule />
      </section>
    </div>
  );
}
