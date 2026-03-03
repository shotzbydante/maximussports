import { useMemo, useState } from 'react';
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
      aria-label={`Confidence: ${label}`}
    >
      {label}
    </span>
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
          <TeamLogo team={awayTeamObj} size={18} />
          <span className={styles.matchupName}>{pick.awayTeam}</span>
        </span>
        <span className={styles.matchupAt}>@</span>
        <span className={styles.matchupTeam}>
          <TeamLogo team={homeTeamObj} size={18} />
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
    title:      'Against the Spread',
    Icon:       IconAts,
    microcopy:  'Leans based on ATS cover rate differential.',
    storageKey: 'homePicksAtsCollapsed',
    emptyReason: 'Not enough ATS data yet.',
    isTotal:    false,
  },
  ml: {
    title:      "Pick 'Ems (Moneyline)",
    Icon:       IconMl,
    microcopy:  'Value leans blending ATS form + implied odds.',
    storageKey: 'homePicksMlCollapsed',
    emptyReason: 'Not enough market data yet.',
    isTotal:    false,
  },
  totals: {
    title:      'Totals (O/U)',
    Icon:       IconTotals,
    microcopy:  'Best numbers available. Informational only.',
    storageKey: 'homePicksTotalsCollapsed',
    emptyReason: 'No totals posted yet.',
    isTotal:    true,
  },
};

// ─── pick column ─────────────────────────────────────────────────────────────

function PickColumn({ section, picks }) {
  const { title, Icon, microcopy, storageKey, emptyReason, isTotal } = COLUMN_CONFIG[section];

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
        <p className={styles.emptyState}>{emptyReason}</p>
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
 *   games        {Array}  — merged game objects (from mergeGamesWithOdds)
 *   atsLeaders   {Object} — { best: AtsLeaderRow[], worst: AtsLeaderRow[] }
 */
export default function MaximusPicks({ games = [], atsLeaders = { best: [], worst: [] } }) {
  const { atsPicks, mlPicks, totalsPicks } = useMemo(
    () => buildMaximusPicks({ games, atsLeaders }),
    [games, atsLeaders],
  );

  const hasAny = atsPicks.length > 0 || mlPicks.length > 0 || totalsPicks.length > 0;

  if (!hasAny && games.length === 0) {
    return (
      <div className={styles.emptyAll}>
        <p>Not enough market data yet. Check back once lines are posted.</p>
      </div>
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
