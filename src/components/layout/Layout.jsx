import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import Sidebar from './Sidebar';
import Footer from './Footer';
import StickyGuestCTA from '../common/StickyGuestCTA';
import AskLauncher from '../ask/AskLauncher';
import { useAuth } from '../../context/AuthContext';
import { usePinnedTeamsSync } from '../../hooks/usePinnedTeamsSync';
import styles from './Layout.module.css';

/** Public-facing routes that use the dark theme for guests. */
const PUBLIC_DARK_ROUTES = new Set(['/settings', '/privacy', '/terms', '/contact']);

export default function Layout() {
  const { user } = useAuth();
  // Sync pinned teams between localStorage and server when authenticated.
  // No-op for anonymous users; never blocks rendering.
  usePinnedTeamsSync(user);

  // Guests on the root route get the standalone marketing landing page,
  // which renders its own header and footer — skip the app chrome.
  const { pathname } = useLocation();
  if (!user && pathname === '/') {
    return (
      <div className={styles.root}>
        <Outlet />
        <AskLauncher />
      </div>
    );
  }

  // Guests see the public pages (sign-in, privacy, terms, contact) in the dark theme.
  const isDarkPage = !user && PUBLIC_DARK_ROUTES.has(pathname.replace(/\/$/, '') || '/');

  return (
    <div className={styles.root}>
      <TopNav />
      <div className={styles.body}>
        <Sidebar />
        <main
          className={styles.main}
          data-theme={isDarkPage ? 'dark' : undefined}
        >
          <Outlet />
          {pathname !== '/' && (
            <img
              src={isDarkPage ? '/brand/watermark-white.png' : '/brand/watermark-navy.png'}
              alt=""
              aria-hidden="true"
              className={styles.endMark}
              width={700}
              height={325}
              loading="lazy"
              decoding="async"
            />
          )}
        </main>
      </div>
      <Footer />
      {!user && <StickyGuestCTA />}
      <AskLauncher />
    </div>
  );
}
