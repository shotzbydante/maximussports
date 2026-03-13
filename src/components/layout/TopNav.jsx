import { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlan } from '../../hooks/usePlan';
import { useUserProfile } from '../../hooks/useUserProfile';
import HeaderProfileChip from '../profile/HeaderProfileChip';
import styles from './TopNav.module.css';

/**
 * PlanBadge — shows PRO / FREE / ··· depending on plan state.
 */
function PlanBadge({ tier, isLoading, isSyncing }) {
  const [loadingExpired, setLoadingExpired] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isLoading && !isSyncing) {
      setLoadingExpired(false);
      timerRef.current = setTimeout(() => setLoadingExpired(true), 8_000);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setLoadingExpired(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isLoading, isSyncing]);

  if (isSyncing) {
    return <span className={styles.badgeSyncing} aria-label="Verifying subscription">···</span>;
  }
  if (isLoading && !loadingExpired) {
    return <span className={styles.badgeSyncing} aria-label="Loading plan">···</span>;
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
  { to: '/teams', end: false, label: 'Team Intel Hub' },
  { to: '/insights', end: false, label: 'Odds Insights' },
  { to: '/news', end: false, label: 'News Feed' },
  { to: '/settings', end: false, label: 'Settings', testId: 'nav-settings' },
];

export default function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  const { planTier, isLoading, isSyncing } = usePlan();
  const { profile } = useUserProfile();

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

  const isGuest = !user;

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
      {isGuest
        ? <HeaderProfileChip isGuest />
        : profile && <HeaderProfileChip profile={profile} />
      }
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
