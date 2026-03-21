/**
 * MLB Home — the primary landing page for the MLB workspace.
 * Mirrors the editorial composition philosophy of CBB Home.
 */

import { useWorkspace } from '../../workspaces/WorkspaceContext';
import PennantWatch from '../../components/mlb/PennantWatch';
import MlbNewsFeedWidget from '../../components/mlb/MlbNewsFeedWidget';
import styles from './MlbHome.module.css';

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
        <div className={styles.heroEyebrow}>Today's Intelligence Briefing</div>
        <p className={styles.heroBody}>
          Welcome to the MLB workspace — your hub for Major League Baseball intelligence.
          Track World Series futures, follow your teams, and stay ahead of the game
          with data-driven insights powered by the Maximus model. Scores, matchups, and
          picks will populate as the season gets underway and data sources come online.
        </p>
      </section>

      <PennantWatch />
      <MlbNewsFeedWidget />
    </div>
  );
}
