/**
 * HeaderProfileChip — compact profile chip for the top navigation bar.
 * Shows avatar + username with a dropdown for profile/settings/sign-out.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProfileAvatar from './ProfileAvatar';
import styles from './HeaderProfileChip.module.css';

export default function HeaderProfileChip({ profile }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
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

  if (!profile) return null;

  const chipLabel = profile.displayName || profile.username || profile.email?.split('@')[0] || 'Account';

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
        <ProfileAvatar
          username={profile.username}
          favoriteNumber={profile.favoriteNumber}
          isPro={profile.isPro}
          avatarConfig={profile.avatarConfig}
          size="sm"
        />
        <span className={styles.chipName}>{chipLabel}</span>
        <span className={styles.chipCaret} aria-hidden>▾</span>
      </button>

      {open && (
        <div className={styles.dropdown} role="menu">
          <button
            type="button"
            className={styles.dropdownItem}
            role="menuitem"
            onClick={() => { setOpen(false); navigate('/settings'); }}
          >
            <ProfileIcon />
            <span>View Profile</span>
          </button>
          <button
            type="button"
            className={styles.dropdownItem}
            role="menuitem"
            onClick={() => { setOpen(false); navigate('/settings'); }}
          >
            <SettingsIcon />
            <span>Settings</span>
          </button>
          <div className={styles.dropdownDivider} />
          <button
            type="button"
            className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
            role="menuitem"
            onClick={() => { setOpen(false); signOut(); }}
          >
            <SignOutIcon />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}

const ProfileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.5 14c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SignOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M6 8h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
