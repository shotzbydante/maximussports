/**
 * ProfileMenu — shared dropdown menu for profile interactions.
 * Used by both HeaderProfileChip and SidebarProfileBlock to ensure
 * consistent design language and behavior across authenticated/guest states.
 */
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './ProfileMenu.module.css';

export default function ProfileMenu({ open, onClose, position = 'bottom-right' }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!open) return null;

  const posClass = position === 'top-left' ? styles.posTopLeft : styles.posBottomRight;

  if (!user) {
    return (
      <div className={`${styles.menu} ${posClass}`} role="menu">
        <div className={styles.guestHeader}>
          <span className={styles.guestTitle}>Welcome to Maximus Sports</span>
          <span className={styles.guestSub}>Create an account to personalize your experience</span>
        </div>
        <div className={styles.menuDivider} />
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemPrimary}`}
          role="menuitem"
          onClick={() => { onClose(); navigate('/settings'); }}
        >
          <CreateAccountIcon />
          <span>Create Account</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          role="menuitem"
          onClick={() => { onClose(); navigate('/settings'); }}
        >
          <SignInIcon />
          <span>Sign In</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.menu} ${posClass}`} role="menu">
      <button
        type="button"
        className={styles.menuItem}
        role="menuitem"
        onClick={() => { onClose(); navigate('/settings'); }}
      >
        <ProfileIcon />
        <span>View Profile</span>
      </button>
      <button
        type="button"
        className={styles.menuItem}
        role="menuitem"
        onClick={() => { onClose(); navigate('/settings'); }}
      >
        <SettingsIcon />
        <span>Settings</span>
      </button>
      <div className={styles.menuDivider} />
      <button
        type="button"
        className={`${styles.menuItem} ${styles.menuItemDanger}`}
        role="menuitem"
        onClick={() => { onClose(); signOut(); }}
      >
        <SignOutIcon />
        <span>Sign Out</span>
      </button>
    </div>
  );
}

const ProfileIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.5 14c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SignOutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M6 8h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CreateAccountIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.5 14c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M13 3v4M11 5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SignInIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M10 2h3a1 1 0 011 1v10a1 1 0 01-1 1h-3M7 11l-3-3 3-3M4 8h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
