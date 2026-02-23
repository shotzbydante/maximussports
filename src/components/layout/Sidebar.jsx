import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getTeamsGroupedByConference } from '../../data/teams';
import styles from './Sidebar.module.css';

const mainNav = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/games', label: 'Games', icon: '🏀' },
  { to: '/insights', label: 'Odds Insights', icon: '📈' },
  { to: '/news', label: 'News Feed', icon: '📰' },
];

export default function Sidebar() {
  const [teamsOpen, setTeamsOpen] = useState(false);
  const grouped = getTeamsGroupedByConference();

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
          <div>
            <button
              type="button"
              className={`${styles.link} ${teamsOpen ? styles.expanded : ''}`}
              onClick={() => setTeamsOpen((o) => !o)}
              aria-expanded={teamsOpen}
            >
              <span className={styles.icon}>🏫</span>
              <span>Teams</span>
              <span className={styles.caret} aria-hidden>{teamsOpen ? '▾' : '▸'}</span>
            </button>
            {teamsOpen && (
              <div className={styles.teamDropdown}>
                {grouped.map(({ conference, tiers }) => (
                  <div key={conference} className={styles.confGroup}>
                    <span className={styles.confLabel}>{conference}</span>
                    <div className={styles.teamLinks}>
                      {Object.values(tiers).flat().map((team) => (
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
                  </div>
                ))}
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
