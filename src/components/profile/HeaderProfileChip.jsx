/**
 * HeaderProfileChip — profile chip for the top navigation bar.
 * Shows avatar + username with a dropdown for profile actions.
 * For guest users, shows the default mascot with a CTA menu.
 */
import { useState, useEffect, useRef } from 'react';
import ProfileAvatar, { VerifiedBadge } from './ProfileAvatar';
import ProfileMenu from './ProfileMenu';
import SocialCountsMini from './SocialCountsMini';
import styles from './HeaderProfileChip.module.css';

export default function HeaderProfileChip({ profile, isGuest = false }) {
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

  const chipLabel = isGuest
    ? 'Sign up'
    : (profile?.displayName || profile?.username || profile?.email?.split('@')[0] || 'Account');

  const isPro = !isGuest && profile?.isPro;

  return (
    <div className={styles.chipWrap} ref={ref}>
      <button
        type="button"
        className={styles.chip}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Profile menu"
      >
        <span className={styles.avatarWrap}>
          <ProfileAvatar
            username={isGuest ? '' : profile?.username}
            favoriteNumber={isGuest ? '' : profile?.favoriteNumber}
            isPro={isPro}
            avatarConfig={isGuest ? null : profile?.avatarConfig}
            size="md"
          />
        </span>
        <span className={styles.chipName}>{chipLabel}</span>
        {isPro && <VerifiedBadge />}
        {!isGuest && profile?.social && (
          <span className={styles.chipCounts}>
            <SocialCountsMini following={profile.social.following} followers={profile.social.followers} />
          </span>
        )}
        <span className={styles.chipCaret} aria-hidden>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <ProfileMenu open={open} onClose={() => setOpen(false)} position="bottom-right" />
    </div>
  );
}
