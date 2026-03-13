/**
 * SidebarProfileBlock — profile identity module docked at the bottom
 * of the left sidebar. Shows avatar, username, handle, and plan badge.
 * Clicking opens a context menu with profile actions (same as top-nav chip).
 * For guest users, shows default mascot with CTA menu.
 */
import { useState, useEffect, useRef } from 'react';
import ProfileAvatar, { VerifiedBadge } from './ProfileAvatar';
import ProfileMenu from './ProfileMenu';
import styles from './SidebarProfileBlock.module.css';

export default function SidebarProfileBlock({ profile, isGuest = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const displayName = isGuest
    ? 'Guest'
    : (profile?.displayName || profile?.username || profile?.email?.split('@')[0] || 'User');

  const handle = isGuest
    ? 'Create your profile'
    : (profile?.handle || (profile?.username ? `@${profile.username}` : profile?.email || ''));

  const isPro = !isGuest && profile?.isPro;

  return (
    <div className={styles.blockWrap} ref={ref}>
      <button
        type="button"
        className={styles.block}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={isGuest ? 'Account menu' : 'Profile menu'}
      >
        <div className={styles.identity}>
          <span className={styles.avatarWrap}>
            <ProfileAvatar
              username={isGuest ? '' : profile?.username}
              favoriteNumber={isGuest ? '' : profile?.favoriteNumber}
              isPro={isPro}
              avatarConfig={isGuest ? null : profile?.avatarConfig}
              size="lg"
            />
          </span>
          <div className={styles.names}>
            <span className={styles.username}>
              {displayName}
              {isPro && <VerifiedBadge className={styles.verifiedInline} />}
            </span>
            <span className={styles.handle}>{handle}</span>
          </div>
          {isPro && <span className={styles.planPill}>PRO</span>}
          <span className={styles.menuDots} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="4" cy="8" r="1.2" fill="currentColor" />
              <circle cx="8" cy="8" r="1.2" fill="currentColor" />
              <circle cx="12" cy="8" r="1.2" fill="currentColor" />
            </svg>
          </span>
        </div>
      </button>

      <ProfileMenu open={open} onClose={() => setOpen(false)} position="top-left" />
    </div>
  );
}
