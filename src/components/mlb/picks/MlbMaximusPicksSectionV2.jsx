/**
 * MlbMaximusPicksSectionV2 — conviction-ordered MLB picks UI.
 *
 *   ┌ Yesterday's Scorecard ─┐
 *   ┌ Today's Top Play ──────┐
 *   ┌ Tier 1 Top Plays ──────┐
 *   ┌ Tier 2 Strong Plays ───┐
 *   ┌ Tier 3 Leans ──────────┐
 *
 * Reads /api/mlb/picks/built (v2 payload). Falls back to a legacy-friendly
 * render if tiers are missing (keeps previous consumers alive).
 */

import { useEffect, useMemo, useState } from 'react';
import YesterdayScorecard from './YesterdayScorecard';
import TopPlayHero from './TopPlayHero';
import TierSection from './TierSection';
import styles from './MlbMaximusPicksSectionV2.module.css';

export default function MlbMaximusPicksSectionV2({ mode = 'page' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/mlb/picks/built')
      .then(r => r.json())
      .then(d => setPayload(d))
      .catch(() => setPayload(null))
      .finally(() => setLoading(false));
  }, []);

  const tiers = payload?.tiers;
  const topPick = payload?.topPick || tiers?.tier1?.[0] || null;

  // Legacy fallback — synthesize tiers from categories (old API) so UI never crashes
  const fallbackTiers = useMemo(() => {
    if (tiers) return null;
    const cats = payload?.categories || {};
    const all = [...(cats.pickEms || []), ...(cats.ats || []), ...(cats.leans || []), ...(cats.totals || [])];
    const sorted = all.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
    return {
      tier1: sorted.filter(p => p.confidence === 'high').slice(0, 3),
      tier2: sorted.filter(p => p.confidence === 'medium').slice(0, 5),
      tier3: sorted.filter(p => p.confidence === 'low').slice(0, 5),
    };
  }, [tiers, payload]);

  const activeTiers = tiers || fallbackTiers || { tier1: [], tier2: [], tier3: [] };
  const activeTopPick = topPick || activeTiers.tier1?.[0] || null;

  if (loading) {
    return (
      <section className={styles.root}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>Betting Intelligence</span>
          <h2 className={styles.title}>{mode === 'page' ? 'MLB Odds Insights' : "Maximus's Picks"}</h2>
        </div>
        <div className={styles.skeleton} />
      </section>
    );
  }

  const totalPicks = (activeTiers.tier1?.length || 0) + (activeTiers.tier2?.length || 0) + (activeTiers.tier3?.length || 0);

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Betting Intelligence</span>
        <h2 className={styles.title}>{mode === 'page' ? 'MLB Odds Insights' : "Maximus's Picks"}</h2>
      </header>

      <YesterdayScorecard />

      {activeTopPick ? (
        <TopPlayHero pick={activeTopPick} />
      ) : (
        totalPicks === 0 && (
          <div className={styles.emptyBoard}>
            <p className={styles.emptyTitle}>No qualified MLB edges right now</p>
            <p className={styles.emptyDesc}>The model is waiting for stronger signal alignment before publishing today's board.</p>
          </div>
        )
      )}

      <TierSection tier="tier1" picks={activeTiers.tier1 || []} />
      <TierSection tier="tier2" picks={activeTiers.tier2 || []} />
      <TierSection tier="tier3" picks={activeTiers.tier3 || []} initialCollapsed />

      <footer className={styles.footer}>
        <p>For entertainment only. Please bet responsibly. Leans are data-driven, not advice.</p>
        {payload?.modelVersion && (
          <p className={styles.versionLine}>
            Model {payload.modelVersion} · Config {payload.configVersion || '—'}
          </p>
        )}
      </footer>
    </section>
  );
}
