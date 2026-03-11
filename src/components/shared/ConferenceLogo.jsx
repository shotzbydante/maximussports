/**
 * Conference logo — real PNG when available via getConferenceLogo;
 * otherwise initials only (no fake logo).
 *
 * "Others" renders a basketball SVG icon instead of a plain "O" initial.
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

function BasketballIcon({ size }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" aria-hidden
      style={{ display: 'block' }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2C12 12 12 12 12 22" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 12H22" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 4.5C8 8 8 16 4.5 19.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M19.5 4.5C16 8 16 16 19.5 19.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default function ConferenceLogo({ conference, size = 28 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const logo = getConferenceLogo(conference);
  const initials = getInitials(conference);

  if (!conference) return null;

  const sizeStyle = { width: size, height: size, minWidth: size, minHeight: size };

  if (conference === 'Others') {
    return (
      <span className={styles.othersBadge} style={sizeStyle} aria-label="Other conferences">
        <BasketballIcon size={Math.round(size * 0.72)} />
      </span>
    );
  }

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
