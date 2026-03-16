/**
 * SidebarProfileBlock — profile identity module docked at the bottom
 * of the left sidebar. Shows avatar, username, handle, and plan badge.
 * Clicking opens a context menu with profile actions (same as top-nav chip).
 * For guest users, shows default mascot with CTA menu.
 *
 * SocialCountsMini is rendered OUTSIDE the block button to avoid
 * nested-button HTML invalidity and click propagation conflicts.
 */
import { useState, useEffect, useRef } from 'react';
import ProfileAvatar, { VerifiedBadge } from './ProfileAvatar';
import ProfileMenu from './ProfileMenu';
import SocialCountsMini from './SocialCountsMini';
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
    : (profile?.username || profile?.displayName || '');

  const handle = isGuest
    ? 'Create your profile'
    : (profile?.handle || '');

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

      {!isGuest && profile?.social && (
        <div className={styles.socialRow}>
          <SocialCountsMini
            following={profile.social.following}
            followers={profile.social.followers}
            onBeforeOpen={() => setOpen(false)}
          />
        </div>
      )}

      <ProfileMenu open={open} onClose={() => setOpen(false)} position="top-left" />
    </div>
  );
}
