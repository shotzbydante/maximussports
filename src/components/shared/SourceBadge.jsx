/**
 * Small badge indicating data source for provenance.
 * Sources: ESPN | Google News | Mock
 */

import styles from './SourceBadge.module.css';

const VALID_SOURCES = ['ESPN', 'Google News', 'Mock'];

export default function SourceBadge({ source = 'Mock' }) {
  const s = VALID_SOURCES.includes(source) ? source : 'Mock';
  return (
    <span className={`${styles.badge} ${styles[`badge${s.replace(/\s/g, '')}`]}`} title={`Data source: ${s}`}>
      {s}
    </span>
  );
}
