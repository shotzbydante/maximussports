/**
 * SocialCountsMini — compact inline social counts display
 * for sidebar and header account surfaces.
 *
 * Renders: "0 Following · 0 Followers"
 * Consistent with the Settings page identity model.
 */
import styles from './SocialCountsMini.module.css';

export default function SocialCountsMini({ following = 0, followers = 0 }) {
  return (
    <span className={styles.counts}>
      <span className={styles.stat}>
        <span className={styles.value}>{followers}</span>
        <span className={styles.label}>Followers</span>
      </span>
      <span className={styles.dot}>·</span>
      <span className={styles.stat}>
        <span className={styles.value}>{following}</span>
        <span className={styles.label}>Following</span>
      </span>
    </span>
  );
}
