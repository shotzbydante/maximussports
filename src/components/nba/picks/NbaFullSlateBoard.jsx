/**
 * NbaFullSlateBoard — game-by-game ML / ATS / Total breakdown.
 *
 * Renders every NBA playoff game on the slate with one card per market
 * (Moneyline / Spread / Total). Used on /nba/insights as the canonical
 * full-slate surface (per the v7 audit).
 *
 * NBA Home stays curated to hero picks; this component is the
 * "everything graded" view.
 *
 * Tracking picks (low-conviction) render with a muted card chrome + a
 * `Tracking` flag so they're visually distinct from hero picks.
 */

import { useCanonicalPicks } from '../../../features/picks/useCanonicalPicks';
import { resolveTeamLogo } from '../../../utils/teamLogo';
import { convictionTier } from '../../../features/mlb/picks/convictionTier';
import styles from './NbaFullSlateBoard.module.css';

const MARKET_LABEL = {
  moneyline: 'Pick ’Em',
  runline:   'Spread',
  total:     'Total',
};

function formatTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

function formatGameDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return null; }
}

function sourceLineFor(pick, marketKey) {
  if (!pick) return null;
  const isTracking = pick.pickRole === 'tracking' || pick.flags?.tracking === true;
  const isCrossMarket =
    pick.modelSource === 'spread'
    || pick.modelSource === 'devigged_ml'
    || pick.modelSource === 'no_vig_blend';

  // Moneyline: ML odds missing → spread fallback
  if (marketKey === 'moneyline') {
    if (pick.impliedSource === 'spread') {
      return { label: 'ML odds unavailable · spread-derived tracking pick', warn: true };
    }
    if (pick.lowSignalReason === 'large_spread_guard') {
      return { label: 'Large spread · model blended toward no-vig', warn: true };
    }
    if (isCrossMarket && isTracking) {
      return { label: 'Tracking pick · cross-market signal only', warn: true };
    }
    if (pick.modelSource === 'spread' && pick.impliedSource === 'odds_no_vig') {
      return { label: 'Spread-vs-moneyline edge', warn: false };
    }
  }
  // Spread: projected margin source
  if (marketKey === 'runline') {
    if (pick.modelSource === 'spread_self') {
      return { label: 'No moneyline · spread fallback', warn: true };
    }
    if (isCrossMarket && isTracking) {
      return { label: 'Low conviction · market disagreement', warn: true };
    }
    if (pick.modelSource === 'devigged_ml') {
      return { label: 'Projected margin · de-vigged ML', warn: false };
    }
  }
  // Total: fair-total source
  if (marketKey === 'total') {
    const src = pick.modelSource;
    if (src === 'series_pace_v1' || src?.startsWith?.('series_pace_v1+')) {
      return { label: 'Series pace prior', warn: false };
    }
    if (src === 'team_recent_v1' || src?.startsWith?.('team_recent_v1+')) {
      return { label: 'Recent totals trend', warn: false };
    }
    if (src === 'slate_baseline_v1' || src?.startsWith?.('slate_baseline_v1+')) {
      return { label: 'Low-signal total · tracking only', warn: true };
    }
    if (pick.isLowConviction) {
      return { label: 'Low-signal total · tracking only', warn: true };
    }
  }
  return null;
}

function MarketCard({ pick, marketKey }) {
  if (!pick) {
    return (
      <div className={`${styles.marketCard} ${styles.marketCardEmpty}`}>
        <span className={styles.marketLabel}>{MARKET_LABEL[marketKey]}</span>
        <span className={styles.empty}>No qualified pick</span>
      </div>
    );
  }
  const score = pick.conviction?.score ?? Math.round((pick.betScore?.total ?? 0) * 100);
  const tier = score != null ? convictionTier(score) : null;
  const tierVariant = tier?.variant ? styles[`tier_${tier.variant}`] : '';
  const isTracking = pick.pickRole === 'tracking' || pick.flags?.tracking === true;
  const sourceLine = sourceLineFor(pick, marketKey);

  return (
    <div className={`${styles.marketCard} ${tierVariant} ${isTracking ? styles.tracking : ''}`}>
      <header className={styles.marketHeader}>
        <span className={styles.marketLabel}>{MARKET_LABEL[marketKey]}</span>
        {isTracking && <span className={styles.trackingPill}>Tracking</span>}
      </header>
      <span className={styles.pickLabel}>{pick.selection?.label || pick.pick?.label || ''}</span>
      <div className={styles.convictionRow}>
        <span className={styles.convictionLabel}>Conviction</span>
        <span className={styles.convictionValue}>{score}</span>
        {tier?.label && (
          <span className={`${styles.convictionTier} ${styles[`convictionTier_${tier.variant}`] || ''}`}>
            {tier.label}
          </span>
        )}
      </div>
      <div className={styles.metricsRow}>
        {pick.rawEdge != null && (
          <Metric label="Edge"       value={`${(pick.rawEdge * 100).toFixed(1)}%`} />
        )}
        {pick.betScore?.components?.modelConfidence != null && (
          <Metric label="Confidence" value={`${Math.round(pick.betScore.components.modelConfidence * 100)}%`} />
        )}
        {pick.betScore?.total != null && (
          <Metric label="Bet Score"  value={Math.round(pick.betScore.total * 100)} />
        )}
      </div>
      {pick.rationale?.headline && (
        <p className={styles.rationale}>{pick.rationale.headline}</p>
      )}
      {sourceLine && (
        <span className={`${styles.sourceLine} ${sourceLine.warn ? styles.sourceLine_warn : ''}`}>
          {sourceLine.label}
        </span>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <span className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </span>
  );
}

function GameCard({ game }) {
  const awaySlug = game.awayTeam?.slug;
  const homeSlug = game.homeTeam?.slug;
  const awayLogo = resolveTeamLogo({ sport: 'nba', slug: awaySlug });
  const homeLogo = resolveTeamLogo({ sport: 'nba', slug: homeSlug });
  const awayAbbr = game.awayTeam?.shortName || game.awayTeam?.abbrev || (awaySlug || '').toUpperCase();
  const homeAbbr = game.homeTeam?.shortName || game.homeTeam?.abbrev || (homeSlug || '').toUpperCase();
  const dateLabel = formatGameDate(game.startTime);
  const time = formatTime(game.startTime);

  return (
    <article className={styles.gameCard}>
      <header className={styles.gameHeader}>
        <div className={styles.gameMatchup}>
          {awayLogo && <img src={awayLogo} alt="" width={22} height={22} className={styles.teamLogo} loading="lazy" />}
          <span className={styles.teamAbbr}>{awayAbbr}</span>
          <span className={styles.atSymbol}>@</span>
          {homeLogo && <img src={homeLogo} alt="" width={22} height={22} className={styles.teamLogo} loading="lazy" />}
          <span className={styles.teamAbbr}>{homeAbbr}</span>
        </div>
        <div className={styles.gameMeta}>
          {dateLabel && <span className={styles.gameDate}>{dateLabel}</span>}
          {time && <span className={styles.gameTime}>{time}</span>}
        </div>
      </header>
      <div className={styles.marketGrid}>
        <MarketCard pick={game.picks?.moneyline} marketKey="moneyline" />
        <MarketCard pick={game.picks?.runline}   marketKey="runline" />
        <MarketCard pick={game.picks?.total}     marketKey="total" />
      </div>
    </article>
  );
}

export default function NbaFullSlateBoard({ endpoint = '/api/nba/picks/built' } = {}) {
  const { byGame, loading, fullSlatePicks, heroPicks, trackingPicks } =
    useCanonicalPicks({ endpoint });

  if (loading) {
    return (
      <section className={styles.root} aria-busy="true">
        <header className={styles.rootHeader}>
          <span className={styles.rootKicker}>Full Slate Coverage</span>
          <h2 className={styles.rootTitle}>Every Playoff Game &middot; Every Market</h2>
        </header>
        <div className={styles.skel}>
          <div className={styles.skelBlock} />
          <div className={styles.skelBlock} />
        </div>
      </section>
    );
  }

  if (!byGame || byGame.length === 0) {
    return (
      <section className={styles.root}>
        <header className={styles.rootHeader}>
          <span className={styles.rootKicker}>Full Slate Coverage</span>
          <h2 className={styles.rootTitle}>Every Playoff Game &middot; Every Market</h2>
        </header>
        <p className={styles.rootEmpty}>
          No playoff games on the slate yet. Pick &rsquo;Em, ATS, and Total predictions populate
          for every game once the schedule firms up.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.root} aria-label="Full-slate game-by-game breakdown">
      <header className={styles.rootHeader}>
        <span className={styles.rootKicker}>Full Slate Coverage</span>
        <h2 className={styles.rootTitle}>Every Playoff Game &middot; Every Market</h2>
        <p className={styles.rootSub}>
          One Pick &rsquo;Em, one ATS, and one Total pick on every NBA playoff game &mdash; graded
          daily. Hero picks are the highest-conviction edges on the slate; tracking picks are
          recorded and graded so the model&rsquo;s full-slate performance stays transparent.
        </p>
        <div className={styles.statRow}>
          <Stat label="Full-slate picks" value={fullSlatePicks?.length ?? 0} />
          <Stat label="Hero picks"       value={heroPicks?.length ?? 0} />
          <Stat label="Tracking picks"   value={trackingPicks?.length ?? 0} />
          <Stat label="Games covered"    value={byGame.length} />
        </div>
      </header>

      <div className={styles.gameStack}>
        {byGame.map(g => <GameCard key={g.gameId} game={g} />)}
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}
