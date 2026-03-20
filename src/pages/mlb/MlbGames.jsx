import { useWorkspace } from '../../workspaces/WorkspaceContext';
import styles from './MlbShared.module.css';

export default function MlbGames() {
  const { workspace } = useWorkspace();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} MLB Games</h1>
        <p className={styles.subtitle}>Daily schedule, scores, and matchup intelligence</p>
      </header>
      <section className={styles.emptyState}>
        <div className={styles.emptyIcon}>{workspace.emoji}</div>
        <h3>Games will appear here</h3>
        <p>Once the MLB season is underway, live scores, lines, and game insights will populate this page.</p>
      </section>
    </div>
  );
}
