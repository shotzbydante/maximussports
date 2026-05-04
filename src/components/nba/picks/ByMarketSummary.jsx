/**
 * ByMarketSummary — explicit Pick 'Em / ATS / Totals strip rendered above
 * the picks tier grid on NBA Home. Always shows the three primary market
 * categories with their pick counts so a single-tier slate (e.g. Tier 3
 * spreads only) doesn't hide the ML/Totals labels.
 *
 * Counts come from the canonical picks payload (tiers + coverage).
 * `notes.totalsInactive` is true when the engine has no fair-total model;
 * in that case the Totals tile renders an honest "model inactive" caption
 * instead of pretending the absence is a slate condition.
 */

import styles from './ByMarketSummary.module.css';

function pickIsType(p, type) {
  // Engine stores spreads as `runline` for shared MLB shape. Treat both
  // as the ATS bucket from a UI perspective.
  if (type === 'runline') return p?.market?.type === 'runline' || p?.market?.type === 'spread';
  return p?.market?.type === type;
}

function countByMarket(allPicks, type) {
  return (allPicks || []).filter(p => pickIsType(p, type)).length;
}

function MarketTile({ kicker, title, count, caption, accent, inactive }) {
  return (
    <div className={`${styles.tile} ${styles[`tile_${accent}`]} ${inactive ? styles.tileInactive : ''}`}>
      <span className={styles.kicker}>{kicker}</span>
      <span className={styles.title}>{title}</span>
      <div className={styles.countRow}>
        <span className={styles.count}>{count}</span>
        <span className={styles.countLabel}>{count === 1 ? 'pick' : 'picks'}</span>
      </div>
      {caption && <span className={styles.caption}>{caption}</span>}
    </div>
  );
}

export default function ByMarketSummary({ picks = [], notes = {} }) {
  const ml    = countByMarket(picks, 'moneyline');
  const ats   = countByMarket(picks, 'runline');
  const tot   = countByMarket(picks, 'total');

  const totalsCaption = notes.totalsInactive
    ? 'Fair-total model inactive — totals coverage requires a pace/efficiency prior.'
    : tot === 0
      ? 'No qualified totals on today’s slate.'
      : null;
  const mlCaption  = ml === 0  ? 'No moneyline edges cleared the gate today.'  : null;
  const atsCaption = ats === 0 ? 'No spread edges cleared the gate today.'     : null;

  // v7 framing: NBA Home shows hero picks; the full slate (every game ×
  // 3 markets) lives on Odds Insights. When the parent supplies hero +
  // full-slate counts, surface them so users understand what they're
  // looking at.
  const heroCount = Number.isFinite(notes.heroCount) ? notes.heroCount : null;
  const fullSlateCount = Number.isFinite(notes.fullSlateCount) ? notes.fullSlateCount : null;
  const insightsHref = notes.insightsHref || '/nba/insights';

  return (
    <section className={styles.root} aria-label="Today's picks by market">
      <header className={styles.header}>
        <span className={styles.eyebrow}>Picks by Market</span>
        <span className={styles.sub}>
          Every playoff game gets a Pick &rsquo;Em, a Spread, and a Total &mdash; graded daily.
        </span>
      </header>
      <div className={styles.grid}>
        <MarketTile kicker="Pick &rsquo;Ems"  title="Moneyline" count={ml}  caption={mlCaption}  accent="ml" />
        <MarketTile kicker="ATS"             title="Spread"    count={ats} caption={atsCaption} accent="ats" />
        <MarketTile
          kicker="Totals"
          title="Over / Under"
          count={tot}
          caption={totalsCaption}
          accent="tot"
          inactive={notes.totalsInactive}
        />
      </div>
      {(heroCount != null || fullSlateCount != null) && (
        <footer className={styles.footer}>
          <span className={styles.footerCounts}>
            {heroCount != null && (
              <span><strong>{heroCount}</strong> hero {heroCount === 1 ? 'pick' : 'picks'} shown</span>
            )}
            {heroCount != null && fullSlateCount != null && <span className={styles.footerSep}>&middot;</span>}
            {fullSlateCount != null && (
              <span><strong>{fullSlateCount}</strong> full-slate {fullSlateCount === 1 ? 'pick' : 'picks'} tracked</span>
            )}
          </span>
          <a href={insightsHref} className={styles.footerCta}>
            See every game pick &rarr;
          </a>
        </footer>
      )}
    </section>
  );
}
