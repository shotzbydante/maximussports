import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamColors } from '../../../utils/teamColors';
import styles from './TournamentInsightsSlide.module.css';

const CONVICTION_COLORS = {
  HIGH:   { text: '#5FE8A8', bg: 'rgba(95,232,168,0.12)', border: 'rgba(95,232,168,0.30)' },
  MEDIUM: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.30)' },
  LOW:    { text: '#8EAFC4', bg: 'rgba(142,175,196,0.12)', border: 'rgba(142,175,196,0.30)' },
};

const UPSET_RISK_CONFIG = {
  HIGH:     { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)', icon: '🔴' },
  MODERATE: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.28)', icon: '🟡' },
  LOW:      { text: '#5FE8A8', bg: 'rgba(95,232,168,0.10)', border: 'rgba(95,232,168,0.24)', icon: '🟢' },
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

function InsightCard({ insight, compact = false }) {
  if (!insight) return null;
  const { matchup, winner, loser, confidenceLabel, winProbability, rationale } = insight;

  // Seed ordering: higher seed (lower number) ALWAYS on left
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

  const winnerSlug = winnerTeam?.slug || '';
  const tc = getTeamColors(winnerSlug);
  const accentColor = tc?.primary || '#4A90D9';
  const edgeColor = getEdgeColor(pct);

  const logoSize = compact ? 56 : 68;
  const ringSize = compact ? 78 : 92;

  const spread = matchup?.spread ?? null;
  const overUnder = matchup?.overUnder ?? matchup?.total ?? null;
  const gameTime = matchup?.gameTime ?? matchup?.time ?? null;
  const network = matchup?.network ?? matchup?.broadcast ?? null;

  const displayRationale = rationale || '';

  return (
    <div
      className={`${styles.card} ${compact ? styles.cardCompact : ''}`}
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
          {isPickLeft && <span className={styles.maximusPick}>Maximus&#39;s Pick</span>}
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
          {!isPickLeft && <span className={styles.maximusPick}>Maximus&#39;s Pick</span>}
        </div>
      </div>

      {/* Colored probability bar — winner always labeled first */}
      <ProbBar
        pct={pct}
        winnerName={winnerTeam?.shortName || winnerTeam?.name}
        loserName={loserTeam?.shortName || loserTeam?.name}
        edgeColor={edgeColor}
      />

      {/* Expanded model rationale */}
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
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaItem}>
            {gameTime && network ? `${gameTime} · ${network}` : 'Schedule TBA'}
          </span>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaItem}>
            {spread != null ? `${spread}` : 'Line TBA'}
            {overUnder != null ? ` · O/U ${overUnder}` : ''}
          </span>
        </div>
        <div className={styles.badgeStrip}>
          <ConvictionBadge label={confidenceLabel} />
          <UpsetMeter risk={upsetRisk} />
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

  const displayInsights = insights.slice(0, 5);
  const isManyCards = displayInsights.length >= 4;
  const title = socialTitle(rawTitle, ti.preset);

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
      <div className={`${styles.headerBlock} ${isManyCards ? styles.headerCompact : ''}`}>
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
        <div className={`${styles.cardList} ${isManyCards ? styles.cardListCompact : ''}`}>
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
