/**
 * Conference logo — uses /public/conferences/{slug}.png with fallback to initials badge.
 */

import { useState } from 'react';
import { getConferenceSlug } from '../../utils/conferenceSlug';
import styles from './ConferenceLogo.module.css';

function getInitials(conference) {
  if (!conference) return '?';
  if (conference === 'Big Ten') return 'B10';
  if (conference === 'Big 12') return 'B12';
  return conference.slice(0, 1).toUpperCase();
}

export default function ConferenceLogo({ conference, size = 28 }) {
  const [imgError, setImgError] = useState(false);
  const slug = getConferenceSlug(conference);
  const src = slug ? `/conferences/${slug}.png` : null;
  const initials = getInitials(conference);

  if (!conference) return null;

  if (imgError || !src) {
    return (
      <span className={styles.fallback} style={{ width: size, height: size }} aria-hidden>
        {initials}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={styles.img}
      onError={() => setImgError(true)}
      aria-hidden
    />
  );
}
