/**
 * Compact championship odds badge: 🏆 +900 | 🏆 -120 | 🏆 —
 * Uses bestChanceAmerican (aggregated across books). Differentiates loading / notOffered / error with tooltips.
 * Non-blocking; no layout shift. Used in Bubble Watch and Team page header.
 */

import { getTeamSlug } from '../../utils/teamSlug';
import styles from './ChampionshipBadge.module.css';

function formatAmerican(american) {
  if (american == null || typeof american !== 'number') return null;
  if (american > 0) return `+${american}`;
  return String(american);
}

/** Derive display odds: Phase 4 uses bestChanceAmerican; backward compat with legacy american. */
function getDisplayAmerican(entry) {
  if (!entry) return null;
  if (entry.bestChanceAmerican != null && typeof entry.bestChanceAmerican === 'number') return entry.bestChanceAmerican;
  return entry.american ?? null;
}

export default function ChampionshipBadge({ slug = null, displayName = null, oddsMap = {}, oddsMeta = null, loading = false }) {
  const key = slug || (displayName ? getTeamSlug(displayName) : null);
  const entry = key && typeof oddsMap === 'object' ? oddsMap[key] : null;
  const american = getDisplayAmerican(entry);
  const label = formatAmerican(american);
  const fetchSucceeded = oddsMeta && (oddsMeta.stage === 'fetched' || oddsMeta.stage === 'kv_hit') && typeof oddsMap === 'object' && Object.keys(oddsMap).length > 0;
  const isError = oddsMeta && (oddsMeta.stage === 'error' || oddsMeta.source === 'error' || oddsMeta.stage === 'rate_limited');
  const notOffered = !loading && !entry && fetchSucceeded;
  const errorState = !loading && !entry && (isError || (typeof oddsMap === 'object' && Object.keys(oddsMap).length === 0 && oddsMeta?.stage !== 'kv_hit' && oddsMeta?.stage !== 'fetched'));

  let title = 'Championship odds';
  if (loading) title = 'Loading championship odds';
  else if (notOffered) title = 'Not listed in championship market';
  else if (errorState) title = 'Odds temporarily unavailable';
  else if (entry) {
    const best = formatAmerican(entry.bestChanceAmerican ?? entry.american);
    const payout = entry.bestPayoutAmerican != null ? formatAmerican(entry.bestPayoutAmerican) : null;
    const n = entry.booksCount ?? entry.samplesCount;
    title = `Best chance: ${best}`;
    if (payout && payout !== best) title += ` · Range: ${best} ↔ ${payout}`;
    if (n != null) title += ` · Based on ${n} book${n !== 1 ? 's' : ''}`;
    if (entry.updatedAt) title += ` · ${new Date(entry.updatedAt).toLocaleString()}`;
  }

  if (loading) {
    return (
      <span className={styles.badge} aria-hidden title={title}>
        <span className={styles.placeholder}>🏆 —</span>
      </span>
    );
  }

  return (
    <span className={styles.badge} title={title}>
      🏆 {label != null ? label : '—'}
    </span>
  );
}
