/**
 * NBA workspace launch splash — premium loading screen shown
 * when entering the NBA workspace.
 */
import styles from './NbaLoading.module.css';

export default function NbaLoading() {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.ambientGlow} />
      <div className={styles.loadingInner}>
        <div className={styles.robotGlow} />
        <img
          src="/mascot.png"
          alt="Maximus"
          className={styles.robot}
          width={260}
          height={260}
          decoding="async"
          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
        />
        <div className={styles.loadingText}>
          <span className={styles.loadingTitle}>Initializing NBA Intelligence</span>
          <div className={styles.loadingBar}>
            <div className={styles.loadingBarFill} />
          </div>
          <span className={styles.loadingSubtext}>Loading court data&hellip;</span>
        </div>
      </div>
    </div>
  );
}
