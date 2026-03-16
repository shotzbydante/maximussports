import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import styles from './UpsetRadarSlide.module.css';

function UpsetCard({ game, rank }) {
  if (!game) return null;
  const { topTeam, bottomTeam, topSeed, bottomSeed, region, upsetProbability, modelResult, rateInfo } = game;

  const underdog = bottomTeam;
  const favorite = topTeam;
  const pct = Math.round((upsetProbability ?? rateInfo?.rate ?? 0) * 100);

  const modelWinner = modelResult?.winner;
  const isModelUpset = modelResult?.isUpset;
  const confLabel = modelResult?.confidenceLabel || 'LOW';
  const topSignal = modelResult?.signals?.[0] || (rateInfo?.description ?? 'Historical upset band');

  return (
    <div className={styles.card}>
      <div className={styles.rankCol}>
        <span className={styles.rankNum}>{rank}</span>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <div className={styles.seedLine}>
            <span className={styles.seedBadge}>#{topSeed}</span>
            <span className={styles.seedVs}>vs</span>
            <span className={styles.seedBadgeHot}>#{bottomSeed}</span>
            <span className={styles.regionLabel}>{region}</span>
          </div>
          <span className={styles.pctBadge}>{pct}%</span>
        </div>

        <div className={styles.teamsRow}>
          <div className={styles.teamSide}>
            <TeamLogo team={favorite} size={26} />
            <span className={styles.teamName}>{favorite?.shortName || favorite?.name}</span>
          </div>
          <span className={styles.vsText}>VS</span>
          <div className={`${styles.teamSide} ${styles.teamRight}`}>
            <span className={`${styles.teamName} ${isModelUpset ? styles.upsetPick : ''}`}>
              {underdog?.shortName || underdog?.name}
            </span>
            <TeamLogo team={underdog} size={26} />
          </div>
        </div>

        <div className={styles.analysisRow}>
          {modelWinner && (
            <span className={styles.pickTag}>
              {isModelUpset ? '🚨 ' : ''}
              {modelWinner.shortName || modelWinner.name}
              <span className={styles.confTag}>{confLabel}</span>
            </span>
          )}
          <span className={styles.signal}>{topSignal}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Upset Radar hero slide — shows top 5 most likely tournament upsets.
 * 1080×1350 IG 4:5 format.
 *
 * Props.options.upsetRadarGames: array from getUpsetRadarGames()
 */
export default function UpsetRadarSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = options.upsetRadarGames || [];
  const displayGames = games.slice(0, 5);

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#E8845F"
      brandMode="standard"
      category="game"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.headerBlock}>
        <div className={styles.marchBadge}>MARCH MADNESS 2026</div>
        <div className={styles.titleSup}>UPSET INTELLIGENCE</div>
        <h2 className={styles.title}>Upset<br />Radar</h2>
        <div className={styles.divider} />
        <p className={styles.subtitle}>
          Top upset candidates ranked by historical + model probability
        </p>
      </div>

      {displayGames.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No upset candidates identified. Check back closer to tip-off.</p>
        </div>
      ) : (
        <div className={styles.cardList}>
          {displayGames.map((g, i) => (
            <UpsetCard key={i} game={g} rank={i + 1} />
          ))}
        </div>
      )}
    </SlideShell>
  );
}
