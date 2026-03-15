/**
 * SocialCountsMini — compact inline follower/following display
 * for sidebar and header account surfaces.
 *
 * Renders: "12 Following · 9 Followers"
 */
import styles from './SocialCountsMini.module.css';

export default function SocialCountsMini({ following = 0, followers = 0 }) {
  return (
    <span className={styles.counts}>
      <span className={styles.value}>{following}</span>
      <span className={styles.label}> Following</span>
      <span className={styles.dot}> · </span>
      <span className={styles.value}>{followers}</span>
      <span className={styles.label}> Follower{followers !== 1 ? 's' : ''}</span>
    </span>
  );
}
