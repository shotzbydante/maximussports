import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TEAMS } from '../../data/teams';
import TeamLogo from '../shared/TeamLogo';
import styles from './RankingsTable.module.css';

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];

const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

export default function RankingsTable() {
  const [conference, setConference] = useState('All');
  const [tier, setTier] = useState('All');

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
    list.sort((a, b) => {
      const ac = confOrder.indexOf(a.conference);
      const bc = confOrder.indexOf(b.conference);
      if (ac !== bc) return ac - bc;
      const at = tierOrder.indexOf(a.oddsTier);
      const bt = tierOrder.indexOf(b.oddsTier);
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [conference, tier]);

  return (
    <div className={styles.table}>
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
            {filtered.map((team) => (
              <tr key={team.slug}>
                <td className={styles.colTeam}>
                  <Link to={`/teams/${team.slug}`} className={styles.teamLink}>
                    <TeamLogo team={team} size={22} />
                    <span>{team.name}</span>
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
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.count}>{filtered.length} teams</div>
    </div>
  );
}
