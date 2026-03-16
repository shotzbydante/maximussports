import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamColors } from '../../../utils/teamColors';
import styles from './TournamentInsightsSlide.module.css';

const CONVICTION_COLORS = {
  HIGH:   { text: '#5FE8A8', bg: 'rgba(95,232,168,0.12)', border: 'rgba(95,232,168,0.30)', barFill: '#5FE8A8' },
  MEDIUM: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.30)', barFill: '#D4B87A' },
  LOW:    { text: '#8EAFC4', bg: 'rgba(142,175,196,0.12)', border: 'rgba(142,175,196,0.30)', barFill: '#8EAFC4' },
};

const UPSET_RISK_CONFIG = {
  HIGH:     { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)', icon: '🔴' },
  MODERATE: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.28)', icon: '🟡' },
  LOW:      { text: '#5FE8A8', bg: 'rgba(95,232,168,0.10)', border: 'rgba(95,232,168,0.24)', icon: '🟢' },
};

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

function ConvictionBadge({ label }) {
  const c = CONVICTION_COLORS[label] || CONVICTION_COLORS.LOW;
  return (
    <span className={styles.badge} style={{ color: c.text, background: c.bg, borderColor: c.border }}>
      {label}
    </span>
  );
}

function UpsetMeter({ risk }) {
  const cfg = UPSET_RISK_CONFIG[risk] || UPSET_RISK_CONFIG.LOW;
  return (
    <span className={styles.badge} style={{ color: cfg.text, background: cfg.bg, borderColor: cfg.border }}>
      {cfg.icon} {risk}
    </span>
  );
}

function ProbRing({ pct, color, size = 80 }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
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
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
      </svg>
      <span className={styles.probRingPct} style={{ color }}>{pct}%</span>
    </div>
  );
}

function InsightCard({ insight, compact = false }) {
  if (!insight) return null;
  const { matchup, winner, loser, confidenceLabel, isUpset, winProbability } = insight;
  const winnerTeam = winner || matchup?.topTeam;
  const loserTeam = loser || matchup?.bottomTeam;
  const upsetRisk = computeUpsetRisk(insight);
  const pct = Math.round((winProbability ?? 0.5) * 100);
  const losePct = 100 - pct;

  const winnerSlug = winnerTeam?.slug || '';
  const tc = getTeamColors(winnerSlug);
  const accentColor = tc?.primary || '#4A90D9';

  const winnerSeed = winnerTeam === matchup?.topTeam ? matchup?.topSeed : matchup?.bottomSeed;
  const loserSeed = loserTeam === matchup?.topTeam ? matchup?.topSeed : matchup?.bottomSeed;
  const ringSize = compact ? 68 : 80;

  return (
    <div
      className={`${styles.card} ${compact ? styles.cardCompact : ''}`}
      style={{
        '--card-accent': accentColor,
        '--card-accent-20': `${accentColor}33`,
        '--card-accent-10': `${accentColor}1a`,
      }}
    >
      <div className={styles.cardInner}>
        {/* LEFT: Pick Team (dominant) */}
        <div className={styles.pickZone}>
          <div className={styles.pickLabel}>PICK</div>
          <div className={styles.pickLogoWrap}>
            <div className={styles.pickGlow} style={{ background: `radial-gradient(circle, ${accentColor}30 0%, transparent 70%)` }} />
            <TeamLogo team={winnerTeam} size={compact ? 48 : 56} />
          </div>
          <span className={styles.seedTag}>#{winnerSeed}</span>
          <span className={styles.pickName}>{winnerTeam?.shortName || winnerTeam?.name}</span>
        </div>

        {/* CENTER: Probability Ring + VS */}
        <div className={styles.centerZone}>
          <ProbRing pct={pct} color={accentColor} size={ringSize} />
          <div className={styles.vsStrip}>
            <span className={styles.vsLabel}>VS</span>
            {matchup?.region && <span className={styles.regionLabel}>{matchup.region.toUpperCase()}</span>}
          </div>
        </div>

        {/* RIGHT: Opponent (secondary) */}
        <div className={styles.oppZone}>
          <div className={styles.oppLogoWrap}>
            <TeamLogo team={loserTeam} size={compact ? 40 : 46} />
          </div>
          <span className={styles.oppSeedTag}>#{loserSeed}</span>
          <span className={styles.oppName}>{loserTeam?.shortName || loserTeam?.name}</span>
          <span className={styles.oppPct}>{losePct}%</span>
        </div>
      </div>

      {/* Bottom strip: badges */}
      <div className={styles.badgeStrip}>
        <ConvictionBadge label={confidenceLabel} />
        <UpsetMeter risk={upsetRisk} />
      </div>
    </div>
  );
}

export default function TournamentInsightsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const ti = options.tournamentInsights || {};
  const title = ti.title || 'March Madness\nInsights';
  const subtitle = ti.subtitle || 'TOURNAMENT INTELLIGENCE';
  const insights = ti.insights || [];

  const displayInsights = insights.slice(0, 5);
  const isManyCards = displayInsights.length >= 4;

  // Build a social-friendly subtitle hint
  const presetHint = ti.preset
    ? 'Model projections for every matchup in this seed line'
    : null;

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#4A90D9"
      brandMode="standard"
      category="game"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={`${styles.headerBlock} ${isManyCards ? styles.headerCompact : ''}`}>
        <div className={styles.marchBadge}>MARCH MADNESS 2026</div>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.titleSup}>{subtitle}</div>
        {presetHint && <div className={styles.presetHint}>{presetHint}</div>}
      </div>

      {displayInsights.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Select matchups to generate tournament insights.</p>
        </div>
      ) : (
        <div className={styles.cardList}>
          {displayInsights.map((insight, i) => (
            <InsightCard
              key={i}
              insight={insight}
              compact={isManyCards}
            />
          ))}
        </div>
      )}
    </SlideShell>
  );
}
