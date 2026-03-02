import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import styles from './TopNav.module.css';

const NAV_LINKS = [
  { to: '/', end: true, label: 'Home' },
  { to: '/games', end: false, label: 'Games' },
  { to: '/teams', end: false, label: 'Teams' },
  { to: '/insights', end: false, label: 'Odds Insights' },
  { to: '/news', end: false, label: 'News Feed' },
  { to: '/settings', end: false, label: 'Settings', testId: 'nav-settings' },
];

export default function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('click', close);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header className={styles.topnav}>
      <div className={styles.brand}>
        <Link to="/" className={styles.brandLink} aria-label="Maximus Sports Home">
          <img
          src="/maximus-logo.png"
          alt="Maximus Sports"
          className={styles.brandLogo}
          onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }}
        />
        </Link>
        <span className={styles.brandTagline}>Maximum Sports. Maximum Intelligence.</span>
      </div>
      <button
        type="button"
        className={styles.hamburger}
        onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
        aria-expanded={menuOpen}
        aria-label="Open menu"
      >
        <span className={styles.hamburgerBar} />
        <span className={styles.hamburgerBar} />
        <span className={styles.hamburgerBar} />
      </button>
      <nav className={styles.nav} aria-hidden={menuOpen ? false : undefined}>
        {NAV_LINKS.map(({ to, end, label, testId }) => (
          <span key={to} className={styles.navItem}>
            {end ? (
              <NavLink to={to} end data-testid={testId} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)} onClick={() => setMenuOpen(false)}>
                {label}
              </NavLink>
            ) : (
              <NavLink to={to} data-testid={testId} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)} onClick={() => setMenuOpen(false)}>
                {label}
              </NavLink>
            )}
          </span>
        ))}
      </nav>
      {menuOpen && (
        <div className={styles.navOverlay} aria-hidden>
          <nav className={styles.navDropdown} onClick={(e) => e.stopPropagation()}>
            {NAV_LINKS.map(({ to, end, label, testId }) => (
              <span key={to} className={styles.navDropdownItem}>
                {end ? (
                  <NavLink to={to} end data-testid={testId} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)} onClick={() => setMenuOpen(false)}>
                    {label}
                  </NavLink>
                ) : (
                  <NavLink to={to} data-testid={testId} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)} onClick={() => setMenuOpen(false)}>
                    {label}
                  </NavLink>
                )}
              </span>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
