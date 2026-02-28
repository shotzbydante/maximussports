import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { fetchHome } from '../api/home';
import { mergeGamesWithOdds } from '../api/odds';
import { getTeamSlug } from '../utils/teamSlug';
import { buildSlugToRankMap } from '../utils/rankingsNormalize';
import { TEAMS } from '../data/teams';
import LiveScores from '../components/scores/LiveScores';
import SourceBadge from '../components/shared/SourceBadge';
import styles from './Games.module.css';

const KeyDatesWidget = lazy(() => import('../components/home/KeyDatesWidget'));
const DailySchedule = lazy(() => import('../components/home/DailySchedule'));

function ModuleSkeleton({ height = 180 }) {
  return <div className={styles.moduleSkeleton} style={{ height }} aria-busy="true" />;
}

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

function getTodaysScoresDateLabel() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Games() {
  const [scores, setScores] = useState({ games: [], loading: true, error: null });
  const [rankMap, setRankMap] = useState({});

  const loadScores = useCallback(() => {
    setScores((s) => ({ ...s, loading: true, oddsError: null, oddsMessage: null }));
    fetchHome()
      .then((data) => {
        const gamesArray = data.scores ?? [];
        const oddsRes = data.odds ?? {};
        const oddsGames = oddsRes.games ?? [];
        const merged = mergeGamesWithOdds(gamesArray, oddsGames, getTeamSlug);
        let oddsMessage = null;
        if (oddsRes.error === 'missing_key') {
          oddsMessage = 'Odds API key missing in production.';
        } else if (oddsRes.hasOddsKey === true && oddsGames.length === 0) {
          oddsMessage = gamesArray.length > 0 ? 'Odds API returned no games.' : 'No odds currently available.';
        }
        setScores({ games: merged, loading: false, error: null, oddsError: oddsRes.error, oddsMessage });
        const rankings = data.rankings?.rankings ?? [];
        setRankMap(buildSlugToRankMap({ rankings }, TEAMS));
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

  const hasLiveOrInProgress = useMemo(
    () => scores.games.some((g) => isLiveOrInProgress(g.gameStatus)),
    [scores.games],
  );
  const showLiveScores = scores.games.length > 0 && hasLiveOrInProgress;
  const todaysScoresDateLabel = getTodaysScoresDateLabel();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Games</h1>
        <p className={styles.subtitle}>Live scores, spreads, and daily schedule</p>
      </header>

      <section className={styles.sectionCompact}>
        <Suspense fallback={<ModuleSkeleton height={200} />}>
          <KeyDatesWidget />
        </Suspense>
      </section>

      {showLiveScores && (
        <section className={`${styles.liveScoresSection} ${styles.hasLive}`}>
          <div className={styles.liveScoresHeader}>
            <div className={styles.liveScoresTitleRow}>
              <h2 className={styles.sectionTitle}>
                Today&apos;s Scores — {todaysScoresDateLabel} (PST)
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
            rankMap={rankMap}
          />
        </section>
      )}

      <section className={styles.section}>
        <Suspense fallback={<ModuleSkeleton height={320} />}>
          <DailySchedule />
        </Suspense>
      </section>
    </div>
  );
}
