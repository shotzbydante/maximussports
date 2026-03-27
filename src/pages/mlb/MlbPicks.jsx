/**
 * MLB Odds Insights — standalone picks/odds intelligence page.
 * Uses the same MLB picks engine as the Home section,
 * rendered in "page" mode for fuller board display.
 */

import MlbMaximusPicksSection from '../../components/mlb/MlbMaximusPicksSection';

export default function MlbPicks() {
  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: 'var(--space-lg) 0' }}>
      <MlbMaximusPicksSection mode="page" />
    </div>
  );
}
