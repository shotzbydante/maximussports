import { useWorkspace } from '../../workspaces/WorkspaceContext';
import styles from './MlbShared.module.css';

export default function MlbPicks() {
  const { workspace } = useWorkspace();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} Maximus MLB Picks</h1>
        <p className={styles.subtitle}>Data-driven predictions and value bets</p>
      </header>
      <section className={styles.emptyState}>
        <div className={styles.emptyIcon}>📊</div>
        <h3>MLB picks coming soon</h3>
        <p>Once odds data flows in for the MLB season, Maximus will surface the best moneyline, runline, and total plays daily.</p>
      </section>
    </div>
  );
}
