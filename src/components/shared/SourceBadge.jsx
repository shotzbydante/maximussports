/**
 * Small badge indicating data source for provenance.
 * ESPN | Google News | Yahoo Sports | CBS Sports | NCAA.com | Mock | Team Feed names
 */

import styles from './SourceBadge.module.css';

const KNOWN_SOURCES = ['ESPN', 'Google News', 'Yahoo Sports', 'CBS Sports', 'NCAA.com', 'Mock'];
const SOURCE_STYLES = {
  ESPN: styles.badgeESPN,
  'Google News': styles.badgeGoogleNews,
  'Yahoo Sports': styles.badgeYahoo,
  'CBS Sports': styles.badgeCBS,
  'NCAA.com': styles.badgeNCAA,
  Mock: styles.badgeMock,
};

export default function SourceBadge({ source = 'Mock' }) {
  const s = typeof source === 'string' && source.trim() ? source : 'Mock';
  const style = SOURCE_STYLES[s] || styles.badgeGeneric;
  return (
    <span className={`${styles.badge} ${style}`} title={`Data source: ${s}`}>
      {s}
    </span>
  );
}
