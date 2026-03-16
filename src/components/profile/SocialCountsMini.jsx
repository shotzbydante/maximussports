/**
 * SocialCountsMini — compact inline social counts display
 * for sidebar and header account surfaces.
 *
 * Renders: "0 Followers · 0 Following"
 * Clicking a count opens the follower/following list modal.
 *
 * Stops event propagation so clicks do not toggle the parent
 * ProfileMenu (HeaderProfileChip / SidebarProfileBlock).
 * SocialListDropdown renders via its own portal to escape stacking contexts.
 */
import { useState, useCallback, lazy, Suspense } from 'react';
import styles from './SocialCountsMini.module.css';

const SocialListDropdown = lazy(() => import('./SocialListDropdown'));

export default function SocialCountsMini({ following = 0, followers = 0, onBeforeOpen }) {
  const [openList, setOpenList] = useState(null);

  const handleOpen = useCallback((type, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onBeforeOpen) onBeforeOpen();
    setOpenList(type);
  }, [onBeforeOpen]);

  const handleClose = useCallback(() => {
    setOpenList(null);
  }, []);

  return (
    <>
      <span className={styles.counts} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.statBtn} onClick={(e) => handleOpen('followers', e)}>
          <span className={styles.value}>{followers}</span>
          <span className={styles.label}>Followers</span>
        </button>
        <span className={styles.dot}>·</span>
        <button type="button" className={styles.statBtn} onClick={(e) => handleOpen('following', e)}>
          <span className={styles.value}>{following}</span>
          <span className={styles.label}>Following</span>
        </button>
      </span>
      {openList && (
        <Suspense fallback={null}>
          <SocialListDropdown type={openList} onClose={handleClose} />
        </Suspense>
      )}
    </>
  );
}
