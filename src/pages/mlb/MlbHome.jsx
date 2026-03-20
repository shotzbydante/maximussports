import { useWorkspace } from '../../workspaces/WorkspaceContext';
import styles from './MlbShared.module.css';

export default function MlbHome() {
  const { workspace } = useWorkspace();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.date}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).toUpperCase()}
        </span>
        <span className={styles.subtitle}>{workspace.labels.intelligence}</span>
      </header>

      <section className={styles.heroCard}>
        <h2 className={styles.heroTitle}>{workspace.emoji} Today's MLB Intelligence Briefing</h2>
        <p className={styles.heroBody}>
          Welcome to the MLB workspace. This is your hub for Major League Baseball
          intelligence — scores, matchups, odds, and data-driven insights powered
          by the Maximus model. Content will populate as the season gets underway
          and data sources come online.
        </p>
      </section>

      <section className={styles.comingSoon}>
        <h3 className={styles.comingSoonTitle}>Coming Soon</h3>
        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>{workspace.emoji}</span>
            <span className={styles.featureLabel}>Live Scores</span>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>📊</span>
            <span className={styles.featureLabel}>Maximus Picks</span>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>📰</span>
            <span className={styles.featureLabel}>News Feed</span>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🏟️</span>
            <span className={styles.featureLabel}>Team Intel</span>
          </div>
        </div>
      </section>
    </div>
  );
}
