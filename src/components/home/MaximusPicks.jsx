import { useEffect, useMemo, useState } from 'react';
import { buildMaximusPicks, confidenceLabel } from '../../utils/maximusPicksModel';
import TeamLogo from '../shared/TeamLogo';
import styles from './MaximusPicks.module.css';

// ─── inline SVG icons ─────────────────────────────────────────────────────────

function IconAts() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="0.5" y="7.5" width="2.5" height="4.5" rx="1" fill="currentColor" opacity="0.65" />
      <rect x="5" y="4.5" width="2.5" height="7.5" rx="1" fill="currentColor" />
      <rect x="9.5" y="1.5" width="2.5" height="10.5" rx="1" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

function IconMl() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <polyline
        points="1,11 4,7 7,9 10,3.5 12,2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function IconTotals() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="4" y1="6.5" x2="9" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6.5" y1="4" x2="6.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      aria-hidden="true"
      className={open ? styles.chevronOpen : styles.chevron}
    >
      <polyline
        points="2,3.5 5.5,7.5 9,3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── copy-to-clipboard button ─────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <button
      type="button"
      className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ''}`}
      onClick={handleCopy}
      title="Copy line to clipboard"
      aria-label="Copy line to clipboard"
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <polyline points="2,6 4.5,8.5 9,3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <rect x="1" y="3.5" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M3.5 3.5V2a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      )}
    </button>
  );
}

// ─── confidence chip ──────────────────────────────────────────────────────────

function ConfidenceChip({ level }) {
  const label = confidenceLabel(level);
  return (
    <span
      className={`${styles.confChip} ${level >= 2 ? styles.confHigh : level >= 1 ? styles.confMed : styles.confLow}`}
      title={`${label} confidence`}
      aria-label={`Confidence: ${label}`}
    >
      {label}
    </span>
  );
}

// ─── skeleton cards ───────────────────────────────────────────────────────────

function SkeletonPickCard() {
  return (
    <div className={`${styles.pickCard} ${styles.skeletonCard}`} aria-hidden="true">
      <div className={styles.skeletonMatchup}>
        <span className={`${styles.skeletonLine} ${styles.skLineM}`} />
        <span className={`${styles.skeletonLine} ${styles.skLineM}`} />
      </div>
      <span className={`${styles.skeletonLine} ${styles.skPill}`} />
      <span className={`${styles.skeletonLine} ${styles.skBlock}`} />
    </div>
  );
}

function SkeletonColumn({ section }) {
  const { title, Icon, microcopy } = COLUMN_CONFIG[section];
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>
        <div className={styles.columnHeaderTop}>
          <div className={styles.columnTitleRow}>
            <span className={styles.columnIcon}><Icon /></span>
            <span className={styles.columnTitle}>{title}</span>
          </div>
          <span className={`${styles.columnPill} ${styles.columnPillWarming}`}>WARMING…</span>
        </div>
        <p className={styles.columnMicro}>{microcopy}</p>
      </div>
      <div className={styles.cardList} aria-busy="true">
        <SkeletonPickCard />
        <SkeletonPickCard />
      </div>
    </div>
  );
}

// ─── day chip helper ──────────────────────────────────────────────────────────

function DayChip({ slateDate }) {
  if (!slateDate) return null;
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    let label;
    if (slateDate === todayStr) {
      label = 'Today';
    } else if (slateDate === tomorrowStr) {
      label = 'Tomorrow';
    } else {
      const d = new Date(slateDate + 'T12:00:00');
      label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    return <span className={styles.dayChip}>{label}</span>;
  } catch {
    return null;
  }
}

// ─── watch card (no-edge game — monitoring only) ─────────────────────────────

function WatchCard({ pick, slateDate }) {
  const homeTeamObj = { slug: pick.homeSlug, name: pick.homeTeam };
  const awayTeamObj = { slug: pick.awaySlug, name: pick.awayTeam };

  return (
    <div className={`${styles.pickCard} ${styles.watchCard}`}>
      {/* Day chip + time */}
      <div className={styles.cardMetaRow}>
        <DayChip slateDate={slateDate} />
        {pick.time && <span className={styles.pickTime}>{pick.time}</span>}
      </div>
      {/* Matchup */}
      <div className={styles.cardMatchup}>
        <span className={styles.matchupTeam}>
          <span className={styles.teamLogoWrap}>
            <TeamLogo team={awayTeamObj} size={18} />
          </span>
          <span className={styles.matchupName}>{pick.awayTeam}</span>
        </span>
        <span className={styles.matchupAt}>@</span>
        <span className={styles.matchupTeam}>
          <span className={styles.teamLogoWrap}>
            <TeamLogo team={homeTeamObj} size={18} />
          </span>
          <span className={styles.matchupName}>{pick.homeTeam}</span>
        </span>
      </div>

      {/* Line */}
      <div className={styles.slipRow}>
        <span className={styles.slipLabel}>Line</span>
        <span className={styles.slipLineText}>{pick.pickLine}</span>
      </div>

      {/* Monitoring pill + reason */}
      <div className={styles.cardMain}>
        <span className={styles.monitoringChip}>MONITORING</span>
      </div>
      {pick.watchReason && (
        <p className={styles.watchReason}>{pick.watchReason}</p>
      )}
    </div>
  );
}

// ─── pick card ────────────────────────────────────────────────────────────────

function PickCard({ pick, isTotal, slateDate }) {
  const homeTeamObj = { slug: pick.homeSlug, name: pick.homeTeam };
  const awayTeamObj = { slug: pick.awaySlug, name: pick.awayTeam };
  const isMl = pick.pickType === 'ml';
  const isAts = pick.pickType === 'ats';

  // ATS picks with no resolved spread line get a degraded display
  const spreadUnavailable = isAts && pick.spread == null;

  // Confidence may be capped one tier down when the spread line is missing
  const displayConfidence = spreadUnavailable
    ? Math.max(0, pick.confidence - 1)
    : pick.confidence;

  return (
    <div className={styles.pickCard}>
      {/* Day chip + time */}
      <div className={styles.cardMetaRow}>
        <DayChip slateDate={slateDate} />
        {pick.time && <span className={styles.pickTime}>{pick.time}</span>}
      </div>
      {/* Matchup line with logos */}
      <div className={styles.cardMatchup}>
        <span className={styles.matchupTeam}>
          <span className={styles.teamLogoWrap}>
            <TeamLogo team={awayTeamObj} size={18} />
          </span>
          <span className={styles.matchupName}>{pick.awayTeam}</span>
        </span>
        <span className={styles.matchupAt}>@</span>
        <span className={styles.matchupTeam}>
          <span className={styles.teamLogoWrap}>
            <TeamLogo team={homeTeamObj} size={18} />
          </span>
          <span className={styles.matchupName}>{pick.homeTeam}</span>
        </span>
      </div>

      {/* Bet slip row — exact line to place */}
      <div className={styles.slipRow}>
        <span className={styles.slipLabel}>Slip</span>
        {spreadUnavailable ? (
          <span className={`${styles.slipLineText} ${styles.slipLineUnavailable}`}>
            Line unavailable
          </span>
        ) : (
          <>
            <span className={styles.slipLineText}>{pick.pickLine}</span>
            <CopyButton text={pick.pickLine} />
          </>
        )}
      </div>

      {spreadUnavailable && (
        <p className={styles.unavailableNote}>
          Spread line unavailable. Pick shown for ATS tracking only.
        </p>
      )}

      {/* Primary pick pill + confidence chip + partial badge */}
      <div className={styles.cardMain}>
        <span className={styles.pickPill}>{pick.pickLine}</span>
        <ConfidenceChip level={displayConfidence} />
        {pick.partial && (
          <span className={styles.partialBadge} title="One-team ATS signal — opponent data unavailable">
            PARTIAL SIGNAL
          </span>
        )}
      </div>

      {/* Why value */}
      {pick.whyValue && (
        <p className={styles.whyValue}>{pick.whyValue}</p>
      )}

      {/* Edge breakdown — omit for totals */}
      {!isTotal && (
        <div className={styles.edgeBreakdown}>
          {pick.modelPct != null && (
            <div className={styles.edgeRow}>
              <span className={styles.edgeLabel}>Model</span>
              <span className={styles.edgeValue}>{pick.modelPct}%</span>
            </div>
          )}
          <div className={styles.edgeRow}>
            <span className={styles.edgeLabel}>Market implied</span>
            <span className={styles.edgeValue}>
              {pick.marketImpliedPct != null ? `${pick.marketImpliedPct}%` : '—'}
            </span>
          </div>
          {pick.edgePp != null && (
            <div className={`${styles.edgeRow} ${styles.edgeHighlight}`}>
              <span className={styles.edgeLabel}>{isMl ? 'Value gap' : 'Edge'}</span>
              <span className={styles.edgeValue}>+{pick.edgePp}pp</span>
            </div>
          )}
          {pick.marketImpliedPct != null && (
            <p className={styles.edgeHelper}>Market implied is derived from the current line.</p>
          )}
        </div>
      )}

      {/* ML explainer */}
      {isMl && (
        <p className={styles.mlExplainer}>
          Moneyline price is the payout odds for a straight-up win.
        </p>
      )}

      {/* Rationale bullets */}
      {pick.rationale?.length > 0 && (
        <ul className={styles.rationaleList}>
          {pick.rationale.map((r, i) => (
            <li key={i} className={styles.rationaleItem}>{r}</li>
          ))}
        </ul>
      )}

      {/* Confidence rationale */}
      {pick.confidenceRationale && (
        <p className={styles.confRationale}>{pick.confidenceRationale}</p>
      )}

      {/* Slip tips */}
      {pick.slipTips?.length > 0 && (
        <ul className={styles.slipTipsList}>
          {pick.slipTips.map((tip, i) => (
            <li key={i} className={styles.slipTip}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── slate date helper ────────────────────────────────────────────────────────

function formatSlateDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── column configuration ─────────────────────────────────────────────────────

const COLUMN_CONFIG = {
  ats: {
    title:      'Against the Spread',
    Icon:       IconAts,
    microcopy:  'Leans based on spreads + recent ATS form. Some use partial ATS data when opponent record is unavailable.',
    storageKey: 'homePicksAtsCollapsed',
    isTotal:    false,
  },
  ml: {
    title:      "Pick 'Ems (Moneyline)",
    Icon:       IconMl,
    microcopy:  'Value leans blending ATS form + implied odds.',
    storageKey: 'homePicksMlCollapsed',
    isTotal:    false,
  },
  totals: {
    title:      'Totals (O/U)',
    Icon:       IconTotals,
    microcopy:  'Best numbers available. Informational only.',
    storageKey: 'homePicksTotalsCollapsed',
    isTotal:    true,
  },
};

// ─── pick column ─────────────────────────────────────────────────────────────

function PickColumn({ section, picks, emptyContext, slateDate, slateDateSecondary, slateComplete, hideViewMore }) {
  const { title, Icon, microcopy, storageKey, isTotal } = COLUMN_CONFIG[section];

  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== '1';
    } catch {
      return true;
    }
  });

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem(storageKey, next ? '0' : '1');
    } catch { /* ignore */ }
  };

  const slateDateLabel = formatSlateDate(slateDate);
  const secondaryDateLabel = formatSlateDate(slateDateSecondary);
  const combinedSlateLabel = slateDateLabel && secondaryDateLabel
    ? `${slateDateLabel} + ${secondaryDateLabel}`
    : slateDateLabel;

  // Context-aware empty state — reference the slate date(s) when available
  let emptyReason = 'No qualified leans right now.';
  let emptyDetail = null;
  if (slateComplete && picks.length === 0) {
    emptyReason = 'Today\'s slate is complete.';
    emptyDetail = slateDateLabel
      ? `Picks for ${slateDateLabel} will appear when lines post.`
      : 'Check back when tomorrow\'s lines post.';
  } else if (section === 'ats') {
    const { spreadsCount = 0, atsSlugCount = 0 } = emptyContext ?? {};
    emptyReason = `No ATS leans met${combinedSlateLabel ? ` ${combinedSlateLabel}'s` : ' today\'s'} thresholds.`;
    if (spreadsCount === 0) {
      emptyDetail = 'Waiting for spread lines to post.';
    } else if (atsSlugCount < 5) {
      emptyDetail = 'ATS form available for limited teams right now.';
    } else {
      emptyDetail = 'No edges above thresholds today.';
    }
  } else if (section === 'ml') {
    emptyReason = 'No qualified moneyline leans right now.';
    emptyDetail = `Value gaps haven't met the 4pp threshold${combinedSlateLabel ? ` for ${combinedSlateLabel}` : ''}.`;
  } else {
    emptyReason = `No totals posted${combinedSlateLabel ? ` for ${combinedSlateLabel}` : ''} yet.`;
  }

  return (
    <div className={styles.column}>
      {/* Premium gradient header */}
      <div className={styles.columnHeader}>
        <div className={styles.columnHeaderTop}>
          <div className={styles.columnTitleRow}>
            <span className={styles.columnIcon}><Icon /></span>
            <span className={styles.columnTitle}>{title}</span>
          </div>
          {(() => {
        const leanCount = picks.filter((p) => p.itemType === 'lean').length;
        const watchCount = picks.filter((p) => p.itemType === 'watch').length;
        return leanCount > 0
          ? <span className={styles.columnPill}>DATA-DRIVEN LEANS</span>
          : watchCount > 0
            ? <span className={`${styles.columnPill} ${styles.columnPillWatch}`}>MONITORING</span>
            : null;
      })()}
        </div>
        <p className={styles.columnMicro}>{microcopy}</p>
      </div>

      {/* Mobile-only accordion toggle */}
      <button
        className={styles.accordionToggle}
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
      >
        <span>{expanded ? 'Collapse' : 'Show all picks'}</span>
        <ChevronIcon open={expanded} />
      </button>

      {picks.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyReason}>{emptyReason}</p>
          {emptyDetail && <p className={styles.emptyDetail}>{emptyDetail}</p>}
        </div>
      ) : (
        <div className={`${styles.cardListWrapper} ${!expanded ? styles.cardListWrapperCollapsed : ''}`}>
          <div className={styles.cardList}>
            {picks.map((p) =>
              p.itemType === 'watch'
                ? <WatchCard key={p.key} pick={p} slateDate={slateDate} />
                : <PickCard key={p.key} pick={p} isTotal={isTotal} slateDate={slateDate} />,
            )}
          </div>
        </div>
      )}

      {/* Link to the full Odds Insights page — suppressed when already on that page */}
      {!hideViewMore && (
        <a href="/insights" className={styles.viewMoreLink} aria-label={`View full ${title} board on Odds Insights`}>
          {picks.length > 0 ? 'Full intel on Odds Insights →' : 'View Odds Insights →'}
        </a>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

/**
 * MaximusPicks — deterministic picks derived from data already on the Home page.
 *
 * Props:
 *   games               {Array}        — merged game objects (with odds)
 *   atsLeaders          {Object}       — { best: AtsLeaderRow[], worst: AtsLeaderRow[] }
 *   atsBySlug           {Object|null}  — optional explicit ATS map keyed by team slug
 *   loading             {boolean}      — true while Home is still fetching
 *   slateDate           {string|null}  — ISO date string (YYYY-MM-DD) for the primary slate date
 *   slateDateSecondary  {string|null}  — ISO date string for a secondary slate day (thin-slate combine)
 *   slateComplete       {boolean}      — true when today's games are all final (showing next slate)
 */
export default function MaximusPicks({
  games = [],
  atsLeaders = { best: [], worst: [] },
  atsBySlug = null,
  loading = false,
  slateDate = null,
  slateDateSecondary = null,
  slateComplete = false,
  hideViewMore = false,
}) {
  const { atsPicks, mlPicks, totalsPicks } = useMemo(
    () => buildMaximusPicks({ games, atsLeaders, atsBySlug }),
    [games, atsLeaders, atsBySlug],
  );

  const hasAny = atsPicks.length > 0 || mlPicks.length > 0 || totalsPicks.length > 0;

  // Context for ATS empty state (avoids guessing — uses real data counts)
  const spreadsCount = useMemo(() => games.filter((g) => g.spread != null).length, [games]);
  const atsSlugCount = useMemo(
    () => (atsBySlug ? Object.keys(atsBySlug).length : 0),
    [atsBySlug],
  );
  const emptyContext = { spreadsCount, atsSlugCount };

  const [graceExpired, setGraceExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGraceExpired(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const showSkeleton = loading || (!graceExpired && !hasAny);

  if (showSkeleton) {
    return (
      <>
        <div className={styles.root}>
          <SkeletonColumn section="ats" />
          <SkeletonColumn section="ml" />
          <SkeletonColumn section="totals" />
        </div>
        <p className={styles.disclaimer}>
          For entertainment only. Please bet responsibly. Leans are data-driven, not advice.
        </p>
      </>
    );
  }

  const slateDateLabel = formatSlateDate(slateDate);
  const secondaryDateLabel = formatSlateDate(slateDateSecondary);
  const combinedDateLabel = slateDateLabel && secondaryDateLabel
    ? `${slateDateLabel} + ${secondaryDateLabel}`
    : slateDateLabel;
  const isCombined = !!slateDateSecondary;

  return (
    <>
      {combinedDateLabel && (
        <div className={styles.slateDateBar}>
          <span className={styles.slateDateLabel}>
            {slateComplete ? 'Next Slate' : 'Slate'}
          </span>
          <span className={styles.slateDateValue}>{combinedDateLabel}</span>
          {slateComplete && (
            <span className={styles.slateCompleteNote}>Today complete · next lines pending</span>
          )}
          {isCombined && !slateComplete && (
            <span className={styles.slateCompleteNote}>Thin slate — today + tomorrow combined</span>
          )}
        </div>
      )}
      <div className={styles.root}>
        <PickColumn section="ats"    picks={atsPicks}    emptyContext={emptyContext} slateDate={slateDate} slateDateSecondary={slateDateSecondary} slateComplete={slateComplete} hideViewMore={hideViewMore} />
        <PickColumn section="ml"     picks={mlPicks}     emptyContext={emptyContext} slateDate={slateDate} slateDateSecondary={slateDateSecondary} slateComplete={slateComplete} hideViewMore={hideViewMore} />
        <PickColumn section="totals" picks={totalsPicks} emptyContext={emptyContext} slateDate={slateDate} slateDateSecondary={slateDateSecondary} slateComplete={slateComplete} hideViewMore={hideViewMore} />
      </div>
      <p className={styles.disclaimer}>
        For entertainment only. Please bet responsibly. Leans are data-driven, not advice.
      </p>
    </>
  );
}
