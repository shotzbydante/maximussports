import { useState, useEffect } from 'react';
import {
  dailyReport,
  topMatchups,
  oddsMovement,
  newsFeed as mockNewsFeed,
  teamNewsPreview,
  statCards,
} from '../data/mockData';
import { fetchAggregatedNews } from '../api/news';
import StatCard from '../components/shared/StatCard';
import MatchupPreview from '../components/dashboard/MatchupPreview';
import OddsMovementWidget from '../components/dashboard/OddsMovementWidget';
import NewsFeed from '../components/dashboard/NewsFeed';
import TeamNewsPreview from '../components/dashboard/TeamNewsPreview';
import styles from './Home.module.css';

const FEATURED_SLUGS = ['duke-blue-devils', 'houston-cougars', 'purdue-boilermakers', 'kansas-jayhawks'];

export default function Home() {
  const [newsData, setNewsData] = useState({
    teamNews: teamNewsPreview,
    newsFeed: mockNewsFeed,
  });

  useEffect(() => {
    fetchAggregatedNews(FEATURED_SLUGS)
      .then(({ teamNews, newsFeed }) => setNewsData({ teamNews, newsFeed }))
      .catch(() => setNewsData({ teamNews: teamNewsPreview, newsFeed: mockNewsFeed }));
  }, []);

  return (
    <div className={styles.home}>
      {/* Hero / Daily Report */}
      <section className={styles.hero}>
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

      {/* Stat Cards */}
      <section className={styles.stats}>
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            trend={stat.trend}
            subtext={stat.subtext}
          />
        ))}
      </section>

      {/* Main Grid */}
      <div className={styles.grid}>
        {/* Left: Matchup Previews */}
        <section className={styles.matchups} id="matchups">
          <h2 className={styles.sectionTitle}>Today&apos;s Key Matchups</h2>
          <div className={styles.matchupList}>
            {topMatchups.map((m) => (
              <MatchupPreview key={m.id} matchup={m} />
            ))}
          </div>
        </section>

        {/* Right Column */}
        <aside className={styles.sidebar}>
          <div className={styles.widgetSection} id="odds">
            <OddsMovementWidget movements={oddsMovement} />
          </div>
          <div className={styles.widgetSection} id="news">
            <NewsFeed items={newsData.newsFeed} />
          </div>
          <div className={styles.widgetSection} id="news-teams">
            <TeamNewsPreview items={newsData.teamNews} />
          </div>
        </aside>
      </div>
    </div>
  );
}
