import styles from './MatchupPreview.module.css';

export default function MatchupPreview({ matchup }) {
  const { home, away, spread, overUnder, tipTime, channel, upsetAlert } = matchup;

  return (
    <article className={`${styles.card} ${upsetAlert ? styles.upsetAlert : ''}`}>
      {upsetAlert && (
        <div className={styles.upsetBadge}>⚠️ Upset Watch</div>
      )}
      <div className={styles.teams}>
        <div className={styles.team}>
          <span className={styles.seed}>{home.seed}</span>
          <span className={styles.name}>{home.name}</span>
          <span className={styles.record}>{home.record}</span>
        </div>
        <div className={styles.vs}>vs</div>
        <div className={styles.team}>
          <span className={styles.seed}>{away.seed}</span>
          <span className={styles.name}>{away.name}</span>
          <span className={styles.record}>{away.record}</span>
        </div>
      </div>
      <div className={styles.lines}>
        <div className={styles.line}>
          <span className={styles.label}>Spread</span>
          <span className={styles.value}>{home.name} {spread}</span>
        </div>
        <div className={styles.line}>
          <span className={styles.label}>O/U</span>
          <span className={styles.value}>{overUnder}</span>
        </div>
      </div>
      <div className={styles.meta}>
        <span>{tipTime}</span>
        <span className={styles.sep}>•</span>
        <span>{channel}</span>
      </div>
    </article>
  );
}
