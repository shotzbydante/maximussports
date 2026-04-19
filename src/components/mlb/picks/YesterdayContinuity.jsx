/**
 * YesterdayContinuity — tight "Top Play hit yesterday" continuity strip that
 * appears above Top Play. Built from REAL scorecardSummary data only.
 * Renders nothing when there's no yesterday, no top-play result, or when the
 * data is all pending.
 *
 * Purpose: habit-building reinforcement without victory-lap tone.
 */

import styles from './YesterdayContinuity.module.css';

function dateLabel(iso) {
  if (!iso) return 'Yesterday';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return 'Yesterday'; }
}

export default function YesterdayContinuity({ summary }) {
  if (!summary) return null;

  const topResult = summary.topPlayResult;
  const overall = summary.overall || {};
  const graded = (overall.won ?? 0) + (overall.lost ?? 0);

  // We require a real graded signal — no "awaiting settlement" filler.
  if (!topResult || topResult === 'pending') return null;
  if (graded === 0) return null;

  const isWin = topResult === 'won';
  const isLoss = topResult === 'lost';
  const isPush = topResult === 'push';

  // Streak reinforcement — only when truthful and ≥2 days
  const streak = summary.streak && (summary.streak.count ?? 0) >= 2 ? summary.streak : null;

  let text;
  if (isWin) text = 'Top Play cashed yesterday';
  else if (isLoss) text = 'Top Play missed yesterday';
  else if (isPush) text = 'Top Play pushed yesterday';
  else return null;

  const variant = isWin ? 'positive' : isLoss ? 'negative' : 'neutral';

  return (
    <aside
      className={`${styles.continuity} ${styles[`variant_${variant}`]}`}
      aria-label={`${text}. ${graded} picks graded.`}
    >
      <span className={styles.glyph} aria-hidden="true">
        {isWin ? '✓' : isLoss ? '✕' : '='}
      </span>
      <span className={styles.label}>{dateLabel(summary.date)}</span>
      <span className={styles.text}>{text}</span>
      <span className={styles.dot}>·</span>
      <span className={styles.meta}>{overall.won ?? 0}–{overall.lost ?? 0} board</span>
      {streak && streak.type === 'won' && (
        <>
          <span className={styles.dot}>·</span>
          <span className={styles.streak}>
            <span className={styles.streakGlyph} aria-hidden="true">▲</span>
            {streak.count}-day run
          </span>
        </>
      )}
    </aside>
  );
}
