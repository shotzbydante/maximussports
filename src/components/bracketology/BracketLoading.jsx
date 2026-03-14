import styles from './BracketLoading.module.css';

export default function BracketLoading() {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingInner}>
        <div className={styles.robotGlow} />
        <img
          src="/mascot.png"
          alt="Maximus"
          className={styles.robot}
          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
        />
        <div className={styles.loadingText}>
          <span className={styles.loadingTitle}>Initializing Tournament Intelligence</span>
          <div className={styles.loadingBar}>
            <div className={styles.loadingBarFill} />
          </div>
          <span className={styles.loadingSubtext}>Loading Bracketology…</span>
        </div>
      </div>
    </div>
  );
}
