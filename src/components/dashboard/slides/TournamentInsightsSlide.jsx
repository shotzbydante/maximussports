import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import styles from './TournamentInsightsSlide.module.css';

const CONFIDENCE_COLORS = {
  HIGH:   { text: '#5FE8A8', bg: 'rgba(95,232,168,0.10)', border: 'rgba(95,232,168,0.28)' },
  MEDIUM: { text: '#D4B87A', bg: 'rgba(212,184,122,0.10)', border: 'rgba(212,184,122,0.28)' },
  LOW:    { text: '#8EAFC4', bg: 'rgba(142,175,196,0.10)', border: 'rgba(142,175,196,0.28)' },
};

function ConfidencePill({ label }) {
  const c = CONFIDENCE_COLORS[label] || CONFIDENCE_COLORS.LOW;
  return (
    <span className={styles.confPill} style={{ color: c.text, background: c.bg, borderColor: c.border }}>
      {label}
    </span>
  );
}

function InsightCard({ insight, featured = false }) {
  if (!insight) return null;
  const { matchup, winner, loser, confidenceLabel, signals, isUpset, winProbability, historicalContext } = insight;
  const winnerTeam = winner || matchup?.topTeam;
  const loserTeam = loser || matchup?.bottomTeam;

  const topSignal = signals?.[0] || 'Composite model edge';
  const secondSignal = signals?.[1] || historicalContext || null;

  return (
    <div className={`${styles.card} ${featured ? styles.cardFeatured : ''}`}>
      <div className={styles.cardHeader}>
        <div className={styles.seedMatchup}>
          <span className={styles.seedBadge}>#{matchup?.topSeed}</span>
          <span className={styles.seedVs}>vs</span>
          <span className={styles.seedBadge}>#{matchup?.bottomSeed}</span>
          {matchup?.region && <span className={styles.regionTag}>{matchup.region}</span>}
        </div>
        {isUpset && <span className={styles.upsetTag}>UPSET WATCH</span>}
      </div>

      <div className={styles.teamsRow}>
        <div className={styles.teamSide}>
          <TeamLogo team={matchup?.topTeam} size={featured ? 36 : 28} />
          <span className={styles.teamName}>{matchup?.topTeam?.shortName || matchup?.topTeam?.name}</span>
        </div>
        <span className={styles.vsIcon}>VS</span>
        <div className={`${styles.teamSide} ${styles.teamSideRight}`}>
          <span className={styles.teamName}>{matchup?.bottomTeam?.shortName || matchup?.bottomTeam?.name}</span>
          <TeamLogo team={matchup?.bottomTeam} size={featured ? 36 : 28} />
        </div>
      </div>

      <div className={styles.predictionRow}>
        <div className={styles.winnerBlock}>
          <span className={styles.pickLabel}>PICK</span>
          <span className={styles.winnerName}>{winnerTeam?.shortName || winnerTeam?.name}</span>
        </div>
        <ConfidencePill label={confidenceLabel} />
        {winProbability != null && (
          <span className={styles.probBadge}>{Math.round(winProbability * 100)}%</span>
        )}
      </div>

      <div className={styles.signalList}>
        <span className={styles.signal}>{topSignal}</span>
        {secondSignal && <span className={styles.signal}>{secondSignal}</span>}
      </div>
    </div>
  );
}

/**
 * Tournament Insights hero slide — shows 3–5 matchup insight cards
 * for a seed-line or custom selection. 1080×1350 IG 4:5 format.
 *
 * Props.options.tournamentInsights: { title, subtitle, insights[] }
 */
export default function TournamentInsightsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const ti = options.tournamentInsights || {};
  const title = ti.title || 'March Madness\nInsights';
  const subtitle = ti.subtitle || 'TOURNAMENT INTELLIGENCE';
  const insights = ti.insights || [];

  const displayInsights = insights.slice(0, 5);

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
      <div className={styles.headerBlock}>
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
            <InsightCard key={i} insight={insight} featured={i === 0} />
          ))}
        </div>
      )}
    </SlideShell>
  );
}
