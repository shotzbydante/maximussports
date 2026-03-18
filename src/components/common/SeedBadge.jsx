import { getTeamRegion } from '../../utils/tournamentHelpers';
import styles from './SeedBadge.module.css';

/**
 * Compact tournament seed badge with region-based coloring.
 * Each bracket region has its own visual identity applied consistently.
 *
 * Props:
 *   seed     – tournament seed number (1–16)
 *   size     – 'sm' | 'md' | 'lg' (default 'sm')
 *   variant  – 'default' | 'gold' | 'slide' (slide = optimized for 1080px exports)
 *   region   – bracket region name (East/West/South/Midwest) — auto-resolved from teamSlug if omitted
 *   teamSlug – team slug for auto-resolving region
 */
export default function SeedBadge({ seed, size = 'sm', variant = 'default', region, teamSlug }) {
  if (seed == null || seed < 1 || seed > 16) return null;

  const resolvedRegion = region || (teamSlug ? getTeamRegion(teamSlug) : null);
  const regionClass = resolvedRegion ? styles[`region${resolvedRegion}`] : '';

  const className = [
    styles.badge,
    styles[size],
    regionClass,
    !regionClass && variant === 'gold' ? styles.gold : '',
    variant === 'slide' ? styles.slide : '',
  ].filter(Boolean).join(' ');

  return (
    <span className={className} title={resolvedRegion ? `${resolvedRegion} Region` : undefined}>
      <span className={styles.hash}>#</span>
      <span className={styles.num}>{seed}</span>
    </span>
  );
}
