/**
 * ProfileAvatar — renders the user's avatar across sidebar, header chip,
 * settings page, and future social surfaces.
 *
 * Always renders the Maximus robot mascot, customized if config is available,
 * otherwise using defaults. Sizes: 'sm' (28px), 'md' (36px), 'lg' (48px)
 */
import RobotAvatar, { DEFAULT_ROBOT_CONFIG } from './RobotAvatar';
import styles from './ProfileAvatar.module.css';

const SIZE_MAP = { sm: 28, md: 36, lg: 48, xl: 72 };

export function VerifiedBadge({ className = '' }) {
  return (
    <svg
      className={`${styles.verifiedBadge} ${className}`}
      width="14" height="14" viewBox="0 0 16 16"
      fill="none" aria-label="Verified Pro account"
    >
      <circle cx="8" cy="8" r="7.5" fill="#1a3f6f" />
      <path d="M5 8.2l2 2 4-4.2" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ProfileAvatar({ username, favoriteNumber, isPro, avatarConfig, size = 'md' }) {
  const px = SIZE_MAP[size] || SIZE_MAP.md;

  const cfg = avatarConfig || {};
  const jerseyNumber = cfg.jerseyNumber || favoriteNumber || '';
  const jerseyColor = cfg.jerseyColor || DEFAULT_ROBOT_CONFIG.jerseyColor;
  const robotColor = cfg.robotColor || DEFAULT_ROBOT_CONFIG.robotColor;

  return (
    <span
      className={`${styles.avatar} ${styles[`size_${size}`]}`}
      style={{ width: px, height: px }}
      aria-label={`${username || 'User'} avatar`}
    >
      <RobotAvatar
        jerseyNumber={jerseyNumber}
        jerseyColor={jerseyColor}
        robotColor={robotColor}
        size={px}
      />
      {isPro && <span className={styles.proBadge}>PRO</span>}
    </span>
  );
}
