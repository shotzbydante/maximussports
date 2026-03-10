/**
 * Conference logo — real PNG when available via getConferenceLogo;
 * otherwise initials only (no fake logo).
 *
 * Includes onError fallback + crossOrigin for safe html-to-image export.
 */

import { useState } from 'react';
import { getConferenceLogo } from '../../utils/conferenceLogos';
import styles from './ConferenceLogo.module.css';

function getInitials(conference) {
  if (!conference) return '?';
  if (conference === 'Big Ten') return 'B10';
  if (conference === 'Big 12') return 'B12';
  return conference.slice(0, 1).toUpperCase();
}

export default function ConferenceLogo({ conference, size = 28 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const logo = getConferenceLogo(conference);
  const initials = getInitials(conference);

  if (!conference) return null;

  const sizeStyle = { width: size, height: size, minWidth: size, minHeight: size };

  if (logo?.src && !imgFailed) {
    return (
      <img
        src={logo.src}
        alt={logo.alt}
        width={size}
        height={size}
        style={sizeStyle}
        className={styles.img}
        crossOrigin="anonymous"
        data-fallback-text={initials}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span className={styles.fallback} style={sizeStyle} aria-hidden>
      {initials}
    </span>
  );
}
