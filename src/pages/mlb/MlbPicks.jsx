/**
 * /mlb/insights — standalone premium Odds Insights page.
 *
 * Single source of truth: MlbMaximusPicksSectionV2 (which reads from
 * /api/mlb/picks/built via useMlbPicks).
 */

import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';

export default function MlbPicks() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-lg) 16px' }}>
      <MlbMaximusPicksSectionV2 mode="page" />
    </div>
  );
}
