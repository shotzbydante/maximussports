import { TOURNAMENT_YEAR } from '../../config/bracketology';
import styles from './PreSelectionState.module.css';

export default function PreSelectionState() {
  return (
    <div className={styles.container}>
      <div className={styles.glow} />
      <div className={styles.content}>
        <div className={styles.icon}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="8" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.4)" />
            <rect x="4" y="14" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.3)" />
            <rect x="4" y="20" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.4)" />
            <rect x="4" y="26" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.3)" />
            <rect x="4" y="32" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.4)" />
            <rect x="4" y="38" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.3)" />
            <rect x="28" y="8" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.4)" />
            <rect x="28" y="14" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.3)" />
            <rect x="28" y="20" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.4)" />
            <rect x="28" y="26" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.3)" />
            <rect x="28" y="32" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.4)" />
            <rect x="28" y="38" width="16" height="2" rx="1" fill="rgba(90, 158, 230, 0.3)" />
            <rect x="22" y="16" width="4" height="2" rx="1" fill="rgba(90, 158, 230, 0.2)" />
            <rect x="22" y="30" width="4" height="2" rx="1" fill="rgba(90, 158, 230, 0.2)" />
          </svg>
        </div>
        <h3 className={styles.title}>Selection Sunday Pending</h3>
        <p className={styles.description}>
          The {TOURNAMENT_YEAR} NCAA Tournament field has not been announced yet.
          Once Selection Sunday reveals the 68-team bracket, this surface will
          auto-populate with teams, seeds, regions, and matchups.
        </p>
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🏀</span>
            <span>Full 68-team bracket with regions & seeds</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>◆</span>
            <span>Maximus model-driven winner predictions</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✏️</span>
            <span>Manual bracket picks with auto-save</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>📊</span>
            <span>Confidence scores & upset intelligence</span>
          </div>
        </div>
        <div className={styles.bracketPreview}>
          {Array.from({ length: 4 }).map((_, ri) => (
            <div key={ri} className={styles.previewRegion}>
              <div className={styles.previewLabel}>
                {['East', 'West', 'South', 'Midwest'][ri]}
              </div>
              <div className={styles.previewSlots}>
                {Array.from({ length: 8 }).map((_, si) => (
                  <div key={si} className={styles.previewSlot}>
                    <span className={styles.previewSeed}>{[1,16,8,9,5,12,4,13][si % 8]}</span>
                    <span className={styles.previewTeam}>TBD</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
