/**
 * SeasonCountdown — clock to the first regular-season game of the next season.
 *
 *   variant="clock"   → four boxed units (days / hours / minutes / seconds)
 *   variant="inline"  → one line, "122d 21h 14m 09s", for strips and tiles
 *
 * Driven by a workspace's `nextSeason` config. Renders nothing when the
 * workspace has no valid target, and swaps to a "season is under way" line
 * once the target has passed (a reminder to flip the season state).
 */

import { useCountdown, describeCountdown, pad2 } from './countdown';
import styles from './season.module.css';

export default function SeasonCountdown({ nextSeason, variant = 'clock', className = '' }) {
  const parts = useCountdown(nextSeason?.firstGameAt);
  if (!nextSeason || !parts.valid) return null;

  const label = nextSeason.label || 'Next season';
  const shortLabel = nextSeason.shortLabel || label;

  if (variant === 'inline') {
    return (
      <span
        className={`${styles.inlineClock} ${className}`}
        role="timer"
        aria-label={parts.done ? `${label} is under way` : `${describeCountdown(parts)} until ${label}`}
      >
        {parts.done ? (
          <span aria-hidden="true">{shortLabel} is here</span>
        ) : (
          <span aria-hidden="true">
            <span className={styles.inlineLabel}>{shortLabel} in </span>
            <span className={styles.inlineDigits}>
              {parts.days}d {pad2(parts.hours)}h {pad2(parts.minutes)}m {pad2(parts.seconds)}s
            </span>
          </span>
        )}
      </span>
    );
  }

  const units = [
    { key: 'days', value: String(parts.days), label: parts.days === 1 ? 'Day' : 'Days' },
    { key: 'hours', value: pad2(parts.hours), label: 'Hours' },
    { key: 'minutes', value: pad2(parts.minutes), label: 'Minutes' },
    { key: 'seconds', value: pad2(parts.seconds), label: 'Seconds' },
  ];

  return (
    <div className={`${styles.clock} ${className}`}>
      <div className={styles.clockHead}>
        <span className={styles.eyebrow}>Countdown to {label}</span>
        {nextSeason.dateLabel && (
          <time className={styles.clockDate} dateTime={nextSeason.firstGameAt}>
            {nextSeason.dateLabel}
            {nextSeason.timeConfirmed === false && nextSeason.timeNote ? ` · ${nextSeason.timeNote}` : ''}
          </time>
        )}
      </div>

      {parts.done ? (
        <p className={styles.clockDone} role="status">{label} is here. The new season is under way.</p>
      ) : (
        <div
          className={styles.clockUnits}
          role="timer"
          aria-label={`${describeCountdown(parts)} until ${label}`}
        >
          {units.map((u) => (
            <div key={u.key} className={styles.clockUnit} aria-hidden="true">
              <span className={styles.clockValue}>{u.value}</span>
              <span className={styles.clockUnitLabel}>{u.label}</span>
            </div>
          ))}
        </div>
      )}

      {nextSeason.detail && <p className={styles.clockDetail}>{nextSeason.detail}</p>}
    </div>
  );
}
