import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { TEAMS } from '../../data/teams';
import styles from './Sidebar.module.css';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/teams', label: 'Teams', icon: '🏫' },
  { to: '/games', label: 'Games', icon: '🏀' },
  { to: '/insights', label: 'Insights', icon: '📈' },
  { to: '/alerts', label: 'Alerts', icon: '🔔' },
];

export default function Sidebar() {
  const [teamsOpen, setTeamsOpen] = useState(false);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Navigate</span>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <div key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  isActive ? `${styles.link} ${styles.active}` : styles.link
                }
                onClick={() => item.to === '/teams' && setTeamsOpen((o) => !o)}
              >
                <span className={styles.icon}>{item.icon}</span>
                <span>{item.label}</span>
                {item.to === '/teams' && (
                  <span className={styles.caret}>{teamsOpen ? '▼' : '▶'}</span>
                )}
              </NavLink>
              {item.to === '/teams' && teamsOpen && (
                <div className={styles.teamDropdown}>
                  {TEAMS.map((team) => (
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
          ))}
        </nav>
      </div>
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Quick Links</span>
        <div className={styles.quickLinks}>
          <a href="/#matchups" className={styles.quickLink}>Matchups</a>
          <a href="/#odds" className={styles.quickLink}>Odds Movement</a>
          <a href="/#news" className={styles.quickLink}>News Feed</a>
          <a href="/#sentiment" className={styles.quickLink}>Reddit Sentiment</a>
        </div>
      </div>
    </aside>
  );
}
