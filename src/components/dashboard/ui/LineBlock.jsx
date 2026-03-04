import styles from './LineBlock.module.css';

function fmt(val, prefix = '') {
  if (val == null || val === '') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return String(val);
  if (prefix === 'spread') return n > 0 ? `+${n}` : String(n);
  if (prefix === 'ml') return n > 0 ? `+${n}` : String(n);
  return String(val);
}

/**
 * Displays spread / moneyline / total in a horizontal strip for slides.
 * All values optional — shows "—" when missing.
 */
export default function LineBlock({ spread, ml, total, label = 'THE LINE' }) {
  return (
    <div className={styles.root}>
      <div className={styles.topLabel}>{label}</div>
      <div className={styles.row}>
        <div className={styles.cell}>
          <span className={styles.val}>{fmt(spread, 'spread')}</span>
          <span className={styles.key}>SPREAD</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.cell}>
          <span className={styles.val}>{fmt(ml, 'ml')}</span>
          <span className={styles.key}>MONEYLINE</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.cell}>
          <span className={styles.val}>{fmt(total)}</span>
          <span className={styles.key}>TOTAL</span>
        </div>
      </div>
    </div>
  );
}
