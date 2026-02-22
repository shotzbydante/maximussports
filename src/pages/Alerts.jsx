import { topMatchups, oddsMovement } from '../data/mockData';
import OddsMovementWidget from '../components/dashboard/OddsMovementWidget';
import MatchupPreview from '../components/dashboard/MatchupPreview';
import styles from './Alerts.module.css';

const upsetMatchups = topMatchups.filter((m) => m.upsetAlert);

export default function Alerts() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Alerts</h1>
        <p className={styles.subtitle}>Upset watch, odds movement, and sharp action</p>
      </header>

      <div className={styles.grid}>
        {/* Upset Alerts */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Upset Alerts <span className={styles.count}>({upsetMatchups.length})</span>
          </h2>
          {upsetMatchups.length === 0 ? (
            <div className={styles.empty}>No upset alerts today.</div>
          ) : (
            <div className={styles.matchupList}>
              {upsetMatchups.map((m) => (
                <MatchupPreview key={m.id} matchup={m} />
              ))}
            </div>
          )}
        </section>

        {/* Odds Movement */}
        <aside className={styles.sidebar}>
          <section className={styles.section}>
            <OddsMovementWidget movements={oddsMovement} />
          </section>
        </aside>
      </div>
    </div>
  );
}
