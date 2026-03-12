import { useEffect, useMemo, useState } from 'react';
import { buildMaximusPicks } from '../../utils/maximusPicksModel';
import { getConfidenceLabel } from '../../utils/confidenceSystem';
import TeamLogo from '../shared/TeamLogo';
import styles from './MaximusPicks.module.css';

// ─── inline SVG icons ─────────────────────────────────────────────────────────

function IconPickEm() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <polyline points="4,6.5 6,8.5 9.5,4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function IconAts() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="0.5" y="7.5" width="2.5" height="4.5" rx="1" fill="currentColor" opacity="0.65" />
      <rect x="5" y="4.5" width="2.5" height="7.5" rx="1" fill="currentColor" />
      <rect x="9.5" y="1.5" width="2.5" height="10.5" rx="1" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

function IconValue() {
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
  const label = getConfidenceLabel(level);
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
  const { title, Icon, description } = COLUMN_CONFIG[section];
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>
        <div className={styles.columnTitleRow}>
          <span className={styles.columnIcon}><Icon /></span>
          <span className={styles.columnTitle}>{title}</span>
        </div>
        <p className={styles.columnDesc}>{description}</p>
        <div className={styles.columnDivider} />
      </div>
      <div className={styles.cardList} aria-busy="true">
        <SkeletonPickCard />
        <SkeletonPickCard />
      </div>
    </div>
  );
}

// ─── watch card ───────────────────────────────────────────────────────────────

function WatchCard({ pick, slateDate }) {
  const homeTeamObj = { slug: pick.homeSlug, name: pick.homeTeam };
  const awayTeamObj = { slug: pick.awaySlug, name: pick.awayTeam };

  return (
    <div className={`${styles.pickCard} ${styles.watchCard}`}>
      <div className={styles.cardMetaRow}>
        <DayChip slateDate={slateDate} />
        {pick.time && <span className={styles.pickTime}>{pick.time}</span>}
      </div>
      <div className={styles.cardMatchup}>
        <span className={styles.matchupTeam}>
          <span className={styles.teamLogoWrap}>
            <TeamLogo team={awayTeamObj} size={20} />
          </span>
          <span className={styles.matchupName}>{pick.awayTeam}</span>
        </span>
        <span className={styles.matchupAt}>@</span>
        <span className={styles.matchupTeam}>
          <span className={styles.teamLogoWrap}>
            <TeamLogo team={homeTeamObj} size={20} />
          </span>
          <span className={styles.matchupName}>{pick.homeTeam}</span>
        </span>
      </div>
      <div className={styles.cardMain}>
        <span className={styles.monitoringChip}>MONITORING</span>
      </div>
      {pick.watchReason && (
        <p className={styles.watchReason}>{pick.watchReason}</p>
      )}
    </div>
  );
}

// ─── game card ────────────────────────────────────────────────────────────────

function GameCard({ pick, slateDate }) {
  const homeTeamObj = { slug: pick.homeSlug, name: pick.homeTeam };
  const awayTeamObj = { slug: pick.awaySlug, name: pick.awayTeam };
  const isTot = pick.pickType === 'total';
  const pickTeamSlug = pick.pickTeam === pick.homeTeam ? pick.homeSlug : pick.awaySlug;
  const pickTeamObj = pick.pickTeam ? { slug: pickTeamSlug, name: pick.pickTeam } : null;
  const opponentObj = pick.opponentTeam
    ? { slug: pick.opponentSlug, name: pick.opponentTeam }
    : null;

  return (
    <div className={styles.pickCard}>
      <div className={styles.cardMetaRow}>
        <DayChip slateDate={slateDate} />
        {pick.time && <span className={styles.pickTime}>{pick.time}</span>}
      </div>

      <div className={styles.cardRecommendation}>
        {!isTot && pickTeamObj && (
          <span className={styles.teamLogoWrap}>
            <TeamLogo team={pickTeamObj} size={20} />
          </span>
        )}
        <span className={styles.pickPill}>{pick.pickLine}</span>
        <ConfidenceChip level={pick.confidence} />
        {pick.partial && (
          <span className={styles.partialBadge} title="One-team ATS signal — opponent data unavailable">
            PARTIAL
          </span>
        )}
      </div>

      {!isTot && opponentObj && (
        <div className={styles.cardOpponent}>
          <span className={styles.vsTag}>vs</span>
          <span className={styles.teamLogoWrap}>
            <TeamLogo team={opponentObj} size={18} />
          </span>
          <span className={styles.opponentName}>{pick.opponentTeam}</span>
        </div>
      )}

      {isTot && (
        <div className={styles.cardMatchup}>
          <span className={styles.matchupTeam}>
            <span className={styles.teamLogoWrap}>
              <TeamLogo team={awayTeamObj} size={20} />
            </span>
            <span className={styles.matchupName}>{pick.awayTeam}</span>
          </span>
          <span className={styles.matchupAt}>vs</span>
          <span className={styles.matchupTeam}>
            <span className={styles.teamLogoWrap}>
              <TeamLogo team={homeTeamObj} size={20} />
            </span>
            <span className={styles.matchupName}>{pick.homeTeam}</span>
          </span>
        </div>
      )}

      {pick.signals?.length > 0 && (
        <div className={styles.signalPanel}>
          <span className={styles.signalLabel}>Signals</span>
          <ul className={styles.signalList}>
            {pick.signals.map((s, i) => (
              <li key={i} className={styles.signalItem}>{s}</li>
            ))}
          </ul>
        </div>
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
  pickem: {
    title:       "PICK 'EMS",
    Icon:        IconPickEm,
    description: 'Predicting straight-up winners based on rankings, odds, recent form, and strength of schedule.',
    storageKey:  'homePicksPickEmCollapsed',
  },
  ats: {
    title:       'AGAINST THE SPREAD',
    Icon:        IconAts,
    description: 'ATS recommendations evaluate spread performance, line movement, and matchup efficiency.',
    storageKey:  'homePicksAtsCollapsed',
  },
  value: {
    title:       'VALUE LEANS',
    Icon:        IconValue,
    description: 'Value Leans highlight situations where market pricing may underestimate a team.',
    storageKey:  'homePicksValueCollapsed',
  },
  totals: {
    title:       'GAME TOTALS',
    Icon:        IconTotals,
    description: 'Game Total leans evaluate how teams historically perform relative to betting totals.',
    storageKey:  'homePicksTotalsCollapsed',
  },
};

// ─── pick column ─────────────────────────────────────────────────────────────

function PickColumn({ section, picks, slateDate, slateDateSecondary, slateComplete, hideViewMore }) {
  const { title, Icon, description, storageKey } = COLUMN_CONFIG[section];

  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(storageKey) !== '1'; } catch { return true; }
  });

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(storageKey, next ? '0' : '1'); } catch { /* ignore */ }
  };

  const slateDateLabel = formatSlateDate(slateDate);
  const leanCount = picks.filter((p) => p.itemType === 'lean').length;
  const watchCount = picks.filter((p) => p.itemType === 'watch').length;

  let emptyReason = 'No qualified leans right now.';
  if (slateComplete && picks.length === 0) {
    emptyReason = "Today's slate is complete. Check back when next lines post.";
  }

  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>
        <div className={styles.columnTitleRow}>
          <span className={styles.columnIcon}><Icon /></span>
          <span className={styles.columnTitle}>{title}</span>
          {leanCount > 0 && (
            <span className={styles.columnCount}>{leanCount}</span>
          )}
        </div>
        <p className={styles.columnDesc}>{description}</p>
        <div className={styles.columnDivider} />
      </div>

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
        </div>
      ) : (
        <div className={`${styles.cardListWrapper} ${!expanded ? styles.cardListWrapperCollapsed : ''}`}>
          <div className={styles.cardList}>
            {picks.map((p) =>
              p.itemType === 'watch'
                ? <WatchCard key={p.key} pick={p} slateDate={slateDate} />
                : <GameCard key={p.key} pick={p} slateDate={slateDate} />,
            )}
          </div>
        </div>
      )}

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
 * MaximusPicks — 4-column analytics dashboard for game recommendations.
 *
 * Props:
 *   games               {Array}        — merged game objects (with odds)
 *   atsLeaders          {Object}       — { best: AtsLeaderRow[], worst: AtsLeaderRow[] }
 *   atsBySlug           {Object|null}  — optional explicit ATS map keyed by team slug
 *   rankMap             {Object}       — slug→AP rank (from rankings/rankingsTop25)
 *   championshipOdds    {Object}       — slug→{american,...} championship winner odds
 *   loading             {boolean}      — true while Home is still fetching
 *   slateDate           {string|null}  — ISO date string (YYYY-MM-DD) for the primary slate date
 *   slateDateSecondary  {string|null}  — ISO date string for a secondary slate day
 *   slateComplete       {boolean}      — true when today's games are all final
 *   hideViewMore        {boolean}      — suppress "View Odds Insights" link
 */
export default function MaximusPicks({
  games = [],
  atsLeaders = { best: [], worst: [] },
  atsBySlug = null,
  rankMap = {},
  championshipOdds = {},
  loading = false,
  slateDate = null,
  slateDateSecondary = null,
  slateComplete = false,
  hideViewMore = false,
}) {
  const { pickEmPicks, atsPicks, valuePicks, totalsPicks } = useMemo(
    () => buildMaximusPicks({ games, atsLeaders, atsBySlug, rankMap, championshipOdds }),
    [games, atsLeaders, atsBySlug, rankMap, championshipOdds],
  );

  const hasAny = pickEmPicks.length > 0 || atsPicks.length > 0 || valuePicks.length > 0 || totalsPicks.length > 0;

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
          <SkeletonColumn section="pickem" />
          <SkeletonColumn section="ats" />
          <SkeletonColumn section="value" />
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
        <PickColumn section="pickem"  picks={pickEmPicks}  slateDate={slateDate} slateDateSecondary={slateDateSecondary} slateComplete={slateComplete} hideViewMore={hideViewMore} />
        <PickColumn section="ats"     picks={atsPicks}     slateDate={slateDate} slateDateSecondary={slateDateSecondary} slateComplete={slateComplete} hideViewMore={hideViewMore} />
        <PickColumn section="value"   picks={valuePicks}   slateDate={slateDate} slateDateSecondary={slateDateSecondary} slateComplete={slateComplete} hideViewMore={hideViewMore} />
        <PickColumn section="totals"  picks={totalsPicks}  slateDate={slateDate} slateDateSecondary={slateDateSecondary} slateComplete={slateComplete} hideViewMore={hideViewMore} />
      </div>
      <p className={styles.disclaimer}>
        For entertainment only. Please bet responsibly. Leans are data-driven, not advice.
      </p>
    </>
  );
}
