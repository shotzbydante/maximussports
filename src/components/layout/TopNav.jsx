import { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { usePlan } from '../../hooks/usePlan';
import styles from './TopNav.module.css';

/**
 * PlanBadge — shows PRO / FREE / ··· depending on plan state.
 *
 * Rules:
 *  • isSyncing=true  → always shows ··· (no timeout — we have evidence of Pro)
 *  • isLoading=true  → shows ··· for up to 8s, then shows resolved tier
 *  • both false      → shows PRO or FREE based on tier
 *
 * FREE is never shown while syncing — only when confirmed free.
 */
function PlanBadge({ tier, isLoading, isSyncing }) {
  // Only apply a timeout for pure loading state (no syncing evidence).
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

  // Always syncing pill when evidence exists — no timeout fallback to FREE.
  if (isSyncing) {
    return (
      <span className={styles.badgeSyncing} aria-label="Verifying subscription">
        ···
      </span>
    );
  }

  // Show syncing pill during initial load unless timeout expired.
  if (isLoading && !loadingExpired) {
    return (
      <span className={styles.badgeSyncing} aria-label="Loading plan">
        ···
      </span>
    );
  }

  // Confirmed state — show PRO or FREE.
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
  { to: '/teams', end: false, label: 'Team Intel' },
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
