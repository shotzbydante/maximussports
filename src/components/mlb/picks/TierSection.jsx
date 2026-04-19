/**
 * TierSection — renders a tier heading + market-subgrouped matchup cards.
 *
 * Accepts already-grouped matchup cards (shape: { primary, siblings }) so
 * the same matchup cannot render twice within a tier.
 *
 * Inside each tier, picks are further grouped by market type under compact
 * subheaders: Pick 'Ems, Spreads, Game Totals, Value Leans (tier-3 ML).
 */

import { useState } from 'react';
import PickCardV2 from './PickCardV2';
import { groupByMarketType, subgroupLabel } from '../../../features/mlb/picks/groupPicks';
import styles from './TierSection.module.css';

const TIER_META = {
  tier1: {
    title: 'Maximus Top Plays',
    kicker: 'Tier 1',
    sub: 'Highest-conviction picks — model score ≥ 75 and top 10% of today\'s slate.',
    variant: 'tier1',
  },
  tier2: {
    title: 'Strong Plays',
    kicker: 'Tier 2',
    sub: 'Above-threshold edges with solid model + situational alignment.',
    variant: 'tier2',
  },
  tier3: {
    title: 'Leans',
    kicker: 'Tier 3',
    sub: 'Softer edges. Directional value — not standalone bets.',
    variant: 'tier3',
  },
};

const MARKET_ICON = {
  moneyline: (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="4.2" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <polyline points="3.4,5.7 4.8,7.2 7.6,3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  runline: (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <rect x="0.8" y="6.8" width="2" height="3.4" rx="0.6" fill="currentColor" opacity="0.55" />
      <rect x="4.5" y="4.4" width="2" height="5.8" rx="0.6" fill="currentColor" />
      <rect x="8.2" y="2" width="2" height="8.2" rx="0.6" fill="currentColor" opacity="0.4" />
    </svg>
  ),
  total: (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="4.2" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <line x1="3.4" y1="5.5" x2="7.6" y2="5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="5.5" y1="3.4" x2="5.5" y2="7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * @param {object} props
 * @param {'tier1'|'tier2'|'tier3'} props.tier
 * @param {Array<{primary,siblings}>} props.cards   — matchup-grouped cards
 * @param {boolean} [props.initialCollapsed]
 * @param {'page'|'home'} [props.mode]
 */
export default function TierSection({ tier, cards = [], initialCollapsed = false, mode = 'page' }) {
  const meta = TIER_META[tier];
  const [collapsed, setCollapsed] = useState(initialCollapsed && cards.length > 0);
  const picksCount = cards.reduce((acc, c) => acc + 1 + (c.siblings?.length || 0), 0);

  if (!cards.length) {
    return (
      <div className={`${styles.section} ${styles[meta.variant]}`}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.kicker}>{meta.kicker}</span>
            <h3 className={styles.title}>{meta.title}</h3>
          </div>
          <span className={styles.countPill}>0 picks</span>
        </header>
        <p className={styles.empty}>
          {tier === 'tier1'
            ? 'No picks cleared the top-tier threshold today. The model is being selective.'
            : tier === 'tier2'
              ? 'No strong plays qualified today.'
              : 'No leans published.'}
        </p>
      </div>
    );
  }

  const subgroups = groupByMarketType(cards);

  return (
    <section className={`${styles.section} ${styles[meta.variant]} ${mode === 'home' ? styles.sectionHome : ''}`}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.kicker}>{meta.kicker}</span>
          <h3 className={styles.title}>{meta.title}</h3>
          <p className={styles.sub}>{meta.sub}</p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.countPill}>
            {picksCount} {picksCount === 1 ? 'pick' : 'picks'}
          </span>
          {tier === 'tier3' && (
            <button type="button" className={styles.collapseBtn} onClick={() => setCollapsed(v => !v)}>
              {collapsed ? 'Show' : 'Hide'}
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div className={styles.subgroupStack}>
          {subgroups.map(sg => (
            <div key={sg.marketType} className={styles.subgroup}>
              {subgroups.length > 1 && (
                <div className={styles.subgroupHeader}>
                  <span className={styles.subgroupIcon}>{MARKET_ICON[sg.marketType] || null}</span>
                  <span className={styles.subgroupLabel}>{subgroupLabel(sg.marketType, tier, sg.cards.length)}</span>
                  <span className={styles.subgroupCount}>
                    {sg.cards.length} {sg.cards.length === 1 ? 'pick' : 'picks'}
                  </span>
                </div>
              )}
              <div className={`${styles.grid} ${tier === 'tier3' ? styles.gridTier3 : ''}`}>
                {sg.cards.map(c => (
                  <PickCardV2
                    key={c.primary.id}
                    pick={c.primary}
                    tier={tier}
                    siblings={c.siblings || []}
                    relativeStrength={c._relativeStrength || null}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
