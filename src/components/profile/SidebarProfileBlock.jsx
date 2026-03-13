/**
 * SidebarProfileBlock — compact profile identity module docked at the
 * bottom of the left sidebar. Shows avatar, username, handle, and plan badge.
 * Clicking navigates to /settings.
 */
import { useNavigate } from 'react-router-dom';
import ProfileAvatar from './ProfileAvatar';
import styles from './SidebarProfileBlock.module.css';

export default function SidebarProfileBlock({ profile }) {
  const navigate = useNavigate();

  if (!profile) return null;

  const displayName = profile.displayName || profile.username || profile.email?.split('@')[0] || 'User';
  const handle = profile.handle || (profile.username ? `@${profile.username}` : profile.email || '');

  return (
    <button
      type="button"
      className={styles.block}
      onClick={() => navigate('/settings')}
      aria-label="Go to profile settings"
    >
      <div className={styles.identity}>
        <ProfileAvatar
          username={profile.username}
          favoriteNumber={profile.favoriteNumber}
          isPro={false}
          avatarConfig={profile.avatarConfig}
          size="sm"
        />
        <div className={styles.names}>
          <span className={styles.username}>{displayName}</span>
          <span className={styles.handle}>{handle}</span>
        </div>
        {profile.isPro && <span className={styles.planPill}>PRO</span>}
      </div>
    </button>
  );
}
