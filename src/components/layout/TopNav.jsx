import { Link, NavLink } from 'react-router-dom';
import styles from './TopNav.module.css';

export default function TopNav() {
  return (
    <header className={styles.topnav}>
      <div className={styles.brand}>
        <Link to="/" className={styles.brandLink} aria-label="Maximus Sports Home">
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} />
        </Link>
        <span className={styles.brandTagline}>March Madness Intelligence</span>
      </div>
      <nav className={styles.nav}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Home
        </NavLink>
        <NavLink to="/games" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Games
        </NavLink>
        <NavLink to="/teams" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Teams
        </NavLink>
        <NavLink to="/insights" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Odds Insights
        </NavLink>
        <NavLink to="/news" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          News Feed
        </NavLink>
      </nav>
    </header>
  );
}
