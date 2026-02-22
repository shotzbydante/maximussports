import { dailyReport, rankingsContext } from '../data/mockData';
import RankingsTable from '../components/insights/RankingsTable';
import styles from './Insights.module.css';

export default function Insights() {
  const { apTop5, bracketFavorites, biggestMovers } = rankingsContext;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Insights</h1>
        <p className={styles.subtitle}>Daily intelligence, rankings, and bubble watch</p>
      </header>

      {/* Daily Report */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Daily Report</h2>
        <div className={styles.report}>
          <span className={styles.reportDate}>{dailyReport.date}</span>
          <h3 className={styles.reportHeadline}>{dailyReport.headline}</h3>
          <p className={styles.reportSummary}>{dailyReport.summary}</p>
          <div className={styles.reportInsights}>
            {dailyReport.keyInsights.map((insight) => (
              <span key={insight.label} className={styles.insight}>
                <strong>{insight.label}:</strong> {insight.value}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Rankings Context */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Rankings Snapshot</h2>
        <div className={styles.snapshot}>
          <div className={styles.snapshotCol}>
            <span className={styles.snapshotLabel}>AP Top 5</span>
            <ol className={styles.snapshotList}>
              {apTop5.map((team, i) => (
                <li key={team}>{i + 1}. {team}</li>
              ))}
            </ol>
          </div>
          <div className={styles.snapshotCol}>
            <span className={styles.snapshotLabel}>Bracket Favorites</span>
            <ul className={styles.snapshotList}>
              {bracketFavorites.map((team) => (
                <li key={team}>{team}</li>
              ))}
            </ul>
          </div>
          <div className={styles.snapshotCol}>
            <span className={styles.snapshotLabel}>Biggest Movers</span>
            <ul className={styles.snapshotList}>
              {biggestMovers.map(({ team, direction, spots }) => (
                <li key={team}>
                  {team}
                  <span className={direction === 'up' ? styles.moveUp : styles.moveDown}>
                    {direction === 'up' ? '↑' : '↓'} {spots}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Filterable Rankings Table */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Bubble Watch — Full Rankings</h2>
        <RankingsTable />
      </section>
    </div>
  );
}
