import { useWorkspace } from '../../workspaces/WorkspaceContext';
import styles from './MlbShared.module.css';

export default function MlbNewsFeed() {
  const { workspace } = useWorkspace();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} MLB News Feed</h1>
        <p className={styles.subtitle}>Headlines, trades, injuries, and analysis</p>
      </header>
      <section className={styles.emptyState}>
        <div className={styles.emptyIcon}>📰</div>
        <h3>News feed loading soon</h3>
        <p>MLB news from trusted sources will aggregate here as the season begins.</p>
      </section>
    </div>
  );
}
