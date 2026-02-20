import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import Sidebar from './Sidebar';
import styles from './Layout.module.css';

export default function Layout() {
  return (
    <div className={styles.root}>
      <TopNav />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
