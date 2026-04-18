/**
 * YesterdayScorecard — premium glass strip summarizing yesterday's picks.
 *
 * Consumes the canonical `scorecardSummary` from useMlbPicks() — no independent
 * fetch. When `summary` is omitted (legacy call site), falls back to fetching
 * /api/mlb/picks/scorecard once; deprecated path.
 */

import { useEffect, useState } from 'react';
import styles from './YesterdayScorecard.module.css';

function Chip({ label, won, lost, push }) {
  const hasData = won + lost + push > 0;
  return (
    <div className={styles.chip}>
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chipValue}>
        {hasData ? `${won}-${lost}${push ? `-${push}` : ''}` : '—'}
      </span>
    </div>
  );
}

function resultIntent(topPlayResult) {
  if (topPlayResult === 'won') return { text: 'Top Play hit', variant: 'won' };
  if (topPlayResult === 'lost') return { text: 'Top Play missed', variant: 'loss' };
  if (topPlayResult === 'push') return { text: 'Top Play pushed', variant: 'neutral' };
  return null;
}

export default function YesterdayScorecard({ summary: injected, compact = false, dateOverride }) {
  // ── Data resolution: injected > fetched fallback ──
  const [fetched, setFetched] = useState(null);
  const [loading, setLoading] = useState(!injected);

  useEffect(() => {
    if (injected) return;
    const url = dateOverride ? `/api/mlb/picks/scorecard?date=${dateOverride}` : '/api/mlb/picks/scorecard';
    let cancelled = false;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setFetched(d?.scorecard || null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [injected, dateOverride]);

  const card = injected || fetched;

  if (loading && !card) {
    return <div className={`${styles.scorecard} ${styles.loading} ${compact ? styles.compact : ''}`} aria-hidden="true" />;
  }
  if (!card) return null;

  const overall = card.overall || { won: 0, lost: 0, push: 0, pending: 0 };
  const graded = overall.won + overall.lost;
  const bm = card.byMarket || {};
  const ml = bm.moneyline || {};
  const rl = bm.runline || {};
  const tot = bm.total || {};

  const dateLabel = card.date
    ? new Date(card.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : 'Yesterday';

  const intent = resultIntent(card.topPlayResult);
  const record = graded > 0 ? `${overall.won}-${overall.lost}${overall.push ? `-${overall.push}` : ''}` : '—';
  const winPct = graded > 0 ? Math.round((overall.won / graded) * 100) : null;

  return (
    <section className={`${styles.scorecard} ${compact ? styles.compact : ''}`} aria-label="Yesterday's scorecard">
      <div className={styles.glassFrame} />

      <header className={styles.header}>
        <span className={styles.eyebrow}>Yesterday's Scorecard</span>
        <span className={styles.dateLabel}>{dateLabel}</span>
      </header>

      <div className={styles.body}>
        <div className={styles.recordBlock}>
          <span className={styles.recordLabel}>Record</span>
          <span className={styles.recordValue}>{record}</span>
          <span className={styles.recordMeta}>
            {graded > 0
              ? `${graded} graded${winPct !== null ? ` · ${winPct}% win rate` : ''}${overall.pending ? ` · ${overall.pending} pending` : ''}`
              : (card.note || 'Awaiting settlement')}
          </span>
        </div>

        {!compact && (
          <div className={styles.chipRow} role="list">
            <Chip label="Moneyline" won={ml.won ?? 0} lost={ml.lost ?? 0} push={ml.push ?? 0} />
            <Chip label="Run Line" won={rl.won ?? 0} lost={rl.lost ?? 0} push={rl.push ?? 0} />
            <Chip label="Total" won={tot.won ?? 0} lost={tot.lost ?? 0} push={tot.push ?? 0} />
          </div>
        )}

        {compact && (
          <div className={styles.chipRowCompact}>
            <Chip label="ML" won={ml.won ?? 0} lost={ml.lost ?? 0} push={ml.push ?? 0} />
            <Chip label="RL" won={rl.won ?? 0} lost={rl.lost ?? 0} push={rl.push ?? 0} />
            <Chip label="Tot" won={tot.won ?? 0} lost={tot.lost ?? 0} push={tot.push ?? 0} />
          </div>
        )}

        {intent && (
          <span className={`${styles.intentPill} ${styles[`intent_${intent.variant}`]}`}>{intent.text}</span>
        )}
      </div>
    </section>
  );
}
