/**
 * PickCardV2 — premium, glassy, default-expanded pick card.
 *
 * Every numeric metric is explicitly labeled (Conviction / Edge / Confidence /
 * Bet Score). Conviction badge is cool-toned glass — no red/pink.
 */

import { useState } from 'react';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
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

const MARKET_LABEL = {
  moneyline: 'Moneyline',
  runline: 'Run Line',
  total: 'Total',
};

const COMPONENT_META = [
  { key: 'edgeStrength',      label: 'Edge' },
  { key: 'modelConfidence',   label: 'Confidence' },
  { key: 'situationalEdge',   label: 'Situation' },
  { key: 'marketQuality',     label: 'Market' },
];

export default function PickCardV2({ pick, tier }) {
  // Cards default EXPANDED. Users can collapse after.
  const [expanded, setExpanded] = useState(true);

  const awaySlug = pick.matchup?.awayTeam?.slug;
  const homeSlug = pick.matchup?.homeTeam?.slug;
  const awayLogo = awaySlug ? getMlbEspnLogoUrl(awaySlug) : null;
  const homeLogo = homeSlug ? getMlbEspnLogoUrl(homeSlug) : null;
  const away = pick.matchup?.awayTeam?.shortName || 'AWY';
  const home = pick.matchup?.homeTeam?.shortName || 'HOM';
  const time = fmtTime(pick.matchup?.startTime);
  const label = pick.selection?.label || pick.pick?.label || '';
  const marketType = pick.market?.type || pick.pick?.marketType;
  const marketLabel = MARKET_LABEL[marketType] || marketType;
  const headline = pick.rationale?.headline || pick.pick?.explanation || '';
  const bullets = (pick.rationale?.bullets || []).slice(0, 3);

  const conviction = pick.conviction?.score ?? Math.round((pick.betScore?.total ?? 0) * 100);
  const betScore = Math.round((pick.betScore?.total ?? 0) * 100);
  const components = pick.betScore?.components || null;
  const edgePct = pick.rawEdge != null ? fmtPct(pick.rawEdge, { sign: true }) : null;
  const confidencePct = components?.modelConfidence != null
    ? Math.round(components.modelConfidence * 100) : null;

  const tierClass =
    tier === 'tier1' ? styles.cardTier1
    : tier === 'tier2' ? styles.cardTier2
    : styles.cardTier3;

  // Historical result
  const result = pick.result?.status || pick.pick_results?.[0]?.status;
  const resultBadge = result === 'won' ? <span className={`${styles.resultBadge} ${styles.resultWon}`}>Won</span>
    : result === 'lost' ? <span className={`${styles.resultBadge} ${styles.resultLost}`}>Lost</span>
    : result === 'push' ? <span className={`${styles.resultBadge} ${styles.resultPush}`}>Push</span>
    : null;

  // Cross-reference annotations from withTopPickCrossReference()
  const isTopPick = pick._isTopPick;
  const sharesTopMatchup = pick._sharesTopMatchup;

  return (
    <article className={`${styles.card} ${tierClass} ${isTopPick ? styles.cardIsTop : ''}`}>
      <div className={styles.glassFrame} aria-hidden="true" />

      {/* ── Meta row (matchup + tags) ── */}
      <header className={styles.meta}>
        <span className={styles.matchupMeta}>
          {awayLogo && <img src={awayLogo} alt="" width={18} height={18} className={styles.miniLogo} loading="lazy" />}
          <span className={styles.teamMini}>{away}</span>
          <span className={styles.atMini}>@</span>
          {homeLogo && <img src={homeLogo} alt="" width={18} height={18} className={styles.miniLogo} loading="lazy" />}
          <span className={styles.teamMini}>{home}</span>
        </span>
        <div className={styles.tagRow}>
          {marketLabel && <span className={styles.mktTag}>{marketLabel}</span>}
          {isTopPick && <span className={styles.topTag}>★ Top Play</span>}
          {sharesTopMatchup && !isTopPick && <span className={styles.linkedTag}>Linked to Top Play</span>}
          {time && <span className={styles.time}>{time}</span>}
        </div>
      </header>

      {/* ── The pick itself ── */}
      <div className={styles.pickRow}>
        <div className={styles.pickLabelBlock}>
          <span className={styles.pickLabelKicker}>Selection</span>
          <span className={styles.pickLabel}>{label}</span>
        </div>
        <ConvictionBadge value={conviction} tier={tier} />
        {resultBadge}
      </div>

      {/* ── Editorial rationale ── */}
      {headline && <p className={styles.headline}>{headline}</p>}

      {/* ── Expanded detail (default open) ── */}
      <div className={`${styles.detail} ${expanded ? styles.detailOpen : styles.detailClosed}`}>
        <div className={styles.detailInner}>
          {/* Metrics row — explicit labels */}
          <div className={styles.metrics}>
            {edgePct != null && <MetricChip label="Edge" value={edgePct} />}
            {confidencePct != null && <MetricChip label="Confidence" value={`${confidencePct}%`} />}
            <MetricChip label="Bet Score" value={betScore} emphasize />
          </div>

          {/* Component bar with labels */}
          {components && (
            <div className={styles.componentBar} aria-label="Bet-score components breakdown">
              <span className={styles.componentTitle}>Score Composition</span>
              <div className={styles.componentSegments}>
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

function MetricChip({ label, value, emphasize }) {
  return (
    <div className={`${styles.metricChip} ${emphasize ? styles.metricEmphasize : ''}`}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function ComponentSegment({ label, value }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={styles.segment}>
      <div className={styles.segmentHead}>
        <span className={styles.segmentLabel}>{label}</span>
        <span className={styles.segmentValue}>{Math.round(pct * 100)}</span>
      </div>
      <div className={styles.segmentTrack}>
        <div className={styles.segmentFill} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function ConvictionBadge({ value, tier }) {
  return (
    <div className={`${styles.conviction} ${tier === 'tier1' ? styles.convictionT1 : tier === 'tier2' ? styles.convictionT2 : styles.convictionT3}`}
         aria-label={`Conviction score ${value} out of 100`}>
      <span className={styles.convictionLabel}>Conviction</span>
      <span className={styles.convictionValue}>{value}</span>
    </div>
  );
}
