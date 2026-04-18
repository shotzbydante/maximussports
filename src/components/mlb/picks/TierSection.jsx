/**
 * TierSection — renders a tier heading + grid of PickCardV2.
 *
 * Tier 1 / 2 / 3 visually differentiate via accent strip + subtle treatment
 * (not loud color). Tier 3 sits lower-density on the page.
 */

import { useState } from 'react';
import PickCardV2 from './PickCardV2';
import styles from './TierSection.module.css';

const TIER_META = {
  tier1: {
    title: 'Maximus Top Plays',
    kicker: 'Tier 1',
    sub: 'Highest-conviction picks. Model score above 75 AND top 10% of today\'s slate.',
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

export default function TierSection({ tier, picks = [], initialCollapsed = false, mode = 'page' }) {
  const meta = TIER_META[tier];
  const [collapsed, setCollapsed] = useState(initialCollapsed && picks.length > 0);

  if (!picks.length) {
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

  return (
    <div className={`${styles.section} ${styles[meta.variant]} ${mode === 'home' ? styles.sectionHome : ''}`}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.kicker}>{meta.kicker}</span>
          <h3 className={styles.title}>{meta.title}</h3>
          <p className={styles.sub}>{meta.sub}</p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.countPill}>{picks.length} {picks.length === 1 ? 'pick' : 'picks'}</span>
          {tier === 'tier3' && (
            <button type="button" className={styles.collapseBtn} onClick={() => setCollapsed(v => !v)}>
              {collapsed ? 'Show' : 'Hide'}
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div className={`${styles.grid} ${tier === 'tier3' ? styles.gridTier3 : ''}`}>
          {picks.map(p => <PickCardV2 key={p.id} pick={p} tier={tier} />)}
        </div>
      )}
    </div>
  );
}
