/**
 * LiveGameCard — compact game intelligence card for MLB live/upcoming games.
 * Used in LiveNowRail, Games page, and Team page.
 * Shows real odds, edge signals, and insights when available.
 */

import styles from './LiveGameCard.module.css';

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

function SignalBadge({ label, value, variant }) {
  if (value == null) return null;
  return (
    <span className={`${styles.signalBadge} ${styles[`signal${variant}`] || ''}`}>
      {label} {value}
    </span>
  );
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

export default function LiveGameCard({ game, compact = false }) {
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
          {signals.importanceScore >= 60 && <SignalBadge label="IMP" value={signals.importanceScore} variant="Hot" />}
          {signals.marketDislocationScore >= 20 && <SignalBadge label="EDGE" value={signals.marketDislocationScore} variant="Edge" />}
          {signals.watchabilityScore >= 60 && <SignalBadge label="WATCH" value={signals.watchabilityScore} variant="Watch" />}
        </div>
      )}

      {/* Betting — show real values or muted placeholders */}
      {!compact && (
        <div className={styles.bettingRow}>
          <span className={`${styles.bettingItem} ${hasRealOdds ? styles.bettingReal : ''}`}>
            {betting?.spreadDisplay || '—'}
          </span>
          <span className={`${styles.bettingItem} ${hasRealOdds ? styles.bettingReal : ''}`}>
            {betting?.totalDisplay || '—'}
          </span>
        </div>
      )}

      {/* Insight */}
      {insight?.headline && !compact && (
        <p className={styles.insight}>{insight.headline}</p>
      )}

      {/* Gamecast CTA */}
      {links?.gamecastUrl && (
        <a href={links.gamecastUrl} target="_blank" rel="noopener noreferrer" className={styles.gamecastCta}>
          ESPN Gamecast ↗
        </a>
      )}
    </div>
  );
}
