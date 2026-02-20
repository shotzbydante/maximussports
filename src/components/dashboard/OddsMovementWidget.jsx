import styles from './OddsMovementWidget.module.css';

export default function OddsMovementWidget({ movements }) {
  return (
    <div className={styles.widget}>
      <h3 className={styles.title}>Odds Movement</h3>
      <div className={styles.table}>
        <div className={styles.header}>
          <span>Matchup</span>
          <span>Open</span>
          <span>Current</span>
          <span>Move</span>
        </div>
        {movements.map((row) => (
          <div key={row.team} className={styles.row}>
            <span className={styles.team}>{row.team}</span>
            <span>{row.open}</span>
            <span className={styles.current}>{row.current}</span>
            <span className={`${styles.move} ${row.movement === 'up' ? styles.up : styles.down}`}>
              {row.movement === 'up' ? '↑ Dog' : '↓ Fav'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
