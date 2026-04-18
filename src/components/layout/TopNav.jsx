import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlan } from '../../hooks/usePlan';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import HeaderProfileChip from '../profile/HeaderProfileChip';
import WorkspaceLogo from './WorkspaceLogo';
import styles from './TopNav.module.css';

const NavHomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <path d="M2 7L8 2l6 5v7h-4v-4H6v4H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);
const NavBriefingIcon = () => (
  // Briefing card — bordered rect with a filled header bar and 2 content lines.
  // Reads as "editorial summary / overview", not "checklist".
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <rect x="2.5" y="2.75" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.5 6.25 H 13.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="5" y1="9.25" x2="11" y2="9.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <line x1="5" y1="11.5" x2="9" y2="11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
const NavGamesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4.5 11c.6-1.2 1.8-2.5 3.5-2.5S11 9.8 11.5 11M4.5 5c.6 1.2 1.8 2.5 3.5 2.5S11 6.2 11.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const NavTeamsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <path d="M3.5 2.5L1 5l2 1v7h10V6l2-1-2.5-2.5c-.8.8-1.6 1.2-2.5 1.2S5.3 3.3 4.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M5.5 2.8L8 5l2.5-2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const NavTrendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <polyline points="2,11 5.5,7 8.5,9 14,4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="10,4 14,4 14,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const NavNewsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const NavDashboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9" y="2" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9" y="7" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const NavBracketIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <path d="M2 3h4v2H2zM2 7h4v2H2zM10 3h4v2h-4zM10 7h4v2h-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M6 4h1.5v4H6M10 4H8.5M6 8h1.5v0M8 6v5M6 11h4v2H6z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const NavSettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICON_COMPONENTS = {
  home: NavHomeIcon,
  briefing: NavBriefingIcon,
  games: NavGamesIcon,
  teams: NavTeamsIcon,
  insights: NavTrendIcon,
  news: NavNewsIcon,
  dashboard: NavDashboardIcon,
  bracketology: NavBracketIcon,
  settings: NavSettingsIcon,
};

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

export default function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  const { planTier, isLoading, isSyncing } = usePlan();
  const { profile } = useUserProfile();
  const { workspace, workspaceId, visibleWorkspaces, switchWorkspace, buildPath, hasCapability } = useWorkspace();

  const showWorkspaceSwitcher = visibleWorkspaces.length > 1;

  const NAV_LINKS = useMemo(() => {
    const links = [
      { to: '/', end: true, label: 'Home', iconKey: 'home', isAppHome: true },
      { to: buildPath('/'), end: true, label: `${workspace.shortLabel} Briefing`, iconKey: 'briefing', isWorkspaceHome: true },
      { to: buildPath('/games'), end: false, label: workspace.labels.games, iconKey: 'games' },
      { to: buildPath('/teams'), end: false, label: workspace.labels.teamIntel, iconKey: 'teams' },
      { to: buildPath('/insights'), end: false, label: workspace.labels.picks, iconKey: 'insights' },
      { to: buildPath('/news'), end: false, label: workspace.labels.news, iconKey: 'news' },
    ];
    if (hasCapability('seasonIntel')) {
      links.push({ to: buildPath('/season-model'), end: false, label: 'Season Intelligence', iconKey: 'insights' });
    }
    if (hasCapability('bracketology')) {
      links.push({ to: '/bracketology', end: false, label: 'Bracketology', isBracketology: true, iconKey: 'bracketology' });
    }
    // Account-section items rendered after the workspace group.
    links.push(
      { to: '/dashboard', end: false, label: 'Dashboard', isDashboard: true, iconKey: 'dashboard', isAccount: true },
    );
    links.push({ to: '/settings', end: false, label: 'Settings', testId: 'nav-settings', iconKey: 'settings', isAccount: true });
    return links;
  }, [workspace, buildPath, hasCapability]);

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

  // 3-group IA: app-level → workspace-level → account-level.
  // Same source of truth feeds desktop top-nav and mobile drawer.
  const appHomeLinks = NAV_LINKS.filter((l) => l.isAppHome);
  const workspaceLinks = NAV_LINKS.filter((l) => !l.isAppHome && !l.isAccount);
  const accountLinks = NAV_LINKS.filter((l) => l.isAccount);

  return (
    <header className={styles.topnav}>
      <div className={styles.brand}>
        <Link to="/" className={styles.brandLink} aria-label="Maximus Sports Home">
          <img src="/mascot.png" alt="" className={styles.brandMascot} width={36} height={36} />
          <span className={styles.brandWordmark}>
            <span className={styles.brandWordmarkMain}>MAXIMUS</span>
            <span className={styles.brandWordmarkSub}>SPORTS</span>
          </span>
        </Link>
        <div className={styles.brandTaglineCluster}>
          <span className={styles.brandTagline}>Maximum Sports. Maximum Intelligence.</span>
          <PlanBadge tier={planTier} isLoading={isLoading} isSyncing={isSyncing} />
          {showWorkspaceSwitcher && (
            <span className={styles.workspaceBadge} aria-label={`Workspace: ${workspace.shortLabel}`}>
              <WorkspaceLogo workspace={workspace} size={14} /> {workspace.shortLabel}
            </span>
          )}
        </div>
      </div>
      <nav className={styles.nav} aria-hidden={menuOpen ? false : undefined}>
        {[appHomeLinks, workspaceLinks, accountLinks].map((group, gi) => (
          <span key={gi} className={styles.navGroup}>
            {gi > 0 && <span className={styles.navDivider} aria-hidden />}
            {group.map(({ to, end, label, testId, isBracketology, isWorkspaceHome }) => {
              const linkCls = ({ isActive }) =>
                `${styles.link}${isBracketology ? ` ${styles.bracketLink}` : ''}${isWorkspaceHome ? ` ${styles.workspaceHomeLink}` : ''}${isActive ? ` ${styles.active}` : ''}`;
              return (
                <span key={to} className={styles.navItem}>
                  {end ? (
                    <NavLink to={to} end data-testid={testId} className={linkCls} onClick={() => setMenuOpen(false)}>
                      {label}
                    </NavLink>
                  ) : (
                    <NavLink to={to} data-testid={testId} className={linkCls} onClick={() => setMenuOpen(false)}>
                      {label}
                    </NavLink>
                  )}
                </span>
              );
            })}
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
            {/* ─── App layer ─── */}
            {/* "MAXIMUS" header signals app-level destination, parallel to the
                "WORKSPACE" header below — gives mobile drawer a clear 3-layer IA. */}
            <div className={styles.mobileAppHome}>
              <span className={styles.mobileGroupHeader}>Maximus</span>
              {appHomeLinks.map(({ to, label, iconKey }) => {
                const IconComp = ICON_COMPONENTS[iconKey] || null;
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end
                    className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
                    onClick={() => setMenuOpen(false)}
                  >
                    {IconComp && <span className={styles.navDropdownIcon}><IconComp /></span>}
                    <span>{label}</span>
                  </NavLink>
                );
              })}
            </div>
            {/* ─── Workspace layer ─── */}
            {showWorkspaceSwitcher && (
              <div className={styles.mobileWsSwitcher}>
                <span className={styles.mobileGroupHeader}>Workspace</span>
                <div className={styles.mobileWsOptions}>
                  {visibleWorkspaces.map((ws) => (
                    <button
                      key={ws.id}
                      type="button"
                      className={`${styles.mobileWsOption} ${ws.id === workspaceId ? styles.mobileWsOptionActive : ''}`}
                      onClick={() => {
                        switchWorkspace(ws.id);
                        setMenuOpen(false);
                      }}
                    >
                      <span className={styles.mobileWsEmoji}><WorkspaceLogo workspace={ws} size={20} /></span>
                      <span className={styles.mobileWsLabel}>{ws.shortLabel}</span>
                      {!ws.access.public && <span className={styles.mobileWsSandbox}>SANDBOX</span>}
                      {ws.id === workspaceId && <span className={styles.mobileWsCheck}><CheckIcon /></span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Workspace-scoped pages: Briefing (workspace home, primary state), Games, Team Intel, etc. */}
            {workspaceLinks.map(({ to, end, label, testId, isBracketology, isWorkspaceHome, iconKey }) => {
              const IconComp = ICON_COMPONENTS[iconKey] || null;
              const linkCls = ({ isActive }) =>
                `${styles.link}${isBracketology ? ` ${styles.bracketLink}` : ''}${isWorkspaceHome ? ` ${styles.workspaceHomeLink}` : ''}${isActive ? ` ${styles.active}` : ''}`;
              return (
                <span key={to} className={styles.navDropdownItem}>
                  {end ? (
                    <NavLink to={to} end data-testid={testId} className={linkCls} onClick={() => setMenuOpen(false)}>
                      {IconComp && <span className={styles.navDropdownIcon}><IconComp /></span>}
                      <span>{label}</span>
                    </NavLink>
                  ) : (
                    <NavLink to={to} data-testid={testId} className={linkCls} onClick={() => setMenuOpen(false)}>
                      {IconComp && <span className={styles.navDropdownIcon}><IconComp /></span>}
                      <span>{label}</span>
                      {isBracketology && <span className={styles.navDropdownBadgeNew}>NEW</span>}
                    </NavLink>
                  )}
                </span>
              );
            })}
            {/* ─── Account layer ─── */}
            {accountLinks.length > 0 && (
              <div className={styles.mobileAccountSection}>
                {accountLinks.map(({ to, label, testId, isDashboard, iconKey }) => {
                  const IconComp = ICON_COMPONENTS[iconKey] || null;
                  return (
                    <span key={to} className={styles.navDropdownItem}>
                      <NavLink to={to} data-testid={testId} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)} onClick={() => setMenuOpen(false)}>
                        {IconComp && <span className={styles.navDropdownIcon}><IconComp /></span>}
                        <span>{label}</span>
                        {isDashboard && <span className={styles.navDropdownBadgeAdmin}>ADMIN</span>}
                      </NavLink>
                    </span>
                  );
                })}
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
