/**
 * NBA Odds Insights — standalone picks/odds intelligence page.
 * Consumes the same canonical picks payload as NBA Home, rendered
 * in `page` mode for fuller display of the full picks board.
 */

import { useWorkspace } from '../../workspaces/WorkspaceContext';
import NbaMaximusPicksSection from '../../components/nba/NbaMaximusPicksSection';
import styles from './NbaShared.module.css';

export default function NbaPicks() {
  const { workspace } = useWorkspace();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} NBA Odds Insights</h1>
        <p className={styles.subtitle}>Model picks, lines, and market edges across today&rsquo;s NBA slate</p>
      </header>
      <NbaMaximusPicksSection mode="page" />
    </div>
  );
}
