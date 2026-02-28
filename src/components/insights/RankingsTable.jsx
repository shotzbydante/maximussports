import { useState, useId, useMemo, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { TEAMS } from '../../data/teams';
import { getTeamSlug } from '../../utils/teamSlug';
import { getSlugFromRankingsName } from '../../utils/rankingsNormalize';
import TeamLogo from '../shared/TeamLogo';
import ChampionshipBadge from '../shared/ChampionshipBadge';
import styles from './RankingsTable.module.css';

function ChevronIcon({ className }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className={className}>
      <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];

const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

/** Build slug -> rank map from rankings array ({ rank, teamName }[]). */
function buildSlugToRank(rankings) {
  if (!Array.isArray(rankings) || rankings.length === 0) return {};
  const map = {};
  for (const r of rankings) {
    const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, TEAMS);
    if (slug != null && r.rank != null) map[slug] = r.rank;
  }
  return map;
}

/** American odds → implied probability (higher = better chance to win). */
function impliedProbFromAmerican(american) {
  if (american == null || typeof american !== 'number') return null;
  if (american < 0) return (-american) / ((-american) + 100);
  return 100 / (american + 100);
}

/**
 * @param {string}  [props.badge]    - Optional tag shown next to the title (e.g. "Deep Dive").
 * @param {number}  [props.capRows]  - Max rows to show before "View more". No cap when omitted.
 */
export default function RankingsTable({ rankings: rankingsProp, title, collapsible = false, championshipOdds = {}, championshipOddsLoading = false, championshipOddsMeta = null, badge, capRows, defaultSortBy = 'default' }) {
  const [conference, setConference] = useState('All');
  const [tier, setTier] = useState('All');
  const [sortBy, setSortBy] = useState(defaultSortBy);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showingAll, setShowingAll] = useState(false);
  const contentId = useId();

  const slugToRank = useMemo(() => buildSlugToRank(rankingsProp ?? []), [rankingsProp]);
  const hasTop25 = (rankingsProp?.length ?? 0) > 0;

  // Reset showingAll when filters/sort change so cap always applies to fresh results
  // (useMemo dep change re-derives filtered, we don't auto-reset — intentional:
  //  user who expanded expects filter changes to show filtered results in full)

  const filtered = useMemo(() => {
    let list = [...TEAMS];
    if (conference !== 'All') {
      list = list.filter((t) => t.conference === conference);
    }
    if (tier !== 'All') {
      list = list.filter((t) => t.oddsTier === tier);
    }
    const confOrder = conference === 'All' ? CONF_ORDER : [conference];
    const tierOrder = tier === 'All' ? TIER_ORDER : [tier];
    const defaultSort = (a, b) => {
      const ac = confOrder.indexOf(a.conference);
      const bc = confOrder.indexOf(b.conference);
      if (ac !== bc) return ac - bc;
      const at = tierOrder.indexOf(a.oddsTier);
      const bt = tierOrder.indexOf(b.oddsTier);
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    };
    if (sortBy === 'top25' && hasTop25 && Object.keys(slugToRank).length > 0) {
      list.sort((a, b) => {
        const aRank = slugToRank[a.slug];
        const bRank = slugToRank[b.slug];
        const aIn = aRank != null;
        const bIn = bRank != null;
        if (aIn && !bIn) return -1;
        if (!aIn && bIn) return 1;
        if (aIn && bIn) return aRank - bRank;
        return defaultSort(a, b);
      });
    } else if (sortBy === 'championship') {
      list.sort((a, b) => {
        const aEntry = championshipOdds[a.slug];
        const bEntry = championshipOdds[b.slug];
        const aAmerican = aEntry?.bestChanceAmerican ?? aEntry?.american;
        const bAmerican = bEntry?.bestChanceAmerican ?? bEntry?.american;
        const aProb = aAmerican != null ? impliedProbFromAmerican(aAmerican) : null;
        const bProb = bAmerican != null ? impliedProbFromAmerican(bAmerican) : null;
        const aHas = aProb != null;
        const bHas = bProb != null;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        if (!aHas && !bHas) return defaultSort(a, b);
        return bProb - aProb;
      });
    } else {
      list.sort(defaultSort);
    }
    return list;
  }, [conference, tier, sortBy, hasTop25, slugToRank, championshipOdds]);

  // Apply row cap when set and user hasn't expanded yet
  const visibleTeams = capRows != null && !showingAll ? filtered.slice(0, capRows) : filtered;
  const hiddenTeamCount = capRows != null && !showingAll ? Math.max(0, filtered.length - capRows) : 0;

  return (
    <div className={styles.table}>
      {/* Header — doubles as collapse toggle when collapsible=true */}
      {title && (
        collapsible ? (
          <div className={styles.toggleHeader}>
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={() => setIsExpanded((v) => !v)}
              aria-expanded={isExpanded}
              aria-controls={contentId}
            >
              <div className={styles.toggleTitleRow}>
                <h2 className={styles.sectionTitle}>{title}</h2>
                {badge && <span className={styles.moduleTag}>{badge}</span>}
              </div>
              <div className={styles.toggleMeta}>
                {!isExpanded && (
                  <span className={styles.collapsedCount}>{filtered.length} teams</span>
                )}
                <ChevronIcon className={`${styles.chevronIcon} ${isExpanded ? styles.chevronOpen : ''}`} />
              </div>
            </button>
          </div>
        ) : (
          <div className={styles.staticTitleRow}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            {badge && <span className={styles.moduleTag}>{badge}</span>}
          </div>
        )
      )}

      {/* Collapsible body */}
      <div
        id={contentId}
        className={styles.collapsibleBody}
        hidden={collapsible && !isExpanded}
      >
        <div className={styles.filters}>
          <label className={styles.filterLabel}>
            <span className={styles.labelText}>Conference</span>
            <select
              value={conference}
              onChange={(e) => setConference(e.target.value)}
              className={styles.select}
            >
              <option value="All">All</option>
              {CONF_ORDER.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterLabel}>
            <span className={styles.labelText}>Tier</span>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className={styles.select}
            >
              <option value="All">All</option>
              {TIER_ORDER.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterLabel}>
            <span className={styles.labelText}>Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={styles.select}
            >
              <option value="default">Default</option>
              {hasTop25 && <option value="top25">Top 25</option>}
              <option value="championship">Championship Odds</option>
            </select>
          </label>
          {sortBy === 'championship' && championshipOddsLoading && (
            <span className={styles.sortHint}>Loading odds…</span>
          )}
        </div>

        <div className={styles.wrapper}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={styles.colTeam}>Team</th>
                <th className={styles.colConf}>Conference</th>
                <th className={styles.colTier}>Tier</th>
              </tr>
            </thead>
            <tbody>
              {visibleTeams.map((team, idx) => {
                const rank = slugToRank[team.slug];
                const isNew = showingAll && capRows != null && idx >= capRows;
                // Insert a divider row when we cross from ranked to unranked (visible in expanded view)
                const prevTeam = idx > 0 ? visibleTeams[idx - 1] : null;
                const prevRank = prevTeam ? slugToRank[prevTeam.slug] : null;
                const showDivider = showingAll && prevRank != null && rank == null;
                return (
                  <Fragment key={team.slug}>
                    {showDivider && (
                      <tr className={styles.sectionDividerRow}>
                        <td colSpan={3} className={styles.sectionDividerCell}>
                          Remaining Teams
                        </td>
                      </tr>
                    )}
                    <tr className={[isNew ? styles.trNew : '', rank != null ? styles.trRanked : ''].filter(Boolean).join(' ') || undefined}>
                      <td className={styles.colTeam}>
                        <Link to={`/teams/${team.slug}`} className={styles.teamLink}>
                          <TeamLogo team={team} size={22} />
                          <span>{team.name}</span>
                          {rank != null && (
                            <span className={styles.top25Badge} title="AP Top 25">
                              #{rank}
                            </span>
                          )}
                          <ChampionshipBadge slug={team.slug} oddsMap={championshipOdds} oddsMeta={championshipOddsMeta} loading={championshipOddsLoading} />
                          <span className={styles.rowChevron}>→</span>
                        </Link>
                      </td>
                      <td className={styles.colConf}>{team.conference}</td>
                      <td className={styles.colTier}>
                        <span className={`${styles.badge} ${TIER_CLASS[team.oddsTier] || ''}`}>
                          {team.oddsTier}
                        </span>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* View more / show less / count row */}
        {hiddenTeamCount > 0 ? (
          <div className={styles.viewMoreRow}>
            <button
              type="button"
              className={styles.viewMoreBtn}
              onClick={() => setShowingAll(true)}
            >
              View {hiddenTeamCount} more team{hiddenTeamCount !== 1 ? 's' : ''} →
            </button>
          </div>
        ) : showingAll && capRows != null ? (
          <div className={styles.viewMoreRow}>
            <button
              type="button"
              className={styles.viewMoreBtn}
              onClick={() => setShowingAll(false)}
            >
              Show less
            </button>
          </div>
        ) : (
          <div className={styles.count}>{filtered.length} teams</div>
        )}
      </div>
    </div>
  );
}
