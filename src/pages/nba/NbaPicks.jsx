/**
 * /nba/insights — premium NBA Odds Insights page.
 *
 * Uses the shared sport-agnostic picks container with NBA endpoint + sport.
 * Full parity with /mlb/insights: Top Play hero, Tier 1/2/3, coverage pool,
 * conviction badges, trust layer, performance module, etc.
 */

import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';

export default function NbaPicks() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-lg) 16px' }}>
      <MlbMaximusPicksSectionV2
        mode="page"
        sport="nba"
        endpoint="/api/nba/picks/built"
      />
    </div>
  );
}
