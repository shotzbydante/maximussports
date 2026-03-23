/**
 * MLB workspace launch splash — premium loading screen shown
 * when entering the MLB workspace, mirroring BracketLoading UX.
 *
 * The baseball Maximus mascot is the hero visual — large, glowing,
 * and clearly branded, matching the prominence of the basketball
 * mascot on the NCAAM side.
 */
import styles from './MlbLoading.module.css';

export default function MlbLoading() {
  return (
    <div className={styles.loadingContainer}>
      {/* atmospheric ambient glow behind everything */}
      <div className={styles.ambientGlow} />

      <div className={styles.loadingInner}>
        <div className={styles.robotGlow} />
        <img
          src="/mascot-mlb.png"
          alt="Maximus"
          className={styles.robot}
          width={260}
          height={260}
          decoding="async"
          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
        />
        <div className={styles.loadingText}>
          <span className={styles.loadingTitle}>Initializing MLB Intelligence</span>
          <div className={styles.loadingBar}>
            <div className={styles.loadingBarFill} />
          </div>
          <span className={styles.loadingSubtext}>Calibrating projections&hellip;</span>
        </div>
      </div>
    </div>
  );
}
