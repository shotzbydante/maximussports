/**
 * TierSection — renders a tier heading + grid of PickCardV2.
 *
 * Takes the tier name, label, and picks. Collapses on mobile for tier3.
 */

import { useState } from 'react';
import PickCardV2 from './PickCardV2';
import styles from './TierSection.module.css';

const TIER_META = {
  tier1: { title: 'Tier 1 — Maximus Top Plays', sub: 'Highest bet-score picks of the day. Conviction-weighted.', accent: '#b8293d' },
  tier2: { title: 'Tier 2 — Strong Plays', sub: 'Above-threshold edges with solid model + situational alignment.', accent: '#0f2440' },
  tier3: { title: 'Tier 3 — Leans', sub: 'Softer edges. Dimensional value, not a standalone bet.', accent: '#6b7280' },
};

export default function TierSection({ tier, picks = [], initialCollapsed = false }) {
  const meta = TIER_META[tier];
  const [collapsed, setCollapsed] = useState(initialCollapsed && picks.length > 0);

  if (!picks.length) {
    return (
      <div className={styles.section}>
        <header className={styles.header} style={{ borderLeftColor: meta.accent }}>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>{meta.title}</h3>
            <span className={styles.count}>0</span>
          </div>
          <p className={styles.sub}>{meta.sub}</p>
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
    <div className={styles.section}>
      <header className={styles.header} style={{ borderLeftColor: meta.accent }}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{meta.title}</h3>
          <span className={styles.count}>{picks.length}</span>
          {tier === 'tier3' && (
            <button type="button" className={styles.toggle} onClick={() => setCollapsed(v => !v)}>
              {collapsed ? 'Show' : 'Hide'}
            </button>
          )}
        </div>
        <p className={styles.sub}>{meta.sub}</p>
      </header>

      {!collapsed && (
        <div className={styles.grid}>
          {picks.map(p => <PickCardV2 key={p.id} pick={p} tier={tier} />)}
        </div>
      )}
    </div>
  );
}
