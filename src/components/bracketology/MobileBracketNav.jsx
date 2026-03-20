import styles from './MobileBracketNav.module.css';

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: '🏀' },
  { id: 'East', label: 'East', icon: null },
  { id: 'South', label: 'South', icon: null },
  { id: 'West', label: 'West', icon: null },
  { id: 'Midwest', label: 'Midwest', icon: null },
  { id: 'finalfour', label: 'Final Four', icon: '🏆' },
];

export default function MobileBracketNav({ activeView, onChangeView }) {
  return (
    <div className={styles.container}>
      <div className={styles.nav}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`${styles.tab} ${activeView === v.id ? styles.tabActive : ''}`}
            onClick={() => onChangeView(v.id)}
          >
            {v.icon && <span className={styles.tabIcon}>{v.icon}</span>}
            <span className={styles.tabLabel}>{v.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
