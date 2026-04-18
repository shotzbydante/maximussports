/**
 * PickCardV2 — conviction-first, mobile-first pick card used inside a TierSection.
 */

import { useState } from 'react';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import styles from './PickCardV2.module.css';

function formatTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

const MARKET_LABEL = {
  moneyline: 'ML',
  runline: 'RL',
  total: 'TOT',
};

export default function PickCardV2({ pick, tier }) {
  const [expanded, setExpanded] = useState(false);
  const awaySlug = pick.matchup?.awayTeam?.slug;
  const homeSlug = pick.matchup?.homeTeam?.slug;
  const awayLogo = awaySlug ? getMlbEspnLogoUrl(awaySlug) : null;
  const homeLogo = homeSlug ? getMlbEspnLogoUrl(homeSlug) : null;
  const away = pick.matchup?.awayTeam?.shortName || 'AWY';
  const home = pick.matchup?.homeTeam?.shortName || 'HOM';
  const time = formatTime(pick.matchup?.startTime);
  const label = pick.selection?.label || pick.pick?.label || '';
  const marketType = pick.market?.type || pick.pick?.marketType;
  const headline = pick.rationale?.headline || pick.pick?.explanation || '';
  const bullets = (pick.rationale?.bullets || []).slice(0, 3);
  const conv = pick.conviction?.score ?? Math.round((pick.betScore?.total ?? 0) * 100);
  const components = pick.betScore?.components;

  const tierClass = tier === 'tier1' ? styles.cardTier1 : tier === 'tier2' ? styles.cardTier2 : styles.cardTier3;

  // Result badge (historical)
  let resultBadge = null;
  const result = pick.result?.status || pick.pick_results?.[0]?.status;
  if (result === 'won') resultBadge = <span className={`${styles.resultBadge} ${styles.won}`}>WON</span>;
  else if (result === 'lost') resultBadge = <span className={`${styles.resultBadge} ${styles.lost}`}>LOST</span>;
  else if (result === 'push') resultBadge = <span className={`${styles.resultBadge} ${styles.push}`}>PUSH</span>;

  return (
    <article className={`${styles.card} ${tierClass}`}>
      <header className={styles.meta}>
        <span className={styles.matchupMeta}>
          {awayLogo && <img src={awayLogo} alt="" width={16} height={16} className={styles.miniLogo} loading="lazy" />}
          <span className={styles.teamMini}>{away}</span>
          <span className={styles.atMini}>@</span>
          {homeLogo && <img src={homeLogo} alt="" width={16} height={16} className={styles.miniLogo} loading="lazy" />}
          <span className={styles.teamMini}>{home}</span>
        </span>
        {time && <span className={styles.time}>{time}</span>}
      </header>

      <div className={styles.pickRow}>
        <span className={styles.pickLabel}>{label}</span>
        {marketType && <span className={styles.mktTag}>{MARKET_LABEL[marketType] || marketType}</span>}
        <span className={styles.conviction}>{conv}</span>
        {resultBadge}
      </div>

      {headline && <p className={styles.headline}>{headline}</p>}

      {expanded && (
        <>
          {components && (
            <div className={styles.componentBar} aria-label="Bet-score components">
              <Segment label="E" value={components.edgeStrength} color="#b8293d" />
              <Segment label="C" value={components.modelConfidence} color="#0f2440" />
              <Segment label="S" value={components.situationalEdge} color="#0d9488" />
              <Segment label="M" value={components.marketQuality} color="#ca8a04" />
            </div>
          )}
          {bullets.length > 0 && (
            <ul className={styles.bullets}>
              {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </>
      )}

      <button
        type="button"
        className={styles.expandBtn}
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'Hide detail' : 'See why'}
      </button>
    </article>
  );
}

function Segment({ label, value, color }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={styles.segment}>
      <div className={styles.segmentBar} title={`${label}: ${(pct * 100).toFixed(0)}%`}>
        <div className={styles.segmentFill} style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <span className={styles.segmentLabel}>{label}</span>
    </div>
  );
}
