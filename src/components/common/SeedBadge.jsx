import styles from './SeedBadge.module.css';

/**
 * Compact tournament seed badge for March Madness teams.
 * Only renders when seed is a valid number. Premium dark-theme aesthetic.
 *
 * Props:
 *   seed     – tournament seed number (1–16)
 *   size     – 'sm' | 'md' | 'lg' (default 'sm')
 *   variant  – 'default' | 'gold' | 'slide' (slide = optimized for 1080px exports)
 */
export default function SeedBadge({ seed, size = 'sm', variant = 'default' }) {
  if (seed == null || seed < 1 || seed > 16) return null;

  const className = [
    styles.badge,
    styles[size],
    variant === 'gold' ? styles.gold : '',
    variant === 'slide' ? styles.slide : '',
  ].filter(Boolean).join(' ');

  return (
    <span className={className}>
      <span className={styles.hash}>#</span>
      <span className={styles.num}>{seed}</span>
    </span>
  );
}
