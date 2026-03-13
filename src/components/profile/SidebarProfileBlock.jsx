/**
 * SidebarProfileBlock — compact profile identity module placed at the top
 * of the left sidebar. Shows avatar, username, handle, and greyed-out
 * social counts. Clicking navigates to /settings.
 */
import { useNavigate } from 'react-router-dom';
import ProfileAvatar from './ProfileAvatar';
import styles from './SidebarProfileBlock.module.css';

export default function SidebarProfileBlock({ profile }) {
  const navigate = useNavigate();

  if (!profile || !profile.username) return null;

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
          isPro={profile.isPro}
          size="md"
        />
        <div className={styles.names}>
          <span className={styles.username}>{profile.displayName || profile.username}</span>
          <span className={styles.handle}>{profile.handle}</span>
        </div>
      </div>

      <div className={styles.socialRow} title="Social features coming soon">
        <span className={styles.socialStat}>
          <span className={styles.socialCount}>0</span>
          <span className={styles.socialLabel}>Followers</span>
        </span>
        <span className={styles.socialDot}>·</span>
        <span className={styles.socialStat}>
          <span className={styles.socialCount}>0</span>
          <span className={styles.socialLabel}>Following</span>
        </span>
      </div>
    </button>
  );
}
