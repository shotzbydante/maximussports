/**
 * TrackRecord — compact trust signal strip.
 *
 * Data-cascade:
 *   1. payload.trackRecord.season         → "Season: 112–84 · 57% win rate"
 *   2. scorecardSummary.trailing30d       → "Last 30 days: 54–38 · 59%"
 *   3. scorecardSummary.trailing7d        → "Last 7 days: 18–10 · 64%"
 *   4. fallback to a scaffolded "Tracking" state when no data is present yet,
 *      so the layout doesn't collapse on a fresh install.
 *
 * Optional second line: Top Play rate when payload exposes it.
 */

import styles from './TrackRecord.module.css';

function fmtRecord(rec) {
  if (!rec) return null;
  const won = rec.won ?? 0;
  const lost = rec.lost ?? 0;
  const push = rec.push ?? 0;
  const units = rec.units ?? rec.unitsPlusMinus;
  const graded = won + lost;
  if (graded === 0) return null;
  const winPct = Math.round((won / graded) * 100);
  return {
    record: `${won}–${lost}${push ? `–${push}` : ''}`,
    winPct,
    units: Number.isFinite(units) ? units : null,
  };
}

function resolvePrimary(trackRecord, scorecard) {
  if (trackRecord?.season) {
    const r = fmtRecord(trackRecord.season);
    if (r) return { label: 'Season', ...r };
  }
  if (scorecard?.trailing30d) {
    const r = fmtRecord(scorecard.trailing30d);
    if (r) return { label: 'Last 30 days', ...r };
  }
  if (scorecard?.trailing7d) {
    const r = fmtRecord(scorecard.trailing7d);
    if (r) return { label: 'Last 7 days', ...r };
  }
  if (trackRecord?.trailing7d) {
    const r = fmtRecord(trackRecord.trailing7d);
    if (r) return { label: 'Last 7 days', ...r };
  }
  return null;
}

export default function TrackRecord({ payload, scorecard, compact = false }) {
  const tr = payload?.trackRecord || null;
  const primary = resolvePrimary(tr, scorecard);
  const topPlayRate = tr?.topPlayWinRate30d || tr?.topPlayWinRate || null;

  return (
    <section className={`${styles.root} ${compact ? styles.compact : ''}`} aria-label="Track Record">
      <div className={styles.frame} aria-hidden="true" />
      <div className={styles.lead}>
        <span className={styles.kicker}>Track Record</span>
        {primary ? (
          <div className={styles.primary}>
            <span className={styles.primaryLabel}>{primary.label}</span>
            <span className={styles.primaryRecord}>{primary.record}</span>
            <span className={styles.primaryMeta}>
              {primary.winPct}% win rate
              {primary.units != null && (
                <>
                  <span className={styles.primaryDot}> · </span>
                  <span className={Number(primary.units) >= 0 ? styles.unitsPos : styles.unitsNeg}>
                    {Number(primary.units) >= 0 ? '+' : ''}{Number(primary.units).toFixed(1)} units
                  </span>
                </>
              )}
            </span>
          </div>
        ) : (
          <div className={styles.primary}>
            <span className={styles.primaryLabel}>Tracking</span>
            <span className={styles.primaryRecord}>—</span>
            <span className={styles.primaryMeta}>Results accumulate daily — check back after the next slate grades.</span>
          </div>
        )}
      </div>

      {topPlayRate != null && (
        <div className={styles.secondary}>
          <span className={styles.secondaryLabel}>Top Plays</span>
          <span className={styles.secondaryValue}>{Math.round(topPlayRate * 100)}%</span>
          <span className={styles.secondaryMeta}>win rate · last 30 days</span>
        </div>
      )}
    </section>
  );
}
