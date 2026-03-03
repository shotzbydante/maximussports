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

// ─── pick card ────────────────────────────────────────────────────────────────

function PickCard({ pick, isTotal }) {
  const homeTeamObj = { slug: pick.homeSlug, name: pick.homeTeam };
  const awayTeamObj = { slug: pick.awaySlug, name: pick.awayTeam };

  return (
    <div className={styles.pickCard}>
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
        {pick.time && <span className={styles.pickTime}>{pick.time}</span>}
      </div>

      {/* Primary pick pill + confidence chip */}
      <div className={styles.cardMain}>
        <span className={styles.pickPill}>{pick.pickLine}</span>
        <ConfidenceChip level={pick.confidence} />
      </div>

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
              <span className={styles.edgeLabel}>Edge</span>
              <span className={styles.edgeValue}>+{pick.edgePp}pp</span>
            </div>
          )}
          {pick.marketImpliedPct != null && (
            <p className={styles.edgeHelper}>Market implied is derived from the current line.</p>
          )}
        </div>
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
    </div>
  );
}

// ─── column configuration ─────────────────────────────────────────────────────

const COLUMN_CONFIG = {
  ats: {
    title:       'Against the Spread',
    Icon:        IconAts,
    microcopy:   'Leans based on ATS cover rate differential.',
    storageKey:  'homePicksAtsCollapsed',
    emptyReason: 'No qualified ATS leans right now.',
    emptyDetail: 'Waiting for lines or ATS signals to meet edge thresholds.',
    isTotal:     false,
  },
  ml: {
    title:       "Pick 'Ems (Moneyline)",
    Icon:        IconMl,
    microcopy:   'Value leans blending ATS form + implied odds.',
    storageKey:  'homePicksMlCollapsed',
    emptyReason: 'No qualified moneyline leans right now.',
    emptyDetail: 'Value gaps or implied odds gaps haven\'t met thresholds.',
    isTotal:     false,
  },
  totals: {
    title:       'Totals (O/U)',
    Icon:        IconTotals,
    microcopy:   'Best numbers available. Informational only.',
    storageKey:  'homePicksTotalsCollapsed',
    emptyReason: 'No totals posted yet.',
    emptyDetail: null,
    isTotal:     true,
  },
};

// ─── pick column ─────────────────────────────────────────────────────────────

function PickColumn({ section, picks }) {
  const { title, Icon, microcopy, storageKey, emptyReason, emptyDetail, isTotal } =
    COLUMN_CONFIG[section];

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

  return (
    <div className={styles.column}>
      {/* Premium gradient header */}
      <div className={styles.columnHeader}>
        <div className={styles.columnHeaderTop}>
          <div className={styles.columnTitleRow}>
            <span className={styles.columnIcon}><Icon /></span>
            <span className={styles.columnTitle}>{title}</span>
          </div>
          <span className={styles.columnPill}>DATA-DRIVEN LEANS</span>
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
            {picks.map((p) => (
              <PickCard key={p.key} pick={p} isTotal={isTotal} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

/**
 * MaximusPicks — deterministic picks derived from data already on the Home page.
 *
 * Props:
 *   games        {Array}   — merged game objects (from mergeGamesWithOdds)
 *   atsLeaders   {Object}  — { best: AtsLeaderRow[], worst: AtsLeaderRow[] }
 *   loading      {boolean} — true while Home is still fetching scores or ATS data
 */
export default function MaximusPicks({
  games = [],
  atsLeaders = { best: [], worst: [] },
  loading = false,
}) {
  const { atsPicks, mlPicks, totalsPicks } = useMemo(
    () => buildMaximusPicks({ games, atsLeaders }),
    [games, atsLeaders],
  );

  const hasAny = atsPicks.length > 0 || mlPicks.length > 0 || totalsPicks.length > 0;

  // Grace period: show skeleton for the first 1200ms after mount to avoid flash-of-empty
  // when data arrives slightly after the initial render.
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

  return (
    <>
      <div className={styles.root}>
        <PickColumn section="ats"    picks={atsPicks} />
        <PickColumn section="ml"     picks={mlPicks} />
        <PickColumn section="totals" picks={totalsPicks} />
      </div>
      <p className={styles.disclaimer}>
        For entertainment only. Please bet responsibly. Leans are data-driven, not advice.
      </p>
    </>
  );
}
