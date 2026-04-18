/**
 * YesterdayScorecard — "3-1 overall • Top Play hit" at the top of the picks page.
 *
 * Fetches /api/mlb/picks/scorecard and renders a compact, editorial strip.
 * Graceful empty states: loading, no picks yesterday, awaiting settlement.
 */

import { useEffect, useState } from 'react';
import styles from './YesterdayScorecard.module.css';

function Chip({ label, won, lost, push }) {
  const hasData = won + lost + push > 0;
  return (
    <span className={styles.chip}>
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chipValue}>
        {hasData ? `${won}-${lost}${push ? `-${push}` : ''}` : '—'}
      </span>
    </span>
  );
}

export default function YesterdayScorecard({ dateOverride }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const url = dateOverride ? `/api/mlb/picks/scorecard?date=${dateOverride}` : '/api/mlb/picks/scorecard';
    fetch(url)
      .then(r => r.json())
      .then(d => setCard(d?.scorecard || null))
      .catch(e => setErr(e?.message || 'fetch failed'))
      .finally(() => setLoading(false));
  }, [dateOverride]);

  if (loading) {
    return <div className={`${styles.scorecard} ${styles.skeleton}`} aria-hidden="true" />;
  }

  if (err || !card) {
    return null; // keep UI quiet when scorecard hasn't been computed yet
  }

  const overall = card.overall || { won: 0, lost: 0, push: 0, pending: 0 };
  const graded = overall.won + overall.lost;
  const record = graded > 0
    ? `${overall.won}-${overall.lost}${overall.push ? ` (${overall.push} push)` : ''}`
    : null;

  const bm = card.byMarket || {};
  const ml = bm.moneyline || {};
  const rl = bm.runline || {};
  const tot = bm.total || {};

  const dateLabel = card.date
    ? new Date(card.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : 'Yesterday';

  const noteBadge =
    card.topPlayResult === 'won' ? { text: 'Top Play hit', cls: styles.noteWin }
    : card.topPlayResult === 'lost' ? { text: 'Top Play missed', cls: styles.noteLoss }
    : card.note ? { text: card.note, cls: styles.noteNeutral }
    : null;

  return (
    <section className={styles.scorecard} aria-label="Yesterday's scorecard">
      <header className={styles.header}>
        <span className={styles.eyebrow}>Yesterday's Scorecard</span>
        <span className={styles.dateLabel}>{dateLabel}</span>
      </header>

      <div className={styles.body}>
        <div className={styles.recordBlock}>
          {record ? (
            <>
              <span className={styles.recordValue}>{record}</span>
              <span className={styles.recordMeta}>
                {graded === 1 ? '1 pick graded' : `${graded} picks graded`}
                {overall.pending > 0 ? ` · ${overall.pending} pending` : ''}
              </span>
            </>
          ) : (
            <>
              <span className={styles.recordValue}>—</span>
              <span className={styles.recordMeta}>{card.note || 'Awaiting settlement'}</span>
            </>
          )}
        </div>

        <div className={styles.chipRow}>
          <Chip label="ML" won={ml.won ?? 0} lost={ml.lost ?? 0} push={ml.push ?? 0} />
          <Chip label="RL" won={rl.won ?? 0} lost={rl.lost ?? 0} push={rl.push ?? 0} />
          <Chip label="Tot" won={tot.won ?? 0} lost={tot.lost ?? 0} push={tot.push ?? 0} />
        </div>

        {noteBadge && <span className={`${styles.note} ${noteBadge.cls}`}>{noteBadge.text}</span>}
      </div>
    </section>
  );
}
