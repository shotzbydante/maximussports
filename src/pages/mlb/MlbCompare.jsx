/**
 * MLB Compare Teams — side-by-side team comparison landing page.
 * Premium placeholder shell ready for live data integration.
 */
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import styles from './MlbCompare.module.css';

const COMPARE_ROWS = [
  { label: 'Projected Wins', a: '—', b: '—' },
  { label: 'World Series Odds', a: '—', b: '—' },
  { label: 'Division Rank', a: '—', b: '—' },
  { label: 'Playoff Probability', a: '—', b: '—' },
];

export default function MlbCompare() {
  const { buildPath } = useWorkspace();

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>Team Comparison</span>
          <h1 className={styles.heroTitle}>Compare MLB Teams</h1>
          <p className={styles.heroBody}>
            Stack projections, odds, and outlooks side by side to find edges
            across the league.
          </p>
          <Link to={buildPath('/season-model')} className={styles.heroLink}>
            &larr; Back to Season Model
          </Link>
        </div>
      </section>

      {/* ── Comparison Card ── */}
      <section className={styles.compareCard}>
        <div className={styles.compareHeader}>
          <div className={styles.teamSlot}>
            <div className={styles.teamPlaceholder}>Team A</div>
            <span className={styles.teamHint}>Select a team</span>
          </div>
          <span className={styles.vsLabel}>VS</span>
          <div className={styles.teamSlot}>
            <div className={styles.teamPlaceholder}>Team B</div>
            <span className={styles.teamHint}>Select a team</span>
          </div>
        </div>

        <div className={styles.compareBody}>
          {COMPARE_ROWS.map((row) => (
            <div key={row.label} className={styles.compareRow}>
              <span className={styles.compareValLeft}>{row.a}</span>
              <span className={styles.compareLabel}>{row.label}</span>
              <span className={styles.compareValRight}>{row.b}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
