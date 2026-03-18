/**
 * Small badge indicating data source / network for provenance.
 * ESPN | CBS | TNT | TBS | truTV | Google News | Yahoo Sports | CBS Sports | NCAA.com | Mock | Odds API
 */

import styles from './SourceBadge.module.css';

const SOURCE_STYLES = {
  ESPN: styles.badgeESPN,
  CBS: styles.badgeCBS,
  TNT: styles.badgeTNT,
  TBS: styles.badgeTBS,
  truTV: styles.badgeTruTV,
  'Google News': styles.badgeGoogleNews,
  'Yahoo Sports': styles.badgeYahoo,
  'CBS Sports': styles.badgeCBS,
  'NCAA.com': styles.badgeNCAA,
  Mock: styles.badgeMock,
  'Odds API': styles.badgeOddsAPI,
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
