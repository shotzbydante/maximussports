import { useState, useEffect, useCallback } from 'react';
import {
  dailyReport,
  topMatchups,
  oddsMovement,
  newsFeed as mockNewsFeed,
  teamNewsPreview,
  statCards,
} from '../data/mockData';
import { fetchAggregatedNews } from '../api/news';
import { fetchScores } from '../api/scores';
import LiveScores from '../components/scores/LiveScores';
import KeyDatesWidget from '../components/home/KeyDatesWidget';
import DailySchedule from '../components/home/DailySchedule';
import StatCard from '../components/shared/StatCard';
import SourceBadge from '../components/shared/SourceBadge';
import MatchupPreview from '../components/dashboard/MatchupPreview';
import OddsMovementWidget from '../components/dashboard/OddsMovementWidget';
import NewsFeed from '../components/dashboard/NewsFeed';
import TeamNewsPreview from '../components/dashboard/TeamNewsPreview';
import styles from './Home.module.css';

const FEATURED_SLUGS = ['duke-blue-devils', 'houston-cougars', 'purdue-boilermakers', 'kansas-jayhawks'];
const SCORES_REFRESH_MS = 60_000;

export default function Home() {
  const [newsData, setNewsData] = useState({
    teamNews: teamNewsPreview,
    newsFeed: mockNewsFeed,
  });
  const [scores, setScores] = useState({ games: [], loading: true, error: null });
  const [newsSource, setNewsSource] = useState('Mock');

  useEffect(() => {
    fetchAggregatedNews(FEATURED_SLUGS)
      .then(({ teamNews, newsFeed }) => {
        setNewsData({ teamNews, newsFeed });
        setNewsSource('Google News');
      })
      .catch(() => {
        setNewsData({ teamNews: teamNewsPreview, newsFeed: mockNewsFeed });
        setNewsSource('Mock');
      });
  }, []);

  const loadScores = useCallback(() => {
    setScores((s) => ({ ...s, loading: true }));
    fetchScores()
      .then((games) => setScores({ games, loading: false, error: null }))
      .catch((err) => setScores({ games: [], loading: false, error: err.message }));
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  useEffect(() => {
    const id = setInterval(loadScores, SCORES_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadScores]);

  return (
    <div className={styles.home}>
      {/* Key Dates (top) */}
      <section className={styles.keyDatesSection}>
        <KeyDatesWidget />
      </section>

      {/* Daily Schedule (collapsible, ESPN, auto-refresh today) */}
      <section className={styles.dailyScheduleSection}>
        <DailySchedule />
      </section>

      {/* Hero / Daily Report */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <SourceBadge source="Mock" />
        </div>
        <span className={styles.heroDate}>{dailyReport.date}</span>
        <h1 className={styles.heroHeadline}>{dailyReport.headline}</h1>
        <p className={styles.heroSummary}>{dailyReport.summary}</p>
        <div className={styles.heroInsights}>
          {dailyReport.keyInsights.map((insight) => (
            <span key={insight.label} className={styles.insight}>
              <strong>{insight.label}:</strong> {insight.value}
            </span>
          ))}
        </div>
      </section>

      {/* Live Scores (today snapshot, 60s refresh) */}
      <section className={styles.liveScoresSection}>
        <LiveScores
          games={scores.games}
          loading={scores.loading}
          error={scores.error}
          compact
        />
      </section>

      {/* Stat Cards */}
      <section className={styles.statsSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Snapshot</h2>
          <SourceBadge source="Mock" />
        </div>
        <div className={styles.stats}>
          {statCards.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              trend={stat.trend}
              subtext={stat.subtext}
            />
          ))}
        </div>
      </section>

      {/* Main Grid */}
      <div className={styles.grid}>
        <section className={styles.matchups} id="matchups">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Today&apos;s Key Matchups</h2>
            <SourceBadge source="Mock" />
          </div>
          <div className={styles.matchupList}>
            {topMatchups.map((m) => (
              <MatchupPreview key={m.id} matchup={m} />
            ))}
          </div>
        </section>

        <aside className={styles.sidebar}>
          <div className={styles.widgetSection} id="odds">
            <OddsMovementWidget movements={oddsMovement} source="Mock" />
          </div>
          <div className={styles.widgetSection} id="news">
            <NewsFeed items={newsData.newsFeed} source={newsSource} />
          </div>
          <div className={styles.widgetSection} id="news-teams">
            <TeamNewsPreview items={newsData.teamNews} source={newsSource} />
          </div>
        </aside>
      </div>
    </div>
  );
}
