import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getTeamsGroupedByConference } from '../../data/teams';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [expandedConfs, setExpandedConfs] = useState({});
  const grouped = getTeamsGroupedByConference();

  const toggleConf = (conf) => {
    setExpandedConfs((prev) => ({ ...prev, [conf]: !prev[conf] }));
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Navigate</span>
        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            <span className={styles.icon}>🏠</span>
            <span>Home</span>
          </NavLink>
          <NavLink
            to="/games"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            <span className={styles.icon}>🏀</span>
            <span>Games</span>
          </NavLink>
          <div className={styles.teamsBlock}>
            <div className={styles.teamsRow}>
              <NavLink
                to="/teams"
                end
                className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
              >
                <span className={styles.icon}>🏫</span>
                <span>Teams</span>
              </NavLink>
              <button
                type="button"
                className={styles.caretBtn}
                onClick={(e) => { e.preventDefault(); setTeamsOpen((o) => !o); }}
                aria-expanded={teamsOpen}
                aria-label={teamsOpen ? 'Collapse conferences' : 'Expand conferences'}
              >
                <span className={styles.caret} aria-hidden>{teamsOpen ? '▾' : '▸'}</span>
              </button>
            </div>
            {teamsOpen && (
              <div className={styles.teamDropdown}>
                {grouped.map(({ conference, tiers }) => {
                  const teams = Object.values(tiers).flat();
                  const confExpanded = expandedConfs[conference];
                  return (
                    <div key={conference} className={styles.confGroup}>
                      <button
                        type="button"
                        className={styles.confRow}
                        onClick={() => toggleConf(conference)}
                        aria-expanded={confExpanded}
                      >
                        <span className={styles.confLabel}>{conference}</span>
                        <span className={styles.caret} aria-hidden>{confExpanded ? '▾' : '▸'}</span>
                      </button>
                      {confExpanded && (
                        <div className={styles.teamLinks}>
                          {teams.map((team) => (
                            <NavLink
                              key={team.slug}
                              to={`/teams/${team.slug}`}
                              className={({ isActive }) =>
                                isActive ? `${styles.teamLink} ${styles.teamLinkActive}` : styles.teamLink
                              }
                            >
                              {team.name}
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <NavLink
            to="/insights"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            <span className={styles.icon}>📈</span>
            <span>Odds Insights</span>
          </NavLink>
          <NavLink
            to="/news"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            <span className={styles.icon}>📰</span>
            <span>News Feed</span>
          </NavLink>
        </nav>
      </div>
    </aside>
  );
}
