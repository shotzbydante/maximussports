import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import Sidebar from './Sidebar';
import Footer from './Footer';
import StickyGuestCTA from '../common/StickyGuestCTA';
import { useAuth } from '../../context/AuthContext';
import { usePinnedTeamsSync } from '../../hooks/usePinnedTeamsSync';
import styles from './Layout.module.css';

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
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <TopNav />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      <Footer />
      {!user && <StickyGuestCTA />}
    </div>
  );
}
