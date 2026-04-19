/**
 * HowItWorks — compact explanatory block describing Maximus's Picks.
 *
 * Appears between the Top Play hero and the tier sections. Compact in home
 * mode, fuller on the Insights page.
 */

import styles from './HowItWorks.module.css';

const POINTS = [
  {
    icon: '●',
    title: 'Every pick carries a conviction score',
    body: 'A 0–100 composite of edge, model confidence, situational context, and market quality. No hand-picks.',
  },
  {
    icon: '◆',
    title: 'Only the best edges surface as Top Plays',
    body: 'Elite band (90+) demands both score and percentile. Strong, Solid, and Lean follow proportionally.',
  },
  {
    icon: '◇',
    title: "Bet-type structure inside every tier",
    body: "Pick 'Ems, Spreads, Game Totals, and Value Leans are organized inside each conviction level.",
  },
  {
    icon: '▲',
    title: 'Graded daily. Built to compound.',
    body: "Yesterday's scorecard feeds a self-improvement loop. The system learns from what it got right and wrong.",
  },
];

export default function HowItWorks({ variant = 'full' }) {
  if (variant === 'home') {
    return (
      <aside className={`${styles.block} ${styles.blockHome}`}>
        <div className={styles.frame} aria-hidden="true" />
        <div className={styles.header}>
          <span className={styles.kicker}>How it works</span>
          <p className={styles.title}>
            Every pick is model-scored 0–100 and tiered by conviction. Top Plays clear the highest bar. Results are graded daily.
          </p>
        </div>
        <a href="/mlb/insights" className={styles.cta}>See the full board →</a>
      </aside>
    );
  }

  return (
    <aside className={styles.block}>
      <div className={styles.frame} aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.kicker}>How it works</span>
        <h3 className={styles.title}>Model-scored. Tiered by conviction. Graded every day.</h3>
      </header>
      <div className={styles.grid}>
        {POINTS.map((p, i) => (
          <div key={i} className={styles.point}>
            <span className={styles.pointIcon} aria-hidden="true">{p.icon}</span>
            <div className={styles.pointText}>
              <span className={styles.pointTitle}>{p.title}</span>
              <p className={styles.pointBody}>{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
