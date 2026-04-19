/**
 * PickCardV2 — compact, glass, default-expanded matchup card.
 *
 * Adds:
 *   - "Recommended" kicker above the pick label (explicit action framing)
 *   - Conviction tier word ("Elite" / "Strong" / "Solid" / "Lean") next to
 *     the numeric score, derived from convictionTier().
 *   - Stronger hierarchy for sibling rows — indent, smaller type, muted
 *     treatment so they're clearly secondary to the primary pick.
 */

import { useState } from 'react';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { convictionTier, convictionDescription } from '../../../features/mlb/picks/convictionTier';
import styles from './PickCardV2.module.css';

function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}
function fmtPct(v, { sign = false } = {}) {
  if (v == null || !isFinite(v)) return null;
  const n = v * 100;
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

const MARKET_SHORT = {
  moneyline: 'ML',
  runline: 'Spread',
  total: 'Total',
};

const COMPONENT_META = [
  { key: 'edgeStrength',    label: 'Edge' },
  { key: 'modelConfidence', label: 'Conf.' },
  { key: 'situationalEdge', label: 'Sit.' },
  { key: 'marketQuality',   label: 'Market' },
];

export default function PickCardV2({ pick, tier, siblings = [] }) {
  const [expanded, setExpanded] = useState(true);

  const awaySlug = pick.matchup?.awayTeam?.slug;
  const homeSlug = pick.matchup?.homeTeam?.slug;
  const awayLogo = awaySlug ? getMlbEspnLogoUrl(awaySlug) : null;
  const homeLogo = homeSlug ? getMlbEspnLogoUrl(homeSlug) : null;
  const away = pick.matchup?.awayTeam?.shortName || 'AWY';
  const home = pick.matchup?.homeTeam?.shortName || 'HOM';
  const time = fmtTime(pick.matchup?.startTime);
  const label = pick.selection?.label || pick.pick?.label || '';
  const headline = pick.rationale?.headline || pick.pick?.explanation || '';
  const bullets = (pick.rationale?.bullets || []).slice(0, 2);

  const conviction = pick.conviction?.score ?? Math.round((pick.betScore?.total ?? 0) * 100);
  const betScore = Math.round((pick.betScore?.total ?? 0) * 100);
  const components = pick.betScore?.components || null;
  const edgePct = pick.rawEdge != null ? fmtPct(pick.rawEdge, { sign: true }) : null;
  const confidencePct = components?.modelConfidence != null
    ? Math.round(components.modelConfidence * 100) : null;
  const tierLabel = convictionTier(conviction);

  const tierClass =
    tier === 'tier1' ? styles.cardTier1
    : tier === 'tier2' ? styles.cardTier2
    : styles.cardTier3;

  const result = pick.result?.status || pick.pick_results?.[0]?.status;
  const resultBadge = result === 'won' ? <span className={`${styles.resultBadge} ${styles.resultWon}`}>Won</span>
    : result === 'lost' ? <span className={`${styles.resultBadge} ${styles.resultLost}`}>Lost</span>
    : result === 'push' ? <span className={`${styles.resultBadge} ${styles.resultPush}`}>Push</span>
    : null;

  const isTopPick = pick._isTopPick;
  const doubleheader = pick._doubleheaderGame;

  return (
    <article className={`${styles.card} ${tierClass} ${isTopPick ? styles.cardIsTop : ''}`}>
      <div className={styles.glassFrame} aria-hidden="true" />

      <header className={styles.topRow}>
        <span className={styles.matchup}>
          {awayLogo && <img src={awayLogo} alt="" width={16} height={16} className={styles.miniLogo} loading="lazy" />}
          <span className={styles.teamMini}>{away}</span>
          <span className={styles.atMini}>@</span>
          {homeLogo && <img src={homeLogo} alt="" width={16} height={16} className={styles.miniLogo} loading="lazy" />}
          <span className={styles.teamMini}>{home}</span>
        </span>
        <div className={styles.tags}>
          {doubleheader && <span className={styles.dhTag}>Game {doubleheader}</span>}
          {isTopPick && <span className={styles.topTag}>★ Top Play</span>}
          {time && <span className={styles.time}>{time}</span>}
        </div>
      </header>

      <div className={styles.pickRow}>
        <div className={styles.pickLabelBlock}>
          <span className={styles.recommendedKicker}>Recommended</span>
          <span className={styles.pickLabel}>{label}</span>
        </div>
        <div className={styles.pickRowRight}>
          {resultBadge}
          <ConvictionBadge value={conviction} tier={tier} tierLabel={tierLabel} />
        </div>
      </div>

      {headline && <p className={styles.headline}>{headline}</p>}

      <div className={`${styles.detail} ${expanded ? styles.detailOpen : styles.detailClosed}`}>
        <div className={styles.detailInner}>

          <div className={styles.metrics}>
            {edgePct != null && <Metric label="Edge" value={edgePct} />}
            {confidencePct != null && <Metric label="Confidence" value={`${confidencePct}%`} />}
            <Metric label="Bet Score" value={betScore} emphasize />
          </div>

          {components && tier !== 'tier3' && (
            <div className={styles.componentBar}>
              <span className={styles.componentTitle}>Score Composition</span>
              <div className={styles.componentStrip}>
                {COMPONENT_META.map(c => (
                  <ComponentSegment key={c.key} label={c.label} value={components[c.key]} />
                ))}
              </div>
            </div>
          )}

          {bullets.length > 0 && (
            <ul className={styles.bullets}>
              {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}

          {siblings.length > 0 && (
            <div className={styles.siblings}>
              <div className={styles.siblingsHeader}>
                <span className={styles.siblingsTitle}>Also from this matchup</span>
                <span className={styles.siblingsCount}>{siblings.length}</span>
              </div>
              <div className={styles.siblingsList}>
                {siblings.map(s => <SiblingRow key={s.id} pick={s} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className={styles.toggle}
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse card detail' : 'Expand card detail'}
      >
        {expanded ? 'Hide detail' : 'Show detail'}
        <svg width="10" height="10" viewBox="0 0 10 10" className={expanded ? styles.chevronUp : styles.chevron}>
          <polyline points="1.5,3 5,6.5 8.5,3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </article>
  );
}

function SiblingRow({ pick }) {
  const mkt = MARKET_SHORT[pick.market?.type] || pick.market?.type || '';
  const label = pick.selection?.label || pick.pick?.label || '';
  const score = Math.round((pick.betScore?.total ?? 0) * 100);
  const tierLabel = convictionTier(score);
  return (
    <div className={styles.sibling} title={convictionDescription(score)}>
      <span className={styles.siblingBar} aria-hidden="true" />
      <span className={styles.siblingMkt}>{mkt}</span>
      <span className={styles.siblingLabel}>{label}</span>
      <span className={styles.siblingMeta}>
        <span className={`${styles.siblingTier} ${styles[`siblingTier_${tierLabel.variant}`]}`}>{tierLabel.label}</span>
        <span className={styles.siblingScore}>
          <span className={styles.siblingScoreLabel}>Score</span>
          <span className={styles.siblingScoreValue}>{score}</span>
        </span>
      </span>
    </div>
  );
}

function Metric({ label, value, emphasize }) {
  return (
    <div className={`${styles.metric} ${emphasize ? styles.metricEmphasize : ''}`}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function ComponentSegment({ label, value }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={styles.segment}>
      <div className={styles.segmentTrack}>
        <div className={styles.segmentFill} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className={styles.segmentLabel}>{label}</span>
    </div>
  );
}

function ConvictionBadge({ value, tier, tierLabel }) {
  const tierClass = tier === 'tier1' ? styles.convictionT1 : tier === 'tier2' ? styles.convictionT2 : styles.convictionT3;
  return (
    <div
      className={`${styles.conviction} ${tierClass}`}
      aria-label={convictionDescription(value)}
      title={convictionDescription(value)}
    >
      <span className={styles.convictionTop}>
        <span className={styles.convictionLabel}>Conviction</span>
        <span className={styles.convictionValue}>{value}</span>
      </span>
      <span className={`${styles.convictionTierLabel} ${styles[`convictionTier_${tierLabel.variant}`]}`}>
        {tierLabel.label}
      </span>
    </div>
  );
}
