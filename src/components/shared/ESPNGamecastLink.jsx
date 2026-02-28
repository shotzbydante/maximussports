/**
 * ESPNGamecastLink — reusable outbound link to the ESPN Gamecast page.
 *
 * Uses resolveGamecastUrl() to prefer ESPN-provided links[] when present,
 * falling back to a constructed URL from game.gameId.
 *
 * Renders: [ESPN badge SVG] Gamecast ↗
 * Opens in a new tab, meets minimum mobile tap target.
 * No network requests — the SVG badge is fully inline.
 */

import { resolveGamecastUrl } from '../../utils/espnGamecast';
import styles from './ESPNGamecastLink.module.css';

/** Inline ESPN-style badge (red rectangle, white text). No external request. */
function ESPNBadge() {
  return (
    <svg
      width="32"
      height="13"
      viewBox="0 0 32 13"
      fill="none"
      aria-hidden
      focusable="false"
      className={styles.espnBadge}
    >
      <rect width="32" height="13" rx="2" fill="#CC0000" />
      <text
        x="16"
        y="9.5"
        textAnchor="middle"
        fill="white"
        fontSize="8"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="bold"
        letterSpacing="0.4"
      >
        ESPN
      </text>
    </svg>
  );
}

/**
 * @param {{ gameId?: string|number, links?: object[] }} game - Any game-like object with gameId.
 * @param {string} [className] - Optional extra class on the root element.
 */
export function ESPNGamecastLink({ game, className }) {
  const url = resolveGamecastUrl(game);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.link} ${className || ''}`}
      aria-label="ESPN Gamecast (opens in new tab)"
    >
      <ESPNBadge />
      <span className={styles.label}>Gamecast</span>
      <span className={styles.arrow} aria-hidden>↗</span>
    </a>
  );
}
