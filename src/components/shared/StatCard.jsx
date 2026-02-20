import TrendArrow from './TrendArrow';
import styles from './StatCard.module.css';

export default function StatCard({ label, value, trend, subtext }) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {trend && <TrendArrow direction={trend} />}
      </div>
      <div className={styles.value}>{value}</div>
      {subtext && <div className={styles.subtext}>{subtext}</div>}
    </div>
  );
}
