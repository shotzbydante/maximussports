import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getTeamsGroupedByConference } from '../../data/teams';
import { useAuth } from '../../context/AuthContext';
import { isAdminUser } from '../../config/admin';
import { useUserProfile } from '../../hooks/useUserProfile';
import SidebarProfileBlock from '../profile/SidebarProfileBlock';
import styles from './Sidebar.module.css';

/* ─── Inline SVG icon set (16×16, 1.5px stroke, no fill) ─────────────────── */
const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <path d="M2 7L8 2l6 5v7h-4v-4H6v4H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);
const GamesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4.5 11c.6-1.2 1.8-2.5 3.5-2.5S11 9.8 11.5 11M4.5 5c.6 1.2 1.8 2.5 3.5 2.5S11 6.2 11.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const TeamsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    {/* Jersey body */}
    <path d="M3.5 2.5L1 5l2 1v7h10V6l2-1-2.5-2.5c-.8.8-1.6 1.2-2.5 1.2S5.3 3.3 4.5 2.5z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    {/* Collar V */}
    <path d="M5.5 2.8L8 5l2.5-2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const TrendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <polyline points="2,11 5.5,7 8.5,9 14,4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="10,4 14,4 14,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const NewsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const DashboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9" y="2" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9" y="7" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export default function Sidebar() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const isAdmin = isAdminUser(user?.email);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [expandedConfs, setExpandedConfs] = useState({});
  const grouped = getTeamsGroupedByConference();

  const toggleConf = (conf) => {
    setExpandedConfs((prev) => ({ ...prev, [conf]: !prev[conf] }));
  };

  return (
    <aside className={styles.sidebar}>
      {profile?.username && (
        <>
          <SidebarProfileBlock profile={profile} />
          <div className={styles.profileDivider} />
        </>
      )}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Navigate</span>
        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            <span className={styles.icon}><HomeIcon /></span>
            <span>Home</span>
          </NavLink>
          <NavLink
            to="/games"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            <span className={styles.icon}><GamesIcon /></span>
            <span>Games</span>
          </NavLink>
          <div className={styles.teamsBlock}>
            <div className={styles.teamsRow}>
              <NavLink
                to="/teams"
                end
                className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
              >
                <span className={styles.icon}><TeamsIcon /></span>
                <span>Team Intel Hub</span>
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
            <span className={styles.icon}><TrendIcon /></span>
            <span>Odds Insights</span>
          </NavLink>
          <NavLink
            to="/news"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            <span className={styles.icon}><NewsIcon /></span>
            <span>News Feed</span>
          </NavLink>
          <NavLink
            to="/settings"
            data-testid="nav-settings"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            <span className={styles.icon}><SettingsIcon /></span>
            <span>Settings</span>
          </NavLink>
          {isAdmin && (
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `${styles.link} ${styles.adminLink}${isActive ? ` ${styles.active}` : ''}`
              }
            >
              <span className={styles.icon}><DashboardIcon /></span>
              <span>Dashboard</span>
              <span className={styles.adminBadge}>ADMIN</span>
            </NavLink>
          )}
        </nav>
      </div>
    </aside>
  );
}
