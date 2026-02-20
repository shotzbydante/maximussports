import {
  dailyReport,
  topMatchups,
  oddsMovement,
  newsFeed,
  redditSentiment,
  statCards,
} from '../data/mockData';
import StatCard from '../components/shared/StatCard';
import MatchupPreview from '../components/dashboard/MatchupPreview';
import OddsMovementWidget from '../components/dashboard/OddsMovementWidget';
import NewsFeed from '../components/dashboard/NewsFeed';
import RedditSentiment from '../components/dashboard/RedditSentiment';
import styles from './Home.module.css';

export default function Home() {
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
            <NewsFeed items={newsFeed} />
          </div>
          <div className={styles.widgetSection} id="sentiment">
            <RedditSentiment items={redditSentiment} />
          </div>
        </aside>
      </div>
    </div>
  );
}
