import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/teams', label: 'Teams', icon: '🏫' },
  { to: '/games', label: 'Games', icon: '🏀' },
  { to: '/insights', label: 'Insights', icon: '📈' },
  { to: '/alerts', label: 'Alerts', icon: '🔔' },
];

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Navigate</span>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              <span className={styles.icon}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Quick Links</span>
        <div className={styles.quickLinks}>
          <a href="#upsets" className={styles.quickLink}>Upset Watch</a>
          <a href="#odds" className={styles.quickLink}>Odds Movement</a>
          <a href="#news" className={styles.quickLink}>News Feed</a>
          <a href="#sentiment" className={styles.quickLink}>Reddit Sentiment</a>
        </div>
      </div>
    </aside>
  );
}
