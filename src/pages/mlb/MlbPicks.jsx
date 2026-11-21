/**
 * /mlb/insights — standalone premium Odds Insights page.
 *
 * Single source of truth: MlbMaximusPicksSectionV2 (which reads from
 * /api/mlb/picks/built via useMlbPicks). In the offseason the board is
 * replaced by the offseason panel (champion + countdown).
 */

import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';
import OffseasonPanel from '../../components/season/OffseasonPanel';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { SeasonState } from '../../workspaces/config';
import offseasonStyles from './MlbOffseason.module.css';

const PAGE_STYLE = { maxWidth: 1100, margin: '0 auto', padding: 'var(--space-lg) 16px' };

export default function MlbPicks() {
  const { workspace, buildPath } = useWorkspace();

  // Offseason: there is no slate to score, so the picks board would be empty.
  if (workspace.seasonState === SeasonState.COMPLETED) {
    return (
      <div className={offseasonStyles.page}>
        <header className={offseasonStyles.header}>
          <h1 className={offseasonStyles.pageTitle}>MLB Odds Insights</h1>
          <p className={offseasonStyles.subtitle}>No picks until there is a slate to score</p>
        </header>
        <OffseasonPanel
          workspace={workspace}
          returns="Daily picks return"
          links={[{ to: buildPath('/season-model'), label: 'Season Model' }, { to: buildPath('/teams'), label: 'Team Intel' }]}
        />
      </div>
    );
  }

  return (
    <div style={PAGE_STYLE}>
      <MlbMaximusPicksSectionV2 mode="page" />
    </div>
  );
}
