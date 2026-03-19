import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamColors } from '../../../utils/teamColors';
import { getConfidenceTier, getUpsetFraming } from '../../../utils/confidenceTier';
import styles from './UpsetRadarSlide.module.css';

const MATCHUP_RISK_CONFIG = {
  HIGH:     { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)', icon: '\u25B2' },
  MODERATE: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.28)', icon: '\u2684' },
};

function getEdgeColor(pct) {
  if (pct >= 75) return '#5FE8A8';
  if (pct >= 62) return '#D4B87A';
  return '#6EB3E8';
}

function getUpsetChanceColor(underdogPct) {
  if (underdogPct >= 45) return '#E8845F';
  if (underdogPct >= 35) return '#D4B87A';
  return '#6EB3E8';
}

function computeUpsetRisk(game) {
  const upsetProb = game.upsetProbability ?? game.rateInfo?.rate ?? 0;
  if (upsetProb >= 0.35) return 'HIGH';
  if (upsetProb >= 0.20) return 'MODERATE';
  return 'LOW';
}

function MatchupRiskChip({ risk, framing }) {
  const cfg = MATCHUP_RISK_CONFIG[risk];
  if (!cfg) return null;
  const label = framing?.matchupLabel || (risk === 'HIGH' ? 'DANGER ZONE' : 'VOLATILE');
  return (
    <span className={styles.badge} style={{ color: cfg.text, background: cfg.bg, borderColor: cfg.border }}>
      {cfg.icon} {label}
    </span>
  );
}

function ProbRing({ pct, color, size = 68, label = 'UPSET CHANCE' }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className={styles.probRingWrap}>
      <div className={styles.probRing} style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
          />
        </svg>
        <span className={styles.probRingPct} style={{ color }}>{pct}%</span>
      </div>
      <span className={styles.probRingLabel}>{label}</span>
    </div>
  );
}

function ProbBar({ favoriteName, underdogName, underdogPct, edgeColor }) {
  const favPct = 100 - underdogPct;
  return (
    <div className={styles.probBar}>
      <div className={styles.probBarLabels}>
        <span className={styles.probBarFavorite}>{favoriteName} <strong>{favPct}%</strong></span>
        <span className={styles.probBarUnderdog}>{underdogName} <strong>{underdogPct}%</strong></span>
      </div>
      <div className={styles.probBarTrack}>
        <div className={styles.probBarSpacer} style={{ flex: favPct }} />
        <div
          className={styles.probBarFill}
          style={{
            flex: underdogPct,
            minWidth: underdogPct > 0 ? `${underdogPct}%` : 0,
            background: `linear-gradient(90deg, ${edgeColor}99, ${edgeColor})`,
            boxShadow: `0 0 12px ${edgeColor}44`,
          }}
        />
      </div>
    </div>
  );
}

function TierChip({ tier }) {
  if (!tier) return null;
  const c = tier.igColor;
  return (
    <span
      className={styles.badge}
      style={{ color: c.text, background: c.bg, borderColor: c.border, gap: '3px', display: 'inline-flex', alignItems: 'center' }}
    >
      <span style={{ fontSize: '0.85em', lineHeight: 1 }}>{tier.icon}</span>
      {tier.label}
    </span>
  );
}

function UpsetCard({ game, rank }) {
  if (!game) return null;
  const { topTeam, bottomTeam, topSeed, bottomSeed, region, modelResult } = game;
  const upsetRisk = computeUpsetRisk(game);

  const pickTeam = modelResult?.winner || topTeam;
  const oppTeam = modelResult?.loser || bottomTeam;
  const isUpsetPick = modelResult?.isUpset ?? false;
  const winProb = modelResult?.winProbability ?? 0.5;
  const pct = Math.round(winProb * 100);
  const underdogPct = isUpsetPick ? pct : (100 - pct);
  const tier = getConfidenceTier(winProb);
  const framing = getUpsetFraming({
    isUpset: isUpsetPick,
    winProbability: winProb,
    topSeed,
    bottomSeed,
    heuristics: modelResult?.heuristics,
    scoreBreakdown: game._scoreBreakdown,
  });
  const rationaleText = modelResult?.rationale || '';

  // Seed ordering: higher seed (lower number) ALWAYS on left
  const leftTeam = topTeam;
  const rightTeam = bottomTeam;
  const leftSeed = topSeed;
  const rightSeed = bottomSeed;
  const isPickLeft = !!(
    pickTeam === leftTeam ||
    (pickTeam?.slug && leftTeam?.slug && pickTeam.slug === leftTeam.slug) ||
    (pickTeam?.name && leftTeam?.name && pickTeam.name === leftTeam.name)
  );

  const pickSlug = pickTeam?.slug || '';
  const tc = getTeamColors(pickSlug);
  const accentColor = tc?.primary || '#E8845F';

  return (
    <div
      className={styles.card}
      style={{
        '--card-accent': accentColor,
        '--card-accent-30': `${accentColor}4d`,
        '--card-accent-15': `${accentColor}26`,
        '--card-accent-08': `${accentColor}14`,
      }}
    >
      <div className={styles.rankTag}>{rank}</div>

      <div className={styles.cardInner}>
        {/* LEFT: Higher seed (always) */}
        <div className={isPickLeft ? styles.pickZone : styles.oppZone}>
          <div className={isPickLeft ? styles.pickLogoWrap : styles.oppLogoWrap}>
            {isPickLeft && <div className={styles.pickGlow} style={{ background: `radial-gradient(circle, ${accentColor}35 0%, transparent 70%)` }} />}
            <TeamLogo team={leftTeam} size={52} />
          </div>
          <span className={isPickLeft ? styles.seedTag : styles.oppSeedTag}>#{leftSeed}</span>
          <span className={isPickLeft ? styles.pickName : styles.oppName}>{leftTeam?.shortName || leftTeam?.name}</span>
          {isPickLeft && (
            <span className={styles.pickBadge}>
              {framing.isTrueUpsetPick ? `🚨 ${framing.pickLabel}` : `◆ ${framing.pickLabel}`}
            </span>
          )}
        </div>

        {/* CENTER: Underdog upset chance (hero metric) */}
        <div className={styles.centerZone}>
          <ProbRing pct={underdogPct} color={getUpsetChanceColor(underdogPct)} size={66} label="UPSET CHANCE" />
          <div className={styles.vsStrip}>
            <span className={styles.vsLabel}>VS</span>
            {region && <span className={styles.regionLabel}>{region.toUpperCase()}</span>}
          </div>
        </div>

        {/* RIGHT: Lower seed (always) */}
        <div className={!isPickLeft ? styles.pickZone : styles.oppZone}>
          <div className={!isPickLeft ? styles.pickLogoWrap : styles.oppLogoWrap}>
            {!isPickLeft && <div className={styles.pickGlow} style={{ background: `radial-gradient(circle, ${accentColor}35 0%, transparent 70%)` }} />}
            <TeamLogo team={rightTeam} size={52} />
          </div>
          <span className={!isPickLeft ? styles.seedTag : styles.oppSeedTag}>#{rightSeed}</span>
          <span className={!isPickLeft ? styles.pickName : styles.oppName}>{rightTeam?.shortName || rightTeam?.name}</span>
          {!isPickLeft && (
            <span className={styles.pickBadge}>
              {framing.isTrueUpsetPick ? `🚨 ${framing.pickLabel}` : `◆ ${framing.pickLabel}`}
            </span>
          )}
        </div>
      </div>

      {/* Bar oriented around underdog (right side) — fill flows from underdog */}
      <ProbBar
        favoriteName={leftTeam?.shortName || leftTeam?.name}
        underdogName={rightTeam?.shortName || rightTeam?.name}
        underdogPct={underdogPct}
        edgeColor={getUpsetChanceColor(underdogPct)}
      />

      {/* Expanded rationale + Badges */}
      <div className={styles.bottomRow}>
        <div className={styles.rationaleStrip}>
          {rationaleText && <span className={styles.rationaleText}>{rationaleText}</span>}
        </div>
        <div className={styles.badgeStrip}>
          <TierChip tier={tier} />
          <MatchupRiskChip risk={upsetRisk} framing={framing} />
        </div>
      </div>
    </div>
  );
}

export default function UpsetRadarSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = options.upsetRadarGames || [];
  const displayGames = games.slice(0, 5);
  const dayLabel = options.dayLabel || '';
  const roundLabel = options.roundLabel || '';

  const titleText = dayLabel
    ? `UPSET RADAR`
    : 'UPSET RADAR';
  const subtitleText = dayLabel
    ? `${dayLabel.toUpperCase()} · ${roundLabel.toUpperCase()}`
    : 'UPSET INTELLIGENCE';

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#E8845F"
      brandMode="light"
      category="game"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.headerBlock}>
        <div className={styles.headerTop}>
          <div className={styles.headerText}>
            <div className={styles.marchBadge}>MARCH MADNESS 2026</div>
            <h2 className={styles.title}>{titleText}</h2>
            <div className={styles.titleSup}>{subtitleText}</div>
          </div>
          <img
            src="/mascot.png"
            alt=""
            className={styles.heroMascot}
            crossOrigin="anonymous"
          />
        </div>
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
