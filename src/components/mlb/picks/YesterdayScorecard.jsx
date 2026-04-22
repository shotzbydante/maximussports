/**
 * YesterdayScorecard — premium glass strip with editorial takeaway.
 *
 * New in this revision:
 *   - scorecardTakeaway() one-liner (positive/negative/neutral tone)
 *   - Optional trailing-3-day rolling record (rendered only if the backend
 *     provides scorecardSummary.trailing3d)
 *   - Streak elevated into a dedicated chip when meaningful (≥2)
 */

import { useEffect, useState } from 'react';
import { scorecardTakeaway, trailingRecord } from '../../../features/mlb/picks/scorecardTakeaway';
import styles from './YesterdayScorecard.module.css';

function TierChip({ label, variant, rec }) {
  const graded = (rec?.won ?? 0) + (rec?.lost ?? 0);
  const record = graded > 0
    ? `${rec?.won ?? 0}-${rec?.lost ?? 0}${rec?.push ? `-${rec.push}` : ''}`
    : '—';
  return (
    <span className={`${styles.tierChip} ${styles[`tierChip_${variant}`]}`}>
      <span className={styles.tierChipLabel}>{label}</span>
      <span className={styles.tierChipValue}>{record}</span>
    </span>
  );
}

function Chip({ label, won, lost, push }) {
  const hasData = (won + lost + push) > 0;
  return (
    <div className={styles.chip}>
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chipValue}>
        {hasData ? `${won}-${lost}${push ? `-${push}` : ''}` : '—'}
      </span>
    </div>
  );
}

export default function YesterdayScorecard({ summary: injected, compact = false, dateOverride }) {
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
  const graded = (overall.won ?? 0) + (overall.lost ?? 0);
  const bm = card.byMarket || {};
  const ml = bm.moneyline || {};
  const rl = bm.runline || {};
  const tot = bm.total || {};
  const bt = card.byTier || {};
  const tierHasData = (tier) => ((tier?.won ?? 0) + (tier?.lost ?? 0) + (tier?.push ?? 0)) > 0;
  const showByTier = !compact && (tierHasData(bt.tier1) || tierHasData(bt.tier2) || tierHasData(bt.tier3));

  const dateLabel = card.date
    ? new Date(card.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : 'Yesterday';

  const record = graded > 0 ? `${overall.won}-${overall.lost}${overall.push ? `-${overall.push}` : ''}` : '—';
  const winPct = graded > 0 ? Math.round((overall.won / graded) * 100) : null;
  const pendingCount = overall.pending ?? 0;
  const allPending = graded === 0 && pendingCount > 0;

  const takeaway = scorecardTakeaway(card);
  const trailing = trailingRecord(card, 'trailing3d');

  const intentCls = takeaway.tone === 'positive' ? styles.intent_positive
                  : takeaway.tone === 'negative' ? styles.intent_negative
                  : styles.intent_neutral;

  const streak = card.streak && (card.streak.count ?? 0) >= 2 ? card.streak : null;

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
              ? `${graded} graded${winPct !== null ? ` · ${winPct}% win rate` : ''}${pendingCount ? ` · ${pendingCount} pending` : ''}`
              : allPending
                ? `Awaiting settlement · ${pendingCount} pick${pendingCount === 1 ? '' : 's'} pending`
                : (card.note || 'No graded picks yet')}
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

        {showByTier && (
          <div className={styles.tierRow} role="list" aria-label="By tier">
            <span className={styles.tierRowLabel}>By tier</span>
            {tierHasData(bt.tier1) && (
              <TierChip label="Tier 1" variant="tier1" rec={bt.tier1} />
            )}
            {tierHasData(bt.tier2) && (
              <TierChip label="Tier 2" variant="tier2" rec={bt.tier2} />
            )}
            {tierHasData(bt.tier3) && (
              <TierChip label="Tier 3" variant="tier3" rec={bt.tier3} />
            )}
          </div>
        )}

        <div className={styles.metaRow}>
          {streak && (
            <span className={`${styles.streakChip} ${streak.type === 'won' ? styles.streak_won : streak.type === 'lost' ? styles.streak_lost : ''}`}>
              <span className={styles.streakGlyph} aria-hidden="true">
                {streak.type === 'won' ? '▲' : streak.type === 'lost' ? '▼' : '•'}
              </span>
              <span className={styles.streakLabel}>
                {streak.count}-day {streak.type === 'won' ? 'winning run' : streak.type === 'lost' ? 'cold streak' : 'even streak'}
              </span>
            </span>
          )}
          {trailing && (
            <span className={styles.trailingChip} title={`${trailing.label}: ${trailing.record} (${trailing.winRate}%)`}>
              <span className={styles.trailingLabel}>{trailing.label}</span>
              <span className={styles.trailingValue}>{trailing.record}</span>
              <span className={styles.trailingPct}>{trailing.winRate}%</span>
            </span>
          )}
        </div>

        {takeaway.text && (
          <p className={`${styles.takeaway} ${intentCls}`}>
            <span className={styles.takeawayKicker}>Takeaway</span>
            <span className={styles.takeawayText}>{takeaway.text}</span>
          </p>
        )}
      </div>
    </section>
  );
}
