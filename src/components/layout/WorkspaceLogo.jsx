/**
 * Renders the official workspace logo or falls back to the sport emoji —
 * including when the logo image fails to load.
 * Single source of truth for workspace identity visuals.
 */
import { useState } from 'react';
import styles from './WorkspaceLogo.module.css';

export default function WorkspaceLogo({ workspace, size = 20, className = '' }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = workspace?.logo;

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt={workspace.shortLabel}
        width={size}
        height={size}
        className={`${styles.logo} ${className}`}
        draggable={false}
        onError={() => setFailedSrc(src)}
      />
    );
  }
  return <span className={className}>{workspace?.emoji}</span>;
}
