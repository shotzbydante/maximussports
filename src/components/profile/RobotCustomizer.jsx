/**
 * RobotCustomizer — inline color palette controls for customizing
 * jersey color and robot body color during onboarding or profile edit.
 */
import { JERSEY_COLORS, ROBOT_COLORS } from './RobotAvatar';
import styles from './RobotCustomizer.module.css';

export default function RobotCustomizer({ jerseyColor, robotColor, onJerseyColorChange, onRobotColorChange }) {
  return (
    <div className={styles.customizer}>
      <div className={styles.paletteGroup}>
        <span className={styles.paletteLabel}>Jersey Color</span>
        <div className={styles.swatches}>
          {JERSEY_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.swatch} ${jerseyColor === c.hex ? styles.swatchActive : ''}`}
              style={{ background: c.hex, borderColor: c.hex === '#e8edf2' ? 'rgba(0,0,0,0.12)' : c.hex }}
              onClick={() => onJerseyColorChange(c.hex)}
              aria-label={c.label}
              title={c.label}
            >
              {jerseyColor === c.hex && <span className={styles.swatchCheck}>✓</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.paletteGroup}>
        <span className={styles.paletteLabel}>Robot Color</span>
        <div className={styles.swatches}>
          {ROBOT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.swatch} ${robotColor === c.hex ? styles.swatchActive : ''}`}
              style={{ background: c.hex }}
              onClick={() => onRobotColorChange(c.hex)}
              aria-label={c.label}
              title={c.label}
            >
              {robotColor === c.hex && <span className={styles.swatchCheck}>✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
