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

  // Inline styles enforce the size prop regardless of parent container,
  // preventing the `width: 100%; height: 100%` CSS from resolving to the
  // image's natural dimensions (e.g. acc.png is 1024×300) in unconstrained
  // flex/inline-flex ancestors.
  const sizeStyle = { width: size, height: size, minWidth: size, minHeight: size };

  if (logo?.src) {
    return (
      <img
        src={logo.src}
        alt={logo.alt}
        width={size}
        height={size}
        style={sizeStyle}
        className={styles.img}
      />
    );
  }

  return (
    <span className={styles.fallback} style={sizeStyle} aria-hidden>
      {initials}
    </span>
  );
}
