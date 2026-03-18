import { useState } from 'react';
import { getTeamSlug } from '../../utils/teamSlug';
import { getEspnLogoUrl } from '../../utils/espnTeamLogos';
import styles from './TeamLogo.module.css';

function getInitials(name) {
  const n = (name || '').trim();
  if (!n) return '?';
  const words = n.split(/\s+/);
  if (words.length === 1) return n.slice(0, 2).toUpperCase();
  if (n.startsWith('St.') || n.startsWith('Saint')) return (words[0].slice(0, 1) + (words[1]?.[0] || '')).toUpperCase();
  const first = words[0];
  const last = words[words.length - 1];
  if (['UCLA', 'USC', 'BYU', 'UCF', 'VCU', 'LSU', 'SMU', 'NJIT', 'UMBC', 'LIU', 'NDSU'].includes(first)) return first.slice(0, 3);
  if (first === 'NC' && words[1] === 'State') return 'NC';
  if (first === 'Texas' && words[1] === 'A&M') return 'TA';
  if (first === 'Miami' && words[1]?.startsWith('(Ohio)')) return 'MO';
  if (first === 'Miami' && words[1]?.startsWith('(OH)')) return 'MO';
  if (first === 'California' && words[1] === 'Baptist') return 'CB';
  if (first === "Hawai\u2019i" || first === 'Hawaii') return 'HI';
  if (first === 'Long' && words[1] === 'Island') return 'LI';
  if (first === 'North' && words[1] === 'Dakota') return 'ND';
  if (first === 'Wright' && words[1] === 'State') return 'WS';
  if (first === 'Tennessee' && words[1] === 'State') return 'TS';
  return (first[0] + (last?.[0] || first[1] || '')).toUpperCase();
}

function Monogram({ initials, className }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="6" fill="currentColor" opacity="0.18" />
      <text x="16" y="21" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor" fontFamily="'Oswald',system-ui,sans-serif" opacity="0.72">
        {initials.slice(0, 3)}
      </text>
    </svg>
  );
}

function slugFromName(name) {
  if (!name || typeof name !== 'string') return null;
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null;
}

function resolveSlug(team) {
  if (team?.slug) return team.slug;
  const name = team?.name;
  if (!name) return null;
  const canonical = getTeamSlug(name);
  if (canonical) return canonical;
  return slugFromName(name);
}

export default function TeamLogo({ team, size = 28 }) {
  const [localError, setLocalError] = useState(false);
  const [espnError, setEspnError] = useState(false);

  const slug = resolveSlug(team);
  const localPath = slug ? `/logos/${slug}.png` : null;
  const espnUrl = slug ? getEspnLogoUrl(slug) : null;
  const initials = getInitials(team?.name);

  if (!team) return null;

  const imgStyle = { objectFit: 'contain', maxWidth: size, maxHeight: size };

  // Tier 1: local logo (no crossOrigin for same-origin assets — avoids canvas tainting)
  if (!localError && localPath) {
    return (
      <span className={styles.wrapper} style={{ width: size, height: size }}>
        <img
          src={localPath}
          alt=""
          width={size}
          height={size}
          loading="eager"
          decoding="sync"
          onError={() => setLocalError(true)}
          className={styles.img}
          style={imgStyle}
          data-fallback-text={initials}
          data-team-slug={slug}
        />
      </span>
    );
  }

  // Tier 2: ESPN CDN logo
  if (!espnError && espnUrl) {
    return (
      <span className={styles.wrapper} style={{ width: size, height: size }}>
        <img
          src={espnUrl}
          alt=""
          width={size}
          height={size}
          loading="eager"
          decoding="sync"
          onError={() => setEspnError(true)}
          className={styles.img}
          style={imgStyle}
          crossOrigin="anonymous"
          data-fallback-text={initials}
          data-team-slug={slug}
        />
      </span>
    );
  }

  // Tier 3: monogram fallback
  return (
    <span className={styles.wrapper} style={{ width: size, height: size }}>
      <Monogram initials={initials} className={styles.monogram} />
    </span>
  );
}
