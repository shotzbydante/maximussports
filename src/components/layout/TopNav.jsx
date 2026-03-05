import { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { usePlan } from '../../hooks/usePlan';
import styles from './TopNav.module.css';

/**
 * PlanBadge — shows PRO / FREE / SYNCING depending on plan state.
 *
 * Loading/syncing shows a neutral "···" pill for up to 10s, then falls
 * back to FREE if the plan is still unresolved. This prevents Pro users
 * from seeing a false FREE flash during initial fetch or webhook lag.
 */
function PlanBadge({ tier, isLoading, isSyncing }) {
  // Countdown: show neutral pill for up to 10s before falling back to FREE.
  const [fallbackActive, setFallbackActive] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isLoading || isSyncing) {
      setFallbackActive(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFallbackActive(true), 10_000);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setFallbackActive(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isLoading, isSyncing]);

  const showNeutral = (isLoading || isSyncing) && !fallbackActive;

  if (showNeutral) {
    return (
      <span className={styles.badgeSyncing} aria-label="Verifying subscription">
        ···
      </span>
    );
  }

  const resolved = tier ?? 'free';
  return (
    <span
      className={resolved === 'pro' ? styles.badgePro : styles.badgeFree}
      aria-label={`Plan: ${resolved.toUpperCase()}`}
    >
      {resolved === 'pro' ? 'PRO' : 'FREE'}
    </span>
  );
}

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
  const { planTier, isLoading, isSyncing } = usePlan();

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
        <div className={styles.brandTaglineCluster}>
          <span className={styles.brandTagline}>Maximum Sports. Maximum Intelligence.</span>
          <PlanBadge tier={planTier} isLoading={isLoading} isSyncing={isSyncing} />
        </div>
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
