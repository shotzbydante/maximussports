/**
 * Conference logo — uses /public/conferences/{slug}.png or .svg with fallback to initials badge.
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
  const [attempt, setAttempt] = useState(0);
  const slug = getConferenceSlug(conference);
  const extensions = ['png', 'svg'];
  const ext = extensions[attempt];
  const src = slug && ext ? `/conferences/${slug}.${ext}` : null;
  const initials = getInitials(conference);

  if (!conference) return null;

  const handleError = () => {
    if (attempt + 1 < extensions.length) setAttempt((a) => a + 1);
  };

  if (!src || attempt >= extensions.length) {
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
      onError={handleError}
      aria-hidden
    />
  );
}
