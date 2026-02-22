/**
 * Dynamic stat cards — ESPN scores, rankings, pinned news.
 * Upset alerts, ranked teams in action, news velocity.
 */

import StatCard from '../shared/StatCard';
import SourceBadge from '../shared/SourceBadge';
import styles from './DynamicStats.module.css';

export default function DynamicStats({ stats }) {
  if (!stats?.length) return null;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Snapshot</h2>
      </div>
      <div className={styles.cards}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.card}>
            <StatCard
              label={stat.label}
              value={stat.value}
              trend={stat.trend}
              subtext={stat.subtext}
            />
            <span className={styles.badgeWrap}>
              <SourceBadge source={stat.source} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
