import styles from './TrendArrow.module.css';

export default function TrendArrow({ direction }) {
  if (!direction || direction === 'neutral') return null;
  const isUp = direction === 'up';
  return (
    <span className={`${styles.arrow} ${isUp ? styles.up : styles.down}`}>
      {isUp ? '↑' : '↓'}
    </span>
  );
}
