import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import styles from './UpsetRadarSlide.module.css';

const RISK_CONFIG = {
  HIGH:     { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)' },
  MODERATE: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.28)' },
  LOW:      { text: '#5FE8A8', bg: 'rgba(95,232,168,0.10)', border: 'rgba(95,232,168,0.24)' },
};

const CONVICTION_COLORS = {
  HIGH:   { text: '#5FE8A8', bg: 'rgba(95,232,168,0.12)', border: 'rgba(95,232,168,0.30)' },
  MEDIUM: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.30)' },
  LOW:    { text: '#8EAFC4', bg: 'rgba(142,175,196,0.12)', border: 'rgba(142,175,196,0.30)' },
};

function computeUpsetRisk(game) {
  const seedDiff = Math.abs((game.topSeed ?? 0) - (game.bottomSeed ?? 0));
  const upsetProb = game.upsetProbability ?? game.rateInfo?.rate ?? 0;

  if (upsetProb >= 0.35) return 'HIGH';
  if (upsetProb >= 0.20 || seedDiff <= 4) return 'MODERATE';
  return 'LOW';
}

function ProbabilityBar({ upsetProb, favoriteName, underdogName }) {
  const pct = Math.round((upsetProb ?? 0) * 100);
  const favPct = 100 - pct;

  return (
    <div className={styles.probBarWrap}>
      <div className={styles.probBarLabels}>
        <span className={styles.probBarFav}>{favoriteName} <strong>{favPct}%</strong></span>
        <span className={styles.probBarDog}>{underdogName} <strong>{pct}%</strong></span>
      </div>
      <div className={styles.probBarTrack}>
        <div className={styles.probBarFillFav} style={{ width: `${favPct}%` }} />
        <div className={styles.probBarFillDog} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function UpsetCard({ game, rank }) {
  if (!game) return null;
  const { topTeam, bottomTeam, topSeed, bottomSeed, region, upsetProbability, modelResult, rateInfo } = game;

  const underdog = bottomTeam;
  const favorite = topTeam;
  const pct = Math.round((upsetProbability ?? rateInfo?.rate ?? 0) * 100);
  const upsetRisk = computeUpsetRisk(game);
  const riskCfg = RISK_CONFIG[upsetRisk];

  const modelWinner = modelResult?.winner;
  const isModelUpset = modelResult?.isUpset;
  const confLabel = modelResult?.confidenceLabel || 'LOW';
  const convCfg = CONVICTION_COLORS[confLabel];
  const signals = modelResult?.signals || [];
  const topSignal = signals[0] || rateInfo?.description || 'Historical upset band';
  const secondSignal = signals[1] || null;

  return (
    <div className={`${styles.card} ${rank === 1 ? styles.cardTop : ''}`}>
      <div className={styles.rankBadge}>{rank}</div>

      {/* Matchup row */}
      <div className={styles.matchupRow}>
        <div className={styles.teamSide}>
          <span className={styles.seedBadge}>#{topSeed}</span>
          <TeamLogo team={favorite} size={28} />
          <span className={styles.teamName}>{favorite?.shortName || favorite?.name}</span>
        </div>
        <span className={styles.vsText}>VS</span>
        <div className={`${styles.teamSide} ${styles.teamRight}`}>
          <span className={`${styles.teamName} ${isModelUpset ? styles.upsetHighlight : ''}`}>
            {underdog?.shortName || underdog?.name}
          </span>
          <TeamLogo team={underdog} size={28} />
          <span className={styles.seedBadgeHot}>#{bottomSeed}</span>
        </div>
      </div>

      {/* Game context */}
      <div className={styles.contextRow}>
        <span className={styles.contextItem}>{region} Region</span>
        <span className={styles.contextDot}>·</span>
        <span className={styles.upsetRiskTag} style={{ color: riskCfg.text, background: riskCfg.bg, borderColor: riskCfg.border }}>
          {upsetRisk} UPSET RISK
        </span>
        <span className={styles.upsetPctBadge}>{pct}%</span>
      </div>

      {/* Probability bar */}
      <ProbabilityBar
        upsetProb={upsetProbability ?? rateInfo?.rate ?? 0}
        favoriteName={favorite?.shortName || favorite?.name}
        underdogName={underdog?.shortName || underdog?.name}
      />

      {/* Model prediction */}
      <div className={styles.predictionRow}>
        {modelWinner && (
          <div className={styles.pickBlock}>
            <span className={styles.pickLabel}>PICK</span>
            <span className={`${styles.pickName} ${isModelUpset ? styles.upsetHighlight : ''}`}>
              {isModelUpset ? '🚨 ' : ''}
              {modelWinner.shortName || modelWinner.name}
            </span>
          </div>
        )}
        <span className={styles.convictionTag} style={{ color: convCfg.text, background: convCfg.bg, borderColor: convCfg.border }}>
          {confLabel}
        </span>
      </div>

      {/* Explanation bullets */}
      <div className={styles.bulletList}>
        <div className={styles.bullet}>
          <span className={styles.bulletDot} />
          <span className={styles.bulletText}>{topSignal}</span>
        </div>
        {secondSignal && (
          <div className={styles.bullet}>
            <span className={styles.bulletDot} />
            <span className={styles.bulletText}>{secondSignal}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Upset Radar hero slide — top 5 most likely tournament upsets.
 * Premium redesign with probability bars, upset meters, conviction badges.
 * 1080x1350 IG 4:5 format.
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
