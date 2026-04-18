/**
 * MLB Odds Insights — standalone picks/odds intelligence page.
 *
 * Default: v2 conviction-ordered layout (Scorecard → Top Play → Tiers).
 * Fallback: legacy category grid behind ?legacy=1 or VITE_PICKS_UI_V2=0.
 */

import MlbMaximusPicksSection from '../../components/mlb/MlbMaximusPicksSection';
import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';

export default function MlbPicks() {
  const forceLegacy =
    typeof window !== 'undefined' && /[?&]legacy=1/.test(window.location.search);
  const envFlag = import.meta?.env?.VITE_PICKS_UI_V2;
  const useV2 = !forceLegacy && envFlag !== '0';

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: 'var(--space-lg) 0' }}>
      {useV2 ? <MlbMaximusPicksSectionV2 mode="page" /> : <MlbMaximusPicksSection mode="page" />}
    </div>
  );
}
