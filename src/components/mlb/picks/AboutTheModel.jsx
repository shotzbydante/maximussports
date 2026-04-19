/**
 * AboutTheModel — tight, premium explainer of what the user is looking at.
 *
 * Used once per surface (typically near TrackRecord / Scorecard). Static copy.
 * Expandable to reveal one more paragraph of context.
 *
 * Tone: calm confidence. No marketing.
 */

import { useState } from 'react';
import styles from './AboutTheModel.module.css';

export default function AboutTheModel({ variant = 'full' }) {
  const [open, setOpen] = useState(false);

  const summary = variant === 'compact'
    ? 'Model-scored picks, 0–100 conviction, graded daily. Top Plays are the highest-conviction opportunities on today\'s slate.'
    : 'Every pick carries a 0–100 conviction score composed of edge, model confidence, situational context, and market quality. Top Plays clear the highest bar. Every slate is graded against real results, and those grades feed a daily audit that informs the next slate.';

  return (
    <aside className={`${styles.card} ${variant === 'compact' ? styles.cardCompact : ''}`} aria-label="About the model">
      <div className={styles.frame} aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.kicker}>About the model</span>
      </header>
      <p className={styles.summary}>{summary}</p>
      {variant !== 'compact' && (
        <>
          <div className={`${styles.detail} ${open ? styles.detailOpen : ''}`}>
            <p>
              Picks are not hand-curated. The score is a composite, bounded [0, 1] and scaled 0–100
              for display. Tiering uses both a hard floor and a slate-relative percentile so quiet
              days surface only the cleanest edges.
            </p>
            <p>
              Results are persisted daily. Audit artifacts measure what's working by market, by tier,
              and by signal. Tuning adjustments are bounded, logged, and reversible — and they only
              apply after a shadow window with real sample.
            </p>
          </div>
          <button type="button" className={styles.toggle} onClick={() => setOpen(v => !v)} aria-expanded={open}>
            {open ? 'Show less' : 'How it\'s graded & tuned'}
          </button>
        </>
      )}
    </aside>
  );
}
