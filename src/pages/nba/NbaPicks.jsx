/**
 * /nba/insights — premium NBA Odds Insights page.
 *
 * Uses the shared sport-agnostic picks container with NBA endpoint + sport.
 * Full parity with /mlb/insights: Top Play hero, Tier 1/2/3, coverage pool,
 * conviction badges, trust layer, performance module, etc.
 */

import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';
import NbaScorecardReport from '../../components/nba/picks/NbaScorecardReport';

export default function NbaPicks() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-lg) 16px' }}>
      {/* Full daily scorecard report — sits above the picks board on /nba/insights.
          On NBA Home, the compact scorecard inside MlbMaximusPicksSectionV2 stays
          (with a "View full scorecard →" CTA pointing here). */}
      <NbaScorecardReport />
      <MlbMaximusPicksSectionV2
        mode="page"
        sport="nba"
        endpoint="/api/nba/picks/built"
      />
    </div>
  );
}
