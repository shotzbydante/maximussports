/**
 * OddsInsightsPreview — static miniature replica of the Odds Insights surface.
 * Used in the WelcomeModal onboarding Step 2. No live data queries.
 */
import styles from './OnboardingPreviews.module.css';

const MATCHUPS = [
  {
    id: 1,
    away: 'Duke',
    home: 'Virginia',
    spread: '-7.5',
    signal: 'MEDIUM',
    signalClass: 'tagMedium',
    edge: '+18pp',
    atsNote: 'ATS form: 7–0 (100%)',
  },
  {
    id: 2,
    away: 'Georgetown',
    home: 'UConn',
    spread: '+230',
    signal: 'HIGH',
    signalClass: 'tagHigh',
    edge: '+34pp',
    atsNote: 'Model: 48% vs Market: 14%',
  },
];

const MOVERS = [
  { label: 'Biggest Mover', team: 'Houston -14.5', detail: 'Opened -12 · +2.5 pts' },
  { label: 'Closest Spread', team: 'Duke vs UNC', detail: 'Pick \'em · -1.0' },
];

export default function OddsInsightsPreview() {
  return (
    <div className={styles.previewRoot}>
      <div className={styles.header}>
        <p className={styles.headerLabel}>Odds Insights</p>
        <span className={`${styles.headerBadge} ${styles.headerBadgeAccent}`}>Live Board</span>
      </div>

      <div className={styles.body}>
        <div className={styles.oddsGrid}>
          {/* Market movers row */}
          <div className={styles.oddsRow}>
            {MOVERS.map((m) => (
              <div key={m.label} className={styles.miniCard}>
                <p className={styles.miniCardSub} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{m.label}</p>
                <p className={styles.miniCardTitle}>{m.team}</p>
                <p className={styles.miniCardSub}>{m.detail}</p>
              </div>
            ))}
          </div>

          {/* Matchup cards */}
          {MATCHUPS.map((g) => (
            <div key={g.id} className={styles.miniCard}>
              <div className={styles.miniCardRow}>
                <p className={styles.miniCardTitle}>{g.away} vs {g.home}</p>
                <span className={`${styles.tag} ${styles[g.signalClass]}`}>{g.signal}</span>
              </div>
              <div className={styles.miniCardRow}>
                <span className={styles.spreadValue}>{g.spread}</span>
                <span className={styles.edgeValue}>Edge: {g.edge}</span>
              </div>
              <p className={styles.miniCardSub}>{g.atsNote}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
