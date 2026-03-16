import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
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
  const { matchup, winProbability, historicalRate } = insight;
  const favProb = winProbability ?? 0.5;
  const histRate = historicalRate ?? 0;

  // If the favorite has very high probability, upset risk must be LOW
  // regardless of historical rate — the model output is the truth signal.
  if (favProb >= 0.85) return 'LOW';
  if (favProb >= 0.72) return histRate >= 0.25 ? 'MODERATE' : 'LOW';

  // For closer matchups, blend model and historical signals
  const modelUpsetProb = 1 - favProb;
  const composite = (modelUpsetProb * 0.6) + (histRate * 0.4);

  if (composite >= 0.35) return 'HIGH';
  if (composite >= 0.22) return 'MODERATE';
  return 'LOW';
}

function ConvictionBadge({ label }) {
  const c = CONVICTION_COLORS[label] || CONVICTION_COLORS.LOW;
  return (
    <span className={styles.convictionBadge} style={{ color: c.text, background: c.bg, borderColor: c.border }}>
      {label} CONVICTION
    </span>
  );
}

function UpsetMeter({ risk }) {
  const cfg = UPSET_RISK_CONFIG[risk] || UPSET_RISK_CONFIG.LOW;
  return (
    <span className={styles.upsetMeter} style={{ color: cfg.text, background: cfg.bg, borderColor: cfg.border }}>
      {cfg.icon} {risk} RISK
    </span>
  );
}

function ProbabilityBar({ winProbability, winnerName, loserName, confidenceLabel }) {
  const pct = Math.round((winProbability ?? 0.5) * 100);
  const losePct = 100 - pct;
  const c = CONVICTION_COLORS[confidenceLabel] || CONVICTION_COLORS.LOW;

  return (
    <div className={styles.probBarWrap}>
      <div className={styles.probBarLabels}>
        <span className={styles.probBarTeam}>{winnerName} <strong>{pct}%</strong></span>
        <span className={styles.probBarTeamSecondary}>{loserName} <strong>{losePct}%</strong></span>
      </div>
      <div className={styles.probBarTrack}>
        <div
          className={styles.probBarFill}
          style={{ width: `${pct}%`, background: c.barFill }}
        />
      </div>
    </div>
  );
}

function InsightCard({ insight, featured = false, compact = false }) {
  if (!insight) return null;
  const { matchup, winner, loser, confidenceLabel, signals, isUpset, winProbability, historicalContext } = insight;
  const winnerTeam = winner || matchup?.topTeam;
  const loserTeam = loser || matchup?.bottomTeam;
  const upsetRisk = computeUpsetRisk(insight);
  const logoSize = compact ? 26 : (featured ? 38 : 30);

  const bullets = compact
    ? (signals || []).slice(0, 1)
    : [
        ...(signals || []).slice(0, 3),
        ...(historicalContext && (signals || []).length < 3 ? [historicalContext] : []),
      ].slice(0, 3);

  return (
    <div className={`${styles.card} ${featured ? styles.cardFeatured : ''} ${compact ? styles.cardCompact : ''}`}>
      {/* Row 1: Matchup */}
      <div className={styles.matchupRow}>
        <div className={styles.teamSide}>
          <span className={styles.seedBadge}>#{matchup?.topSeed}</span>
          <TeamLogo team={matchup?.topTeam} size={logoSize} />
          <span className={styles.teamName}>{matchup?.topTeam?.shortName || matchup?.topTeam?.name}</span>
        </div>
        <div className={styles.vsBlock}>
          <span className={styles.vsText}>VS</span>
          {matchup?.region && <span className={styles.regionTag}>{matchup.region}</span>}
        </div>
        <div className={`${styles.teamSide} ${styles.teamSideRight}`}>
          <span className={styles.teamName}>{matchup?.bottomTeam?.shortName || matchup?.bottomTeam?.name}</span>
          <TeamLogo team={matchup?.bottomTeam} size={logoSize} />
          <span className={styles.seedBadge}>#{matchup?.bottomSeed}</span>
        </div>
      </div>

      {/* Prediction + Badges — merged row in compact mode */}
      <div className={styles.predictionBlock}>
        <div className={styles.predictionHeader}>
          <div className={styles.winnerInline}>
            <span className={styles.pickLabel}>PICK</span>
            <span className={styles.winnerName}>{winnerTeam?.shortName || winnerTeam?.name}</span>
            {winProbability != null && (
              <span className={styles.winProbPct}>{Math.round(winProbability * 100)}%</span>
            )}
          </div>
          <div className={styles.badgeRow}>
            <ConvictionBadge label={confidenceLabel} />
            <UpsetMeter risk={upsetRisk} />
          </div>
        </div>
      </div>

      {/* Probability Bar */}
      {winProbability != null && (
        <ProbabilityBar
          winProbability={winProbability}
          winnerName={winnerTeam?.shortName || winnerTeam?.name}
          loserName={loserTeam?.shortName || loserTeam?.name}
          confidenceLabel={confidenceLabel}
        />
      )}

      {/* Explanation Bullets */}
      {bullets.length > 0 && !compact && (
        <div className={styles.bulletList}>
          {bullets.map((b, i) => (
            <div key={i} className={styles.bullet}>
              <span className={styles.bulletDot} />
              <span className={styles.bulletText}>{b}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Tournament Insights hero slide — shows 3–5 matchup insight cards
 * with redesigned information hierarchy.
 * 1080x1350 IG 4:5 format.
 */
export default function TournamentInsightsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const ti = options.tournamentInsights || {};
  const title = ti.title || 'March Madness\nInsights';
  const subtitle = ti.subtitle || 'TOURNAMENT INTELLIGENCE';
  const insights = ti.insights || [];

  const displayInsights = insights.slice(0, 5);
  const isManyCards = displayInsights.length >= 4;

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
        <div className={styles.titleSup}>{subtitle}</div>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.divider} />
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
              featured={i === 0 && !isManyCards}
              compact={isManyCards}
            />
          ))}
        </div>
      )}
    </SlideShell>
  );
}
