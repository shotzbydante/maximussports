import { topMatchups } from '../data/mockData';
import MatchupPreview from '../components/dashboard/MatchupPreview';
import styles from './Games.module.css';

export default function Games() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Games</h1>
        <p className={styles.subtitle}>Today&apos;s key matchups — previews, spreads, and upset watch</p>
      </header>

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
