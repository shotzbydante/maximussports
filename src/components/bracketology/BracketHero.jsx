import { TOURNAMENT_YEAR } from '../../config/bracketology';
import styles from './BracketHero.module.css';

export default function BracketHero({
  bracketMode,
  totalPicks,
  totalGames,
  progress,
  manualCount,
  maximusCount,
  champion,
  championPrediction,
  hasBracket,
  onPopulateField,
  onAutoFill,
}) {
  const isProjected = bracketMode === 'projected';

  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} />
      <div className={styles.heroContent}>
        <div className={styles.heroTopRow}>
          <span className={styles.yearBadge}>{TOURNAMENT_YEAR}</span>
          <span className={`${styles.modeBadge} ${isProjected ? styles.projectedBadge : styles.officialBadge}`}>
            {isProjected ? 'PROJECTED FIELD' : 'OFFICIAL BRACKET'}
          </span>
        </div>

        <h1 className={styles.heroTitle}>Bracketology</h1>
        <p className={styles.heroSubtitle}>
          {isProjected
            ? 'Build your bracket. Beat the field.'
            : 'The official bracket is live. Lock in your picks.'}
        </p>
        <p className={styles.heroDescription}>
          {isProjected
            ? 'Projected field based on current-season data. Official bracket auto-populates on Selection Sunday.'
            : 'Model-driven tournament intelligence — 64 teams, 63 games, powered by Maximus.'
          }
        </p>

        <div className={styles.metaStrip}>
          <MetaItem value="64" label="Teams" />
          <div className={styles.metaDivider} />
          <MetaItem value={`${totalPicks}/${totalGames}`} label="Picks Made" />
          <div className={styles.metaDivider} />
          <MetaItem value={String(manualCount)} label="Manual" />
          <div className={styles.metaDivider} />
          <MetaItem
            value={<><span className={styles.modelIcon}>◆</span> {maximusCount}</>}
            label="Maximus"
          />
          <div className={styles.metaDivider} />
          <MetaItem value={`${progress}%`} label="Complete" />
        </div>

        {totalPicks > 0 && (
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {champion && (
          <div className={styles.championCard}>
            <div className={styles.championGlow} />
            {champion.logo && (
              <img
                src={champion.logo}
                alt=""
                className={styles.championLogo}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div className={styles.championInfo}>
              <span className={styles.championLabel}>Your Champion</span>
              <span className={styles.championName}>{champion.shortName || champion.name}</span>
              {champion.seed && (
                <span className={styles.championSeed}>{champion.seed}-seed · {champion.conference}</span>
              )}
            </div>
            {championPrediction?.winProbability != null && (
              <div className={styles.championConfidence}>
                <span className={styles.championConfValue}>
                  {Math.round(championPrediction.winProbability * 100)}%
                </span>
                <span className={styles.championConfLabel}>Win Prob</span>
              </div>
            )}
          </div>
        )}

        {hasBracket && totalPicks === 0 && (
          <div className={styles.firstUseCta}>
            <p className={styles.firstUseText}>
              Your bracket is ready. Choose how to start:
            </p>
            <div className={styles.firstUseActions}>
              {onAutoFill && (
                <button type="button" className={styles.firstUsePrimary} onClick={onAutoFill}>
                  <span className={styles.firstUseIcon}>◆</span>
                  Auto-Fill Maximus
                </button>
              )}
              <button type="button" className={styles.firstUseSecondary} onClick={() => {}}>
                Build Manually
              </button>
            </div>
          </div>
        )}

        {!hasBracket && onPopulateField && (
          <div className={styles.firstUseCta}>
            <p className={styles.firstUseText}>
              Load the projected 64-team field to start building your bracket.
            </p>
            <button type="button" className={styles.firstUsePrimary} onClick={onPopulateField}>
              Populate Projected Field
            </button>
          </div>
        )}

        {isProjected && (
          <p className={styles.projectedNote}>
            Projections based on current-season data — not final. Official bracket auto-populates on Selection Sunday.
          </p>
        )}
      </div>
    </div>
  );
}

function MetaItem({ value, label }) {
  return (
    <div className={styles.metaItem}>
      <span className={styles.metaValue}>{value}</span>
      <span className={styles.metaLabel}>{label}</span>
    </div>
  );
}
