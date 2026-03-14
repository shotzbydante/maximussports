import { Link } from 'react-router-dom';
import styles from './BracketAccessDenied.module.css';

export default function BracketAccessDenied() {
  return (
    <div className={styles.container}>
      <div className={styles.glow} />
      <div className={styles.content}>
        <div className={styles.lockIcon}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="8" y="18" width="24" height="18" rx="3" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <path d="M14 18V12a6 6 0 0 1 12 0v6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="20" cy="28" r="2" fill="rgba(255,255,255,0.3)" />
          </svg>
        </div>
        <h2 className={styles.title}>Bracketology</h2>
        <p className={styles.subtitle}>This feature is not yet available.</p>
        <p className={styles.description}>
          Bracketology is currently in private preview. Check back soon for
          model-driven bracket intelligence.
        </p>
        <Link to="/" className={styles.backLink}>
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
