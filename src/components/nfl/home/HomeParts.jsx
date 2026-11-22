/**
 * Small shared pieces for the NFL home page: section heading with a round
 * "more" control, the snapping rail, the score ring and the paired bars
 * that put the model's probability next to the market's.
 */

import { Link } from 'react-router-dom';
import h from './home.module.css';

export function Chevron({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Section title. `to` adds the round chevron link; `moreLabel` names it. */
export function SectionHead({ title, count, to, moreLabel, children }) {
  return (
    <div className={h.sectionHead}>
      <h2 className={h.sectionTitle}>{title}</h2>
      {count != null && <span className={h.sectionCount}>{count}</span>}
      {children}
      {to && (
        <Link to={to} className={h.more} aria-label={moreLabel}>
          <span className={h.moreText}>{moreLabel}</span>
          <span className={h.moreIcon}><Chevron /></span>
        </Link>
      )}
    </div>
  );
}

/** Horizontal snapping row on phones, a plain grid on wide screens. */
export function Rail({ label, narrow = false, cap, children }) {
  const capClass = cap === 6 ? h.railCap6 : cap === 4 ? h.railCap4 : '';
  return (
    <div
      className={`${h.rail} ${narrow ? h.railNarrow : ''} ${capClass}`}
      role="list"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

/** Bet score out of 100 drawn as a ring. */
export function ScoreRing({ value, small = false }) {
  const size = small ? 44 : 62;
  const stroke = small ? 4 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`${h.ring} ${small ? h.ringSm : ''}`} role="img" aria-label={`Bet score ${pct} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className={h.ringTrack} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className={h.ringFill}
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className={h.ringValue}>{pct}</span>
    </div>
  );
}

function pctText(p) { return `${Math.round(p * 100)}%`; }

/** Model probability against the market's, on the same scale. */
export function ModelMarketBars({ model, market }) {
  if (typeof model !== 'number' || typeof market !== 'number') return null;
  return (
    <div className={h.bars}>
      <div className={`${h.bar} ${h.barModel}`}>
        <span>Model</span>
        <span className={h.barTrack}><span className={h.barFill} style={{ width: pctText(model) }} /></span>
        <span className={h.barValue}>{pctText(model)}</span>
      </div>
      <div className={h.bar}>
        <span>Market</span>
        <span className={h.barTrack}><span className={h.barFill} style={{ width: pctText(market) }} /></span>
        <span className={h.barValue}>{pctText(market)}</span>
      </div>
    </div>
  );
}
