import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TEAMS } from '../../data/teams';
import { getTeamSlug } from '../../utils/teamSlug';
import { getSlugFromRankingsName } from '../../utils/rankingsNormalize';
import TeamLogo from '../shared/TeamLogo';
import ChampionshipBadge from '../shared/ChampionshipBadge';
import styles from './RankingsTable.module.css';

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

export default function RankingsTable({ rankings: rankingsProp, title, championshipOdds = {}, championshipOddsLoading = false }) {
  const [conference, setConference] = useState('All');
  const [tier, setTier] = useState('All');
  const [sortBy, setSortBy] = useState('default');

  const slugToRank = useMemo(() => buildSlugToRank(rankingsProp ?? []), [rankingsProp]);
  const hasTop25 = (rankingsProp?.length ?? 0) > 0;

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
    } else {
      list.sort(defaultSort);
    }
    return list;
  }, [conference, tier, sortBy, hasTop25, slugToRank]);

  return (
    <div className={styles.table}>
      {title && <h2 className={styles.sectionTitle}>{title}</h2>}
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
        {hasTop25 && (
          <label className={styles.filterLabel}>
            <span className={styles.labelText}>Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={styles.select}
            >
              <option value="default">Default</option>
              <option value="top25">Top 25</option>
            </select>
          </label>
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
            {filtered.map((team) => {
              const rank = slugToRank[team.slug];
              return (
                <tr key={team.slug}>
                  <td className={styles.colTeam}>
                    <Link to={`/teams/${team.slug}`} className={styles.teamLink}>
                      <TeamLogo team={team} size={22} />
                      <span>{team.name}</span>
                      {rank != null && (
                        <span className={styles.top25Badge} title="AP Top 25">
                          #{rank}
                        </span>
                      )}
                      <ChampionshipBadge slug={team.slug} oddsMap={championshipOdds} loading={championshipOddsLoading} />
                      <span className={styles.chevron}>→</span>
                    </Link>
                  </td>
                  <td className={styles.colConf}>{team.conference}</td>
                  <td className={styles.colTier}>
                    <span className={`${styles.badge} ${TIER_CLASS[team.oddsTier] || ''}`}>
                      {team.oddsTier}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.count}>{filtered.length} teams</div>
    </div>
  );
}
