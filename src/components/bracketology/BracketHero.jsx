import { TOURNAMENT_YEAR, TOURNAMENT_NAME } from '../../config/bracketology';
import styles from './BracketHero.module.css';

export default function BracketHero({ isPreSelection, totalPicks, totalGames, progress }) {
  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} />
      <div className={styles.heroContent}>
        <div className={styles.heroTopRow}>
          <span className={styles.yearBadge}>{TOURNAMENT_YEAR}</span>
          <span className={styles.statusBadge}>
            {isPreSelection ? 'PRE-SELECTION SUNDAY' : 'TOURNAMENT ACTIVE'}
          </span>
        </div>
        <h1 className={styles.heroTitle}>Bracketology</h1>
        <p className={styles.heroSubtitle}>Build your bracket. Beat the field.</p>
        <p className={styles.heroDescription}>
          Model-driven tournament intelligence — 68 teams, 63 picks, powered by Maximus.
        </p>
        <div className={styles.metaStrip}>
          <div className={styles.metaItem}>
            <span className={styles.metaValue}>68</span>
            <span className={styles.metaLabel}>Teams</span>
          </div>
          <div className={styles.metaDivider} />
          <div className={styles.metaItem}>
            <span className={styles.metaValue}>63</span>
            <span className={styles.metaLabel}>Games</span>
          </div>
          <div className={styles.metaDivider} />
          <div className={styles.metaItem}>
            <span className={styles.metaValue}>{totalPicks}/{totalGames}</span>
            <span className={styles.metaLabel}>Picks Made</span>
          </div>
          <div className={styles.metaDivider} />
          <div className={styles.metaItem}>
            <span className={styles.metaValue}>
              <span className={styles.modelIcon}>◆</span> AI
            </span>
            <span className={styles.metaLabel}>Model Assisted</span>
          </div>
        </div>
        {totalPicks > 0 && (
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className={styles.progressLabel}>{progress}% complete</span>
          </div>
        )}
      </div>
    </div>
  );
}
