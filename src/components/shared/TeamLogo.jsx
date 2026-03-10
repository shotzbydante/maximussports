import { useState } from 'react';
import { getTeamSlug } from '../../utils/teamSlug';
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
  if (['UCLA', 'USC', 'BYU', 'UCF', 'VCU', 'LSU', 'SMU', 'NJIT', 'UMBC'].includes(first)) return first.slice(0, 2);
  if (first === 'NC' && words[1] === 'State') return 'NC';
  if (first === 'Texas' && words[1] === 'A&M') return 'TA';
  if (first === 'Miami' && words[1]?.startsWith('(Ohio)')) return 'MO';
  return (first[0] + (last?.[0] || first[1] || '')).toUpperCase();
}

/** Inline SVG monogram fallback — polished badge style */
function Monogram({ initials, className }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="6" fill="currentColor" opacity="0.10" />
      <text x="16" y="21" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fontFamily="system-ui,sans-serif" opacity="0.55">
        {initials.slice(0, 3)}
      </text>
    </svg>
  );
}

function slugFromName(name) {
  if (!name || typeof name !== 'string') return null;
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null;
}

/**
 * Resolve the best available slug for a team.
 * Priority: explicit slug > getTeamSlug (canonical) > naive slugFromName.
 */
function resolveSlug(team) {
  if (team?.slug) return team.slug;
  const name = team?.name;
  if (!name) return null;
  const canonical = getTeamSlug(name);
  if (canonical) return canonical;
  return slugFromName(name);
}

export default function TeamLogo({ team, size = 28 }) {
  const [imgError, setImgError] = useState(false);
  const slug = resolveSlug(team);
  const logoPath = slug ? `/logos/${slug}.png` : null;
  const initials = getInitials(team?.name);

  if (!team) return null;

  if (imgError || !logoPath) {
    return (
      <span className={styles.wrapper} style={{ width: size, height: size }}>
        <Monogram initials={initials} className={styles.monogram} />
      </span>
    );
  }

  return (
    <span className={styles.wrapper} style={{ width: size, height: size }}>
      <img
        src={logoPath}
        alt=""
        width={size}
        height={size}
        onError={() => setImgError(true)}
        className={styles.img}
      />
    </span>
  );
}
