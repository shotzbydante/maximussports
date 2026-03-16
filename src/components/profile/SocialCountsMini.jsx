/**
 * SocialCountsMini — compact inline social counts display
 * for sidebar and header account surfaces.
 *
 * Renders: "0 Followers · 0 Following"
 * Clicking a count opens the follower/following list dropdown.
 */
import { useState, lazy, Suspense } from 'react';
import styles from './SocialCountsMini.module.css';

const SocialListDropdown = lazy(() => import('./SocialListDropdown'));

export default function SocialCountsMini({ following = 0, followers = 0 }) {
  const [openList, setOpenList] = useState(null);

  return (
    <>
      <span className={styles.counts}>
        <button type="button" className={styles.statBtn} onClick={() => setOpenList('followers')}>
          <span className={styles.value}>{followers}</span>
          <span className={styles.label}>Followers</span>
        </button>
        <span className={styles.dot}>·</span>
        <button type="button" className={styles.statBtn} onClick={() => setOpenList('following')}>
          <span className={styles.value}>{following}</span>
          <span className={styles.label}>Following</span>
        </button>
      </span>
      {openList && (
        <Suspense fallback={null}>
          <SocialListDropdown type={openList} onClose={() => setOpenList(null)} />
        </Suspense>
      )}
    </>
  );
}
