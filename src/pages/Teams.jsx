import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getTeamsGroupedByConference, TEAMS } from '../data/teams';
import TeamLogo from '../components/shared/TeamLogo';
import ConferenceLogo from '../components/shared/ConferenceLogo';
import Top25Rankings from '../components/home/Top25Rankings';
import styles from './Teams.module.css';

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];
const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

export default function Teams() {
  const [search, setSearch] = useState('');
  const [conferenceFilter, setConferenceFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [expanded, setExpanded] = useState(() => {
    const o = {};
    CONF_ORDER.forEach((c) => { o[c] = true; });
    return o;
  });

  const filteredTeams = useMemo(() => {
    let list = TEAMS;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.conference.toLowerCase().includes(q) ||
          t.oddsTier.toLowerCase().includes(q)
      );
    }
    if (conferenceFilter) {
      list = list.filter((t) => t.conference === conferenceFilter);
    }
    if (tierFilter) {
      list = list.filter((t) => t.oddsTier === tierFilter);
    }
    return list;
  }, [search, conferenceFilter, tierFilter]);

  const grouped = useMemo(() => {
    const byConf = {};
    for (const team of filteredTeams) {
      if (!byConf[team.conference]) byConf[team.conference] = {};
      const tier = team.oddsTier;
      if (!byConf[team.conference][tier]) byConf[team.conference][tier] = [];
      byConf[team.conference][tier].push(team);
    }
    for (const conf of Object.keys(byConf)) {
      for (const tier of TIER_ORDER) {
        if (byConf[conf][tier]) byConf[conf][tier].sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return CONF_ORDER.filter((conf) => byConf[conf] && Object.keys(byConf[conf]).length > 0).map((conf) => ({
      conference: conf,
      tiers: byConf[conf] || {},
    }));
  }, [filteredTeams]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Bubble Watch</h1>
        <p className={styles.subtitle}>ESPN bubble breakdown by conference & odds tier</p>
      </header>

      <section className={styles.top25Section}>
        <Top25Rankings />
      </section>

      <div className={styles.filters}>
        <input
          type="search"
          placeholder="Search teams…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
          aria-label="Search teams"
        />
        <select
          value={conferenceFilter}
          onChange={(e) => setConferenceFilter(e.target.value)}
          className={styles.select}
          aria-label="Filter by conference"
        >
          <option value="">All conferences</option>
          {CONF_ORDER.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className={styles.select}
          aria-label="Filter by tier"
        >
          <option value="">All tiers</option>
          {TIER_ORDER.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className={styles.grid}>
        {grouped.map(({ conference, tiers }) => (
          <section key={conference} className={styles.conferenceSection}>
            <button
              type="button"
              className={styles.conferenceHeader}
              onClick={() => setExpanded((e) => ({ ...e, [conference]: !e[conference] }))}
              aria-expanded={expanded[conference]}
            >
              <span className={styles.conferenceLogoWrap}>
                <ConferenceLogo conference={conference} size={28} />
              </span>
              <span className={styles.conferenceTitle}>{conference}</span>
              <span className={styles.chevron} aria-hidden>{expanded[conference] ? '▾' : '▸'}</span>
            </button>
            {expanded[conference] && (
              <div className={styles.conferenceBody}>
                {TIER_ORDER.map((tier) => {
                  const teams = tiers[tier];
                  if (!teams || teams.length === 0) return null;
                  return (
                    <div key={tier} className={styles.tierBlock}>
                      <span className={styles.tierLabel}>{tier}</span>
                      <ul className={styles.teamList}>
                        {teams.map((team) => (
                          <li key={team.slug}>
                            <Link to={`/teams/${team.slug}`} className={styles.teamRow}>
                              <TeamLogo team={team} size={24} />
                              <span className={styles.teamName}>{team.name}</span>
                              <span className={`${styles.badge} ${TIER_CLASS[tier]}`}>{tier}</span>
                              <span className={styles.chevron}>→</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>

      {grouped.length === 0 && (
        <p className={styles.empty}>No teams match your filters.</p>
      )}
    </div>
  );
}
