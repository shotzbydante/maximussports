/**
 * MlbMaximusPicksSectionV2 — canonical picks presentation layer.
 *
 *   mode="page"  → full Odds Insights
 *   mode="home"  → MLB Home preview
 *
 * Both modes consume useMlbPicks(). Before rendering:
 *
 *   1. Tier picks are HARD-DEDUPED by normalized matchup key
 *      (away|home|slateDate). Only the highest bet-score pick per matchup
 *      reaches the UI. This is the trust-layer rule — the user must never
 *      see the same matchup twice.
 *   2. Relative strength is computed across the surviving slate so
 *      Top Play / Tier 1 can show "Highest conviction on today's slate"
 *      or "Top 5%" signals.
 *   3. Cross-reference annotations flag which tier card IS the top pick.
 */

import { useMemo } from 'react';
import { useMlbPicks, withTopPickCrossReference } from '../../../features/mlb/picks/useMlbPicks';
import { dedupeByMatchupKey } from '../../../features/mlb/picks/groupPicks';
import { relativeStrength } from '../../../features/mlb/picks/pickInsights';
import YesterdayScorecard from './YesterdayScorecard';
import TopPlayHero from './TopPlayHero';
import TierSection from './TierSection';
import HowItWorks from './HowItWorks';
import TrackRecord from './TrackRecord';
import tokens from './picks.tokens.module.css';
import styles from './MlbMaximusPicksSectionV2.module.css';

function asCards(picks) {
  // TierSection expects cards of shape { primary, siblings }. After dedupe
  // we have 1 pick per matchup, so siblings is always empty.
  return (picks || []).map(p => ({ primary: p, siblings: [] }));
}

export default function MlbMaximusPicksSectionV2({ mode = 'page' }) {
  const {
    payload, loading,
    scorecardSummary, topPick: rawTopPick, tiers,
    modelVersion, configVersion,
  } = useMlbPicks();

  const prepared = useMemo(() => {
    if (!tiers) return { tier1: [], tier2: [], tier3: [], allSurviving: [], topPick: null, droppedTotal: 0 };
    const slateDate = payload?.date || null;

    // 1. Dedupe each tier independently by matchup key.
    const t1 = dedupeByMatchupKey(tiers.tier1 || [], { slateDate });
    const t2 = dedupeByMatchupKey(tiers.tier2 || [], { slateDate });
    const t3 = dedupeByMatchupKey(tiers.tier3 || [], { slateDate });

    // 2. Cross-tier dedupe — a matchup that shows in Tier 1 must NOT reappear
    //    in Tier 2 or Tier 3.
    const takenKeys = new Set();
    const keyOf = (p) => {
      const a = p?.matchup?.awayTeam?.slug || '';
      const h = p?.matchup?.homeTeam?.slug || '';
      return `${a}|${h}|${slateDate || ''}`;
    };
    const filterAcrossTiers = (arr) => arr.filter(p => {
      const k = keyOf(p);
      if (takenKeys.has(k)) return false;
      takenKeys.add(k);
      return true;
    });
    const tier1 = filterAcrossTiers(t1.picks);
    const tier2 = filterAcrossTiers(t2.picks);
    const tier3 = filterAcrossTiers(t3.picks);
    const droppedTotal = t1.droppedCount + t2.droppedCount + t3.droppedCount +
      (t1.picks.length + t2.picks.length + t3.picks.length - (tier1.length + tier2.length + tier3.length));

    // 3. Top pick: use the provided one if it still survives dedupe; otherwise
    //    fall back to the highest-conviction tier-1 survivor.
    const allSurviving = [...tier1, ...tier2, ...tier3];
    let topPick = rawTopPick;
    if (topPick) {
      const topKey = keyOf(topPick);
      if (!allSurviving.some(p => keyOf(p) === topKey)) {
        topPick = tier1[0] || tier2[0] || null;
      }
    } else {
      topPick = tier1[0] || tier2[0] || null;
    }

    return { tier1, tier2, tier3, allSurviving, topPick, droppedTotal };
  }, [tiers, payload?.date, rawTopPick]);

  if (loading) return <LoadingShell mode={mode} />;

  const { tier1, tier2, tier3, allSurviving, topPick } = prepared;
  const tier1Annotated = withTopPickCrossReference(tier1, topPick);
  const tier2Annotated = withTopPickCrossReference(tier2, topPick);
  const tier3Annotated = withTopPickCrossReference(tier3, topPick);

  const totalPicks = allSurviving.length;
  const topPickStrength = topPick ? relativeStrength(topPick, allSurviving) : null;

  const tier1Cards = asCards(tier1Annotated).map(c => ({
    ...c,
    _relativeStrength: relativeStrength(c.primary, allSurviving),
  }));
  const tier2Cards = asCards(tier2Annotated);
  const tier3Cards = asCards(tier3Annotated);

  if (mode === 'home') {
    return (
      <section className={`${tokens.root} ${styles.root} ${styles.modeHome}`} aria-label="Maximus's Picks">
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.eyebrow}>Maximus's Picks</span>
            <h2 className={styles.title}>Model-driven betting intelligence</h2>
            <p className={styles.subtitle}>
              Every pick is scored 0–100 based on edge, confidence, situational context, and market quality.
              Top Plays represent the highest-conviction opportunities on today's slate.
            </p>
          </div>
          {totalPicks > 0 && (
            <a href="/mlb/insights" className={styles.headerCta}>
              See all {totalPicks} picks →
            </a>
          )}
        </header>

        <TrackRecord payload={payload} scorecard={scorecardSummary} compact />

        <div className={styles.homeGrid}>
          {scorecardSummary && <YesterdayScorecard summary={scorecardSummary} compact />}
          {topPick && <TopPlayHero pick={topPick} relativeStrength={topPickStrength} />}
        </div>

        <HowItWorks variant="home" />

        {totalPicks > 0 ? (
          <>
            {tier1Cards.length > 0 && (
              <TierSection tier="tier1" cards={tier1Cards} mode="home" />
            )}
            {tier2Cards.length > 0 && (
              <TierSection tier="tier2" cards={tier2Cards.slice(0, 3)} mode="home" />
            )}
          </>
        ) : (
          !topPick && <EmptyBoard />
        )}

        <footer className={styles.homeFooter}>
          {totalPicks > 0 && (
            <a href="/mlb/insights" className={styles.fullBoardLink}>
              See all {totalPicks} picks →
            </a>
          )}
        </footer>
      </section>
    );
  }

  // ── Full page mode ──
  return (
    <section className={`${tokens.root} ${styles.root}`} aria-label="MLB Odds Insights">
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>Betting Intelligence</span>
          <h1 className={styles.title}>MLB Odds Insights</h1>
          <p className={styles.subtitle}>
            Model-scored picks across today's slate. Tiered by conviction, grouped by bet type.
          </p>
        </div>
      </header>

      <TrackRecord payload={payload} scorecard={scorecardSummary} />

      {scorecardSummary && <YesterdayScorecard summary={scorecardSummary} />}

      {topPick && <TopPlayHero pick={topPick} featured relativeStrength={topPickStrength} />}

      <HowItWorks />

      {totalPicks === 0 && !topPick && <EmptyBoard />}

      {totalPicks > 0 && (
        <>
          <TierSection tier="tier1" cards={tier1Cards} />
          <TierSection tier="tier2" cards={tier2Cards} />
          <TierSection tier="tier3" cards={tier3Cards} initialCollapsed />
        </>
      )}

      <footer className={styles.footer}>
        <p className={styles.footerLegal}>
          For entertainment only. Please bet responsibly. Model output is not advice.
        </p>
        {modelVersion && (
          <p className={styles.footerVersion}>
            Model {modelVersion} · Config {configVersion || '—'}
          </p>
        )}
      </footer>
    </section>
  );
}

function LoadingShell({ mode }) {
  return (
    <section className={`${tokens.root} ${styles.root}`} aria-busy="true">
      <div className={styles.skeletonStrip} />
      <div className={styles.skeletonHero} />
      {mode !== 'home' && <div className={styles.skeletonTier} />}
    </section>
  );
}

function EmptyBoard() {
  return (
    <div className={styles.emptyBoard}>
      <p className={styles.emptyBoardTitle}>No qualified MLB edges today</p>
      <p className={styles.emptyBoardDesc}>The model is being selective — check back as the slate firms up.</p>
    </div>
  );
}
