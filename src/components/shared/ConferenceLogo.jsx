/**
 * Conference logo — real PNG when available via getConferenceLogo; otherwise initials only (no fake logo).
 */

import { getConferenceLogo } from '../../utils/conferenceLogos';
import styles from './ConferenceLogo.module.css';

function getInitials(conference) {
  if (!conference) return '?';
  if (conference === 'Big Ten') return 'B10';
  if (conference === 'Big 12') return 'B12';
  return conference.slice(0, 1).toUpperCase();
}

export default function ConferenceLogo({ conference, size = 28 }) {
  const logo = getConferenceLogo(conference);
  const initials = getInitials(conference);

  if (!conference) return null;

  if (logo?.src) {
    return (
      <img
        src={logo.src}
        alt={logo.alt}
        width={size}
        height={size}
        className={styles.img}
      />
    );
  }

  return (
    <span className={styles.fallback} style={{ width: size, height: size }} aria-hidden>
      {initials}
    </span>
  );
}
