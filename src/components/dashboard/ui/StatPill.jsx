import styles from './StatPill.module.css';

/** Small labeled stat cell for use inside slide artboards. */
export default function StatPill({ label, value, accent = false }) {
  return (
    <div className={`${styles.root} ${accent ? styles.accent : ''}`}>
      <span className={styles.value}>{value ?? '—'}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
