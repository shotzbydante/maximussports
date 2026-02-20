import { NavLink } from 'react-router-dom';
import styles from './TopNav.module.css';

export default function TopNav() {
  return (
    <header className={styles.topnav}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>🏀</span>
        <span className={styles.brandText}>Maximus Sports</span>
        <span className={styles.brandTagline}>March Madness Intelligence</span>
      </div>
      <nav className={styles.nav}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Home
        </NavLink>
        <NavLink to="/teams" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Teams
        </NavLink>
        <NavLink to="/games" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Games
        </NavLink>
        <NavLink to="/insights" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Insights
        </NavLink>
        <NavLink to="/alerts" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Alerts
        </NavLink>
      </nav>
    </header>
  );
}
