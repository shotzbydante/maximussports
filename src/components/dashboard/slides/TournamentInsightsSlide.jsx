import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamColors } from '../../../utils/teamColors';
import { getConfidenceTier, getUpsetFraming } from '../../../utils/confidenceTier';
import styles from './TournamentInsightsSlide.module.css';

const MATCHUP_RISK_CONFIG = {
  HIGH:     { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)', icon: '\u25B2' },
  MODERATE: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.28)', icon: '\u2684' },
};

function getEdgeColor(pct) {
  if (pct >= 75) return '#5FE8A8';
  if (pct >= 62) return '#D4B87A';
  return '#6EB3E8';
}

function computeUpsetRisk(insight) {
  const { winProbability, historicalRate } = insight;
  const favProb = winProbability ?? 0.5;
  const histRate = historicalRate ?? 0;
  if (favProb >= 0.85) return 'LOW';
  if (favProb >= 0.72) return histRate >= 0.25 ? 'MODERATE' : 'LOW';
  const modelUpsetProb = 1 - favProb;
  const composite = (modelUpsetProb * 0.6) + (histRate * 0.4);
  if (composite >= 0.35) return 'HIGH';
  if (composite >= 0.22) return 'MODERATE';
  return 'LOW';
}

function socialTitle(rawTitle, preset) {
  if (!preset) return rawTitle;
  const m = preset.match(/^(\d+)-seeds?$/);
  if (m) return `🔒 SEED INTEL: #${m[1]} SEEDS`;
  if (preset === '8v9') return '🔒 SEED INTEL: #8 VS #9';
  return rawTitle;
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

function ProbRing({ pct, color, size = 92 }) {
  const stroke = 6;
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
            style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}
          />
        </svg>
        <span className={styles.probRingPct} style={{ color }}>{pct}%</span>
      </div>
      <span className={styles.probRingLabel}>WIN PROB</span>
    </div>
  );
}

function ProbBar({ pct, winnerName, loserName, edgeColor }) {
  const losePct = 100 - pct;
  return (
    <div className={styles.probBar}>
      <div className={styles.probBarLabels}>
        <span className={styles.probBarWinner}>{winnerName} <strong>{pct}%</strong></span>
        <span className={styles.probBarLoser}>{loserName} <strong>{losePct}%</strong></span>
      </div>
      <div className={styles.probBarTrack}>
        <div
          className={styles.probBarFill}
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${edgeColor}, ${edgeColor}cc)`,
            boxShadow: `0 0 14px ${edgeColor}44`,
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

function InsightCard({ insight, compact = false, ultraCompact = false }) {
  if (!insight) return null;
  const { matchup, winner, loser, winProbability, rationale } = insight;

  const leftTeam = matchup?.topTeam;
  const rightTeam = matchup?.bottomTeam;
  const leftSeed = matchup?.topSeed;
  const rightSeed = matchup?.bottomSeed;

  const winnerTeam = winner || leftTeam;
  const loserTeam = loser || rightTeam;
  const isPickLeft = !!(
    winnerTeam === leftTeam ||
    (winnerTeam?.slug && leftTeam?.slug && winnerTeam.slug === leftTeam.slug) ||
    (winnerTeam?.name && leftTeam?.name && winnerTeam.name === leftTeam.name)
  );

  const upsetRisk = computeUpsetRisk(insight);
  const pct = Math.round((winProbability ?? 0.5) * 100);
  const tier = getConfidenceTier(winProbability);
  const framing = getUpsetFraming({
    isUpset: insight.isUpset ?? false,
    winProbability: winProbability ?? 0.5,
    topSeed: leftSeed,
    bottomSeed: rightSeed,
    heuristics: insight.heuristics,
    scoreBreakdown: insight._scoreBreakdown,
  });

  const winnerSlug = winnerTeam?.slug || '';
  const tc = getTeamColors(winnerSlug);
  const accentColor = tc?.primary || '#4A90D9';
  const edgeColor = getEdgeColor(pct);

  const logoSize = ultraCompact ? 38 : compact ? 56 : 68;
  const ringSize = ultraCompact ? 56 : compact ? 78 : 92;

  const spread = matchup?.spread ?? null;
  const overUnder = matchup?.overUnder ?? matchup?.total ?? null;
  const gameTime = matchup?.gameTime ?? matchup?.time ?? null;
  const network = matchup?.network ?? matchup?.broadcast ?? null;

  const displayRationale = ultraCompact ? '' : (rationale || '');

  const cardClass = ultraCompact
    ? `${styles.card} ${styles.cardUltraCompact}`
    : compact
      ? `${styles.card} ${styles.cardCompact}`
      : styles.card;

  return (
    <div
      className={cardClass}
      style={{
        '--card-accent': accentColor,
        '--card-accent-30': `${accentColor}4d`,
        '--card-accent-15': `${accentColor}26`,
        '--card-accent-08': `${accentColor}14`,
      }}
    >
      <div className={styles.cardInner}>
        {/* LEFT: Higher seed (always) */}
        <div className={isPickLeft ? styles.pickZone : styles.oppZone}>
          <div className={isPickLeft ? styles.pickLogoWrap : styles.oppLogoWrap}>
            {isPickLeft && <div className={styles.pickGlow} style={{ background: `radial-gradient(circle, ${accentColor}40 0%, transparent 70%)` }} />}
            <TeamLogo team={leftTeam} size={logoSize} />
          </div>
          <span className={isPickLeft ? styles.seedTag : styles.oppSeedTag}>#{leftSeed}</span>
          <span className={isPickLeft ? styles.pickName : styles.oppName}>{leftTeam?.shortName || leftTeam?.name}</span>
          {isPickLeft && (
            <span className={styles.maximusPick}>
              {framing.isTrueUpsetPick ? `🚨 ${framing.pickLabel}` : `◆ ${framing.pickLabel}`}
            </span>
          )}
        </div>

        {/* CENTER: Probability Ring + VS */}
        <div className={styles.centerZone}>
          <ProbRing pct={pct} color={edgeColor} size={ringSize} />
          <div className={styles.vsStrip}>
            <span className={styles.vsLabel}>VS</span>
            {matchup?.region && <span className={styles.regionLabel}>{matchup.region.toUpperCase()}</span>}
          </div>
        </div>

        {/* RIGHT: Lower seed (always) */}
        <div className={!isPickLeft ? styles.pickZone : styles.oppZone}>
          <div className={!isPickLeft ? styles.pickLogoWrap : styles.oppLogoWrap}>
            {!isPickLeft && <div className={styles.pickGlow} style={{ background: `radial-gradient(circle, ${accentColor}40 0%, transparent 70%)` }} />}
            <TeamLogo team={rightTeam} size={logoSize} />
          </div>
          <span className={!isPickLeft ? styles.seedTag : styles.oppSeedTag}>#{rightSeed}</span>
          <span className={!isPickLeft ? styles.pickName : styles.oppName}>{rightTeam?.shortName || rightTeam?.name}</span>
          {!isPickLeft && (
            <span className={styles.maximusPick}>
              {framing.isTrueUpsetPick ? `🚨 ${framing.pickLabel}` : `◆ ${framing.pickLabel}`}
            </span>
          )}
        </div>
      </div>

      {/* Colored probability bar */}
      <ProbBar
        pct={pct}
        winnerName={winnerTeam?.shortName || winnerTeam?.name}
        loserName={loserTeam?.shortName || loserTeam?.name}
        edgeColor={edgeColor}
      />

      {/* Rationale — hidden in ultra-compact mode */}
      {displayRationale && (
        <div className={styles.rationale}>
          <p className={styles.rationaleText}>{displayRationale}</p>
        </div>
      )}

      {/* Game info + badges */}
      <div className={styles.bottomRow}>
        <div className={styles.metaStrip}>
          <span className={styles.metaItem}>
            Rd 1{matchup?.region ? ` · ${matchup.region}` : ''}
          </span>
          {!ultraCompact && (
            <>
              <span className={styles.metaDot}>·</span>
              <span className={styles.metaItem}>
                {gameTime && network ? `${gameTime} · ${network}` : 'Schedule TBA'}
              </span>
            </>
          )}
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaItem}>
            {spread != null ? `${spread}` : 'Line TBA'}
            {overUnder != null ? ` · O/U ${overUnder}` : ''}
          </span>
        </div>
        <div className={styles.badgeStrip}>
          <TierChip tier={tier} />
          <MatchupRiskChip risk={upsetRisk} framing={framing} />
        </div>
      </div>
    </div>
  );
}

export default function TournamentInsightsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const ti = options.tournamentInsights || {};
  const rawTitle = ti.title || 'March Madness\nInsights';
  const subtitle = ti.subtitle || 'TOURNAMENT INTELLIGENCE';
  const insights = ti.insights || [];

  // Support up to 8 cards for full region views
  const displayInsights = insights.slice(0, 8);
  const isUltraCompact = displayInsights.length >= 6;
  const isManyCards = displayInsights.length >= 4;
  const title = socialTitle(rawTitle, ti.preset);

  const headerClass = [
    styles.headerBlock,
    isUltraCompact ? styles.headerUltraCompact : isManyCards ? styles.headerCompact : '',
  ].filter(Boolean).join(' ');

  const listClass = [
    styles.cardList,
    isUltraCompact ? styles.cardListUltraCompact : isManyCards ? styles.cardListCompact : '',
  ].filter(Boolean).join(' ');

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#4A90D9"
      brandMode="light"
      category="game"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={headerClass}>
        <div className={styles.headerTop}>
          <div className={styles.headerText}>
            <div className={styles.marchBadge}>MARCH MADNESS 2026</div>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.titleSup}>{subtitle}</div>
          </div>
          <img
            src="/mascot.png"
            alt=""
            className={styles.heroMascot}
            crossOrigin="anonymous"
          />
        </div>
      </div>

      {displayInsights.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Select matchups to generate tournament insights.</p>
        </div>
      ) : (
        <div className={listClass}>
          {displayInsights.map((insight, i) => (
            <InsightCard
              key={i}
              insight={insight}
              compact={isManyCards}
              ultraCompact={isUltraCompact}
            />
          ))}
        </div>
      )}
    </SlideShell>
  );
}
