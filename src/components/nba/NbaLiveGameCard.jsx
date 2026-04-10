/**
 * NbaLiveGameCard — compact game intelligence card for NBA live/upcoming games.
 * Mirrors MLB LiveGameCard structure with NBA branding.
 */

import styles from './NbaLiveGameCard.module.css';

function StatusPill({ game }) {
  const gs = game.gameState || {};
  if (gs.isLive) {
    return (
      <span className={`${styles.pill} ${styles.pillLive}`}>
        <span className={styles.liveDot} />
        {gs.periodLabel || 'LIVE'}
      </span>
    );
  }
  if (gs.isFinal) return <span className={`${styles.pill} ${styles.pillFinal}`}>Final</span>;
  return <span className={`${styles.pill} ${styles.pillUpcoming}`}>{game.displayTime || 'Scheduled'}</span>;
}

function EdgeBadge({ model }) {
  if (!model?.pregameEdge) return null;
  const edge = Math.abs(model.pregameEdge);
  if (edge < 0.5) return null;
  const label = edge >= 2.0 ? 'Strong Edge' : edge >= 1.0 ? 'Edge' : 'Lean';
  const variant = edge >= 2.0 ? 'edgeStrong' : edge >= 1.0 ? 'edgeMod' : 'edgeSlight';
  return (
    <span className={`${styles.edgeBadge} ${styles[variant] || ''}`}>
      {label}
    </span>
  );
}

export default function NbaLiveGameCard({ game, compact = false }) {
  if (!game) return null;
  const { teams, gameState, broadcast, signals, insight, links, betting, market, model } = game;
  const isLive = gameState?.isLive;
  const hasRealOdds = market?.pregameSpread != null || market?.pregameTotal != null;

  return (
    <div className={`${styles.card} ${isLive ? styles.cardLive : ''} ${compact ? styles.cardCompact : ''}`}>
      {/* Matchup */}
      <div className={styles.matchup}>
        <div className={styles.teamRow}>
          {teams?.away?.logo && <img src={teams.away.logo} alt="" className={styles.logo} width={24} height={24} loading="lazy" />}
          <span className={styles.teamName}>{teams?.away?.abbrev || teams?.away?.name || 'TBD'}</span>
          <span className={styles.score}>{teams?.away?.score ?? ''}</span>
        </div>
        <div className={styles.teamRow}>
          {teams?.home?.logo && <img src={teams.home.logo} alt="" className={styles.logo} width={24} height={24} loading="lazy" />}
          <span className={styles.teamName}>{teams?.home?.abbrev || teams?.home?.name || 'TBD'}</span>
          <span className={styles.score}>{teams?.home?.score ?? ''}</span>
        </div>
      </div>

      {/* Status + Meta */}
      <div className={styles.meta}>
        <StatusPill game={game} />
        {broadcast?.network && <span className={styles.networkBadge}>{broadcast.network}</span>}
        {!compact && <EdgeBadge model={model} />}
      </div>

      {/* Signals */}
      {signals && !compact && (
        <div className={styles.signalRow}>
          {signals.importanceScore >= 60 && (
            <span className={`${styles.signalBadge} ${styles.signalHot}`}>IMP {signals.importanceScore}</span>
          )}
          {signals.marketDislocationScore >= 20 && (
            <span className={`${styles.signalBadge} ${styles.signalEdge}`}>EDGE {signals.marketDislocationScore}</span>
          )}
          {signals.watchabilityScore >= 60 && (
            <span className={`${styles.signalBadge} ${styles.signalWatch}`}>WATCH {signals.watchabilityScore}</span>
          )}
        </div>
      )}

      {/* Betting */}
      {!compact && (
        <div className={styles.bettingRow}>
          <span className={`${styles.bettingItem} ${hasRealOdds ? styles.bettingReal : ''}`}>
            {betting?.spreadDisplay || '\u2014'}
          </span>
          <span className={`${styles.bettingItem} ${hasRealOdds ? styles.bettingReal : ''}`}>
            {betting?.totalDisplay || '\u2014'}
          </span>
        </div>
      )}

      {/* Insight */}
      {insight?.headline && !compact && (
        <p className={styles.insight}>{insight.headline}</p>
      )}

      {/* ESPN CTA */}
      {links?.gamecastUrl && (
        <a href={links.gamecastUrl} target="_blank" rel="noopener noreferrer" className={styles.gamecastCta}>
          ESPN Gamecast &#x2197;
        </a>
      )}
    </div>
  );
}
