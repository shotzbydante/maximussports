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
    title: 'Model-scored, not hand-picked',
    body: 'Every pick is graded 0–100 by a composite that blends edge, model confidence, situational context, and market quality.',
  },
  {
    icon: '◆',
    title: 'Tiered by conviction',
    body: 'Top Plays require a score of 75+ and rank in today\'s top 10%. Strong Plays and Leans follow proportionally.',
  },
  {
    icon: '◇',
    title: 'Grouped by bet type',
    body: "Inside each tier, picks are organized as Pick 'Ems, Spreads, Game Totals, and Value Leans.",
  },
  {
    icon: '▲',
    title: 'Evaluated every day',
    body: 'Yesterday\'s scorecard grades real results and feeds the model\'s self-improvement loop.',
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
            Model-scored picks, tiered by conviction. Every day's results are graded and feed the system's self-improvement loop.
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
        <h3 className={styles.title}>Model-scored. Conviction-first. Graded every day.</h3>
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
