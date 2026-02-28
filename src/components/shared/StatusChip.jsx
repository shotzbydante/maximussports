import styles from './StatusChip.module.css';

function getVariant(status) {
  const s = (status || '').toLowerCase();
  if (s === 'final' || s.includes('final')) return 'final';
  if (s === 'halftime') return 'halftime';
  if (
    s.startsWith('q1') ||
    s.startsWith('q2') ||
    s.startsWith('1st') ||
    s.startsWith('2nd') ||
    (s.includes(':') && !s.includes('am') && !s.includes('pm'))
  ) return 'live';
  return 'upcoming';
}

export default function StatusChip({ status }) {
  if (!status) return null;
  const variant = getVariant(status);
  return (
    <span className={`${styles.chip} ${styles[variant]}`}>
      {variant === 'live' && <span className={styles.dot} aria-hidden />}
      {status}
    </span>
  );
}
