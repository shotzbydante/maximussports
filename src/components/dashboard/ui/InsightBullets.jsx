import styles from './InsightBullets.module.css';

/** Up to 3 bullet points for slide body. */
export default function InsightBullets({ bullets = [], label = 'KEY INSIGHTS' }) {
  const items = bullets.filter(Boolean).slice(0, 3);
  if (items.length === 0) return null;
  return (
    <div className={styles.root}>
      {label && <div className={styles.sectionLabel}>{label}</div>}
      {items.map((b, i) => (
        <div key={i} className={styles.row}>
          <span className={styles.bullet}>→</span>
          <span className={styles.text}>{b}</span>
        </div>
      ))}
    </div>
  );
}
