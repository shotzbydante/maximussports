/**
 * ProfileAvatar — renders the user's avatar across sidebar, header chip,
 * settings page, and future social surfaces.
 *
 * If the user has a robot avatar config, renders the customized RobotAvatar.
 * Otherwise falls back to the jersey-based SVG with number/initial.
 *
 * Sizes: 'sm' (28px), 'md' (36px), 'lg' (48px)
 */
import RobotAvatar from './RobotAvatar';
import styles from './ProfileAvatar.module.css';

const SIZE_MAP = { sm: 28, md: 36, lg: 48 };

export default function ProfileAvatar({ username, favoriteNumber, isPro, avatarConfig, size = 'md' }) {
  const px = SIZE_MAP[size] || SIZE_MAP.md;

  if (avatarConfig && avatarConfig.type === 'maximus_robot') {
    return (
      <span
        className={`${styles.avatar} ${styles[`size_${size}`]}`}
        style={{ width: px, height: px }}
        aria-label={`${username || 'User'} robot avatar`}
      >
        <RobotAvatar
          jerseyNumber={avatarConfig.jerseyNumber || favoriteNumber || ''}
          jerseyColor={avatarConfig.jerseyColor}
          robotColor={avatarConfig.robotColor}
          size={px}
        />
        {isPro && <span className={styles.proBadge}>PRO</span>}
      </span>
    );
  }

  const displayNum = favoriteNumber ?? '—';
  const initial = username ? username[0].toUpperCase() : '?';

  return (
    <span
      className={`${styles.avatar} ${styles[`size_${size}`]}`}
      style={{ width: px, height: px }}
      aria-label={favoriteNumber ? `Jersey #${favoriteNumber}` : `${username || 'User'} avatar`}
    >
      <svg
        viewBox="0 0 80 64"
        className={styles.jerseySvg}
        aria-hidden
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 2 L5 18 L14 22 L14 62 L66 62 L66 22 L75 18 L60 2 L50 8 C48 12 32 12 30 8 Z"
          fill="var(--color-primary)"
          stroke="var(--color-primary-hover)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <text
          x="40"
          y="40"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={displayNum === '—' ? '18' : displayNum.length > 1 ? '18' : '22'}
          fontWeight="800"
          fontFamily="var(--font-display), sans-serif"
          fill="white"
          letterSpacing="0"
        >
          {displayNum === '—' ? initial : displayNum}
        </text>
      </svg>
      {isPro && <span className={styles.proBadge}>PRO</span>}
    </span>
  );
}
