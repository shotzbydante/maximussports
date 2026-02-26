/**
 * Compact championship odds badge: 🏆 +900 | 🏆 -120 | 🏆 —
 * Non-blocking; no layout shift. Used in Bubble Watch and Team page header.
 */

import { getTeamSlug } from '../../utils/teamSlug';
import styles from './ChampionshipBadge.module.css';

function formatAmerican(american) {
  if (american == null || typeof american !== 'number') return null;
  if (american > 0) return `+${american}`;
  return String(american);
}

export default function ChampionshipBadge({ slug = null, displayName = null, oddsMap = {}, loading = false }) {
  const key = slug || (displayName ? getTeamSlug(displayName) : null);
  const entry = key && typeof oddsMap === 'object' ? oddsMap[key] : null;
  const american = entry?.american;
  const updatedAt = entry?.updatedAt;
  const label = formatAmerican(american);
  const title = updatedAt
    ? `Championship odds${entry?.book ? ` (${entry.book})` : ''} · ${new Date(updatedAt).toLocaleString()}`
    : 'Championship odds';

  if (loading) {
    return (
      <span className={styles.badge} aria-hidden title="Loading championship odds">
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
