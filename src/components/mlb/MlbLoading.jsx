/**
 * MLB workspace launch splash — premium loading screen shown
 * when entering the MLB workspace, mirroring BracketLoading UX.
 */
import styles from './MlbLoading.module.css';

export default function MlbLoading() {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingInner}>
        <div className={styles.robotGlow} />
        <img
          src="/mascot-mlb.png"
          alt="Maximus"
          className={styles.robot}
          width={200}
          height={200}
          decoding="async"
          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
        />
        <div className={styles.loadingText}>
          <span className={styles.loadingTitle}>Initializing MLB Intelligence</span>
          <div className={styles.loadingBar}>
            <div className={styles.loadingBarFill} />
          </div>
          <span className={styles.loadingSubtext}>Loading MLB workspace…</span>
        </div>
      </div>
    </div>
  );
}
