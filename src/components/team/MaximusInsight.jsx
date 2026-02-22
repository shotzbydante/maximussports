/**
 * Maximus's Insight — ATS (Against The Spread) record bubble.
 * Free tier Odds API does not include historical odds; shows unavailable with SourceBadge.
 */

import SourceBadge from '../shared/SourceBadge';
import styles from './MaximusInsight.module.css';

export default function MaximusInsight() {
  return (
    <section className={styles.bubble}>
      <div className={styles.header}>
        <h3 className={styles.title}>Maximus&apos;s Insight</h3>
        <SourceBadge source="Odds API" />
      </div>
      <div className={styles.content}>
        <p className={styles.label}>ATS (Against The Spread)</p>
        <p className={styles.unavailable}>
          ATS data unavailable — Odds API free tier does not include historical odds.
        </p>
        <p className={styles.hint}>
          Season to date, last 30 days, and last 7 days would require historical odds API access.
        </p>
      </div>
    </section>
  );
}
