import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { useAuth } from '../../context/AuthContext';
import { usePinnedTeamsSync } from '../../hooks/usePinnedTeamsSync';
import styles from './Layout.module.css';

export default function Layout() {
  const { user } = useAuth();
  // Sync pinned teams between localStorage and server when authenticated.
  // No-op for anonymous users; never blocks rendering.
  usePinnedTeamsSync(user);

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
    </div>
  );
}
