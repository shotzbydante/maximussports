/**
 * /nba/insights — premium NBA Odds Insights page.
 *
 * Uses the shared sport-agnostic picks container with NBA endpoint + sport.
 * Full parity with /mlb/insights: Top Play hero, Tier 1/2/3, coverage pool,
 * conviction badges, trust layer, performance module, etc.
 */

import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';
import NbaScorecardReport from '../../components/nba/picks/NbaScorecardReport';
import NbaFullSlateBoard from '../../components/nba/picks/NbaFullSlateBoard';

export default function NbaPicks() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-lg) 16px' }}>
      {/* v7: full-slate game-by-game breakdown (ML + ATS + Total per
          playoff game). Lives at the top of Odds Insights as the
          canonical detailed surface. */}
      <NbaFullSlateBoard endpoint="/api/nba/picks/built" />
      {/* Unified Model Performance hero — combines yesterday's scorecard,
          per-pick report, category chips, rolling performance, and grading
          explainer. Replaces the duplicate Track Record / Yesterday's
          Scorecard / Performance & Learning blocks that V2 normally renders
          in page mode. suppressPerformanceBlocks silences those duplicates
          on NBA without regressing MLB. */}
      <NbaScorecardReport />
      <MlbMaximusPicksSectionV2
        mode="page"
        sport="nba"
        endpoint="/api/nba/picks/built"
        suppressPerformanceBlocks
      />
    </div>
  );
}
