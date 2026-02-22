import { useState } from 'react';
import styles from './TeamLogo.module.css';

/** Monogram initials from team name */
function getInitials(name) {
  const n = (name || '').trim();
  if (!n) return '?';
  const words = n.split(/\s+/);
  if (words.length === 1) return n.slice(0, 2).toUpperCase();
  if (n.startsWith('St.') || n.startsWith('Saint')) return (words[0].slice(0, 1) + (words[1]?.[0] || '')).toUpperCase();
  const first = words[0];
  const last = words[words.length - 1];
  if (['UCLA', 'USC', 'BYU', 'UCF', 'VCU', 'LSU', 'SMU'].includes(first)) return first.slice(0, 2);
  if (first === 'NC' && words[1] === 'State') return 'NC';
  if (first === 'Texas' && words[1] === 'A&M') return 'TA';
  if (first === 'Miami' && words[1]?.startsWith('(Ohio)')) return 'MO';
  return (first[0] + (last?.[0] || first[1] || '')).toUpperCase();
}

/** Inline SVG monogram fallback when no file loads */
function Monogram({ initials, className }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="4" fill="currentColor" opacity="0.12" />
      <text x="16" y="21" textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor" fontFamily="system-ui,sans-serif">
        {initials.slice(0, 2)}
      </text>
    </svg>
  );
}

/** Resolve logo path: prefer .svg, then .png (from fetch-logos script) */
function getLogoPath(slug) {
  if (!slug) return null;
  return [`/logos/${slug}.svg`, `/logos/${slug}.png`];
}

export default function TeamLogo({ team, size = 28 }) {
  const [attempt, setAttempt] = useState(0);
  const [imgError, setImgError] = useState(false);
  const slug = team?.slug;
  const paths = slug ? getLogoPath(slug) : [];
  const currentPath = paths[attempt] || null;
  const initials = getInitials(team?.name);

  const handleError = () => {
    if (attempt + 1 < paths.length) {
      setAttempt((a) => a + 1);
    } else {
      setImgError(true);
    }
  };

  if (!team) return null;

  if (imgError || !currentPath) {
    return (
      <span className={styles.wrapper} style={{ width: size, height: size }}>
        <Monogram initials={initials} className={styles.monogram} />
      </span>
    );
  }

  return (
    <span className={styles.wrapper} style={{ width: size, height: size }}>
      <img
        src={currentPath}
        alt=""
        width={size}
        height={size}
        onError={handleError}
        className={styles.img}
      />
    </span>
  );
}
