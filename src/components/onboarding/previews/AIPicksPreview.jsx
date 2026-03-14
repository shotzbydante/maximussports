/**
 * AIPicksPreview — static miniature replica of the Maximus Picks surface.
 * Used in the WelcomeModal onboarding Step 2. No live data queries.
 */
import styles from './OnboardingPreviews.module.css';

const COLUMNS = [
  {
    label: "Pick 'Ems",
    picks: [
      { team: 'Duke -375', tag: 'HIGH', tagClass: 'tagHigh', detail: 'vs Virginia' },
      { team: 'UConn -1000', tag: 'MED', tagClass: 'tagMedium', detail: 'vs Georgetown' },
    ],
  },
  {
    label: 'Against the Spread',
    picks: [
      { team: 'Duke -7.5', tag: 'MED', tagClass: 'tagMedium', detail: 'ATS edge +50%' },
      { team: 'UCLA +5.5', tag: 'MED', tagClass: 'tagMedium', detail: 'ATS edge +21%' },
    ],
  },
  {
    label: 'Value Leans',
    picks: [
      { team: 'Georgetown +230', tag: 'HIGH', tagClass: 'tagHigh', detail: 'Edge: +34pp' },
      { team: 'Toledo +275', tag: 'HIGH', tagClass: 'tagHigh', detail: 'Edge: +18pp' },
    ],
  },
  {
    label: 'Game Totals',
    picks: [
      { team: 'OVER 134.5', tag: 'HIGH', tagClass: 'tagHigh', detail: 'Clemson vs Duke' },
      { team: 'OVER 142.5', tag: 'MED', tagClass: 'tagMedium', detail: 'UCLA vs Michigan St' },
    ],
  },
];

export default function AIPicksPreview() {
  return (
    <div className={styles.previewRoot}>
      <div className={styles.header}>
        <p className={styles.headerLabel}>Maximus's Picks</p>
        <span className={`${styles.headerBadge} ${styles.headerBadgeUp}`}>Data-Driven</span>
      </div>

      <div className={styles.body}>
        <div className={styles.picksGrid}>
          {COLUMNS.map((col) => (
            <div key={col.label} className={styles.picksColumn}>
              <p className={styles.picksColumnHeader}>{col.label}</p>
              {col.picks.map((p) => (
                <div key={p.team} className={styles.pickCard}>
                  <div className={styles.miniCardRow}>
                    <p className={styles.pickTeam}>{p.team}</p>
                  </div>
                  <span className={`${styles.tag} ${styles[p.tagClass]}`}>{p.tag}</span>
                  <p className={styles.pickDetail}>{p.detail}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
