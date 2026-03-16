import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamColors } from '../../../utils/teamColors';
import styles from './UpsetRadarSlide.module.css';

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

function computeUpsetRisk(game) {
  const upsetProb = game.upsetProbability ?? game.rateInfo?.rate ?? 0;
  if (upsetProb >= 0.35) return 'HIGH';
  if (upsetProb >= 0.20) return 'MODERATE';
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

function UpsetRiskBadge({ risk }) {
  const cfg = UPSET_RISK_CONFIG[risk] || UPSET_RISK_CONFIG.LOW;
  return (
    <span className={styles.badge} style={{ color: cfg.text, background: cfg.bg, borderColor: cfg.border }}>
      {cfg.icon} {risk}
    </span>
  );
}

function ProbRing({ pct, color, size = 68 }) {
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
      <span className={styles.probRingLabel}>WIN PROB</span>
    </div>
  );
}

function ProbBar({ pct, winnerName, loserName, accentColor }) {
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
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)`,
            boxShadow: `0 0 12px ${accentColor}44`,
          }}
        />
      </div>
    </div>
  );
}

function UpsetCard({ game, rank }) {
  if (!game) return null;
  const { topTeam, bottomTeam, topSeed, bottomSeed, region, modelResult } = game;
  const upsetRisk = computeUpsetRisk(game);

  const pickTeam = modelResult?.winner || topTeam;
  const oppTeam = modelResult?.loser || bottomTeam;
  const isUpsetPick = modelResult?.isUpset ?? false;
  const confLabel = modelResult?.confidenceLabel || 'LOW';
  const winProb = modelResult?.winProbability ?? 0.5;
  const pct = Math.round(winProb * 100);
  const signals = modelResult?.signals || [];
  const topSignal = signals[0] || null;

  const pickSeed = pickTeam === topTeam ? topSeed : bottomSeed;
  const oppSeed = oppTeam === topTeam ? topSeed : bottomSeed;

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
        {/* LEFT: Pick Team */}
        <div className={styles.pickZone}>
          <div className={styles.pickLogoWrap}>
            <div className={styles.pickGlow} style={{ background: `radial-gradient(circle, ${accentColor}35 0%, transparent 70%)` }} />
            <TeamLogo team={pickTeam} size={48} />
          </div>
          <span className={styles.seedTag}>#{pickSeed}</span>
          <span className={styles.pickName}>{pickTeam?.shortName || pickTeam?.name}</span>
          <span className={styles.pickBadge}>
            {isUpsetPick ? '🚨 Upset Pick' : "Maximus\u2019s Pick"}
          </span>
        </div>

        {/* CENTER: Probability Ring + VS */}
        <div className={styles.centerZone}>
          <ProbRing pct={pct} color={accentColor} size={68} />
          <div className={styles.vsStrip}>
            <span className={styles.vsLabel}>VS</span>
            {region && <span className={styles.regionLabel}>{region.toUpperCase()}</span>}
          </div>
        </div>

        {/* RIGHT: Opponent */}
        <div className={styles.oppZone}>
          <div className={styles.oppLogoWrap}>
            <TeamLogo team={oppTeam} size={48} />
          </div>
          <span className={styles.oppSeedTag}>#{oppSeed}</span>
          <span className={styles.oppName}>{oppTeam?.shortName || oppTeam?.name}</span>
        </div>
      </div>

      {/* Colored probability bar */}
      <ProbBar
        pct={pct}
        winnerName={pickTeam?.shortName || pickTeam?.name}
        loserName={oppTeam?.shortName || oppTeam?.name}
        accentColor={accentColor}
      />

      {/* Rationale + Badges */}
      <div className={styles.bottomRow}>
        <div className={styles.rationaleStrip}>
          {topSignal && <span className={styles.rationaleText}>• {topSignal}</span>}
        </div>
        <div className={styles.badgeStrip}>
          <ConvictionBadge label={confLabel} />
          <UpsetRiskBadge risk={upsetRisk} />
        </div>
      </div>
    </div>
  );
}

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
        <h2 className={styles.title}>🚨 UPSET RADAR</h2>
        <div className={styles.titleSup}>UPSET INTELLIGENCE</div>
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
