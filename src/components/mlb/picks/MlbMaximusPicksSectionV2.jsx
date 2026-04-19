/**
 * MlbMaximusPicksSectionV2 — canonical picks presentation layer.
 *
 *   mode="page"  → full Odds Insights
 *   mode="home"  → MLB Home preview
 *
 * Behavior in this phase:
 *
 *   1. Every tier is deduped by normalized matchup key and across tiers so
 *      the same matchup never renders twice.
 *   2. If tier1+2+3 surviving count < 5, we PULL FROM THE COVERAGE POOL
 *      (scored but below-tier candidates) to guarantee minimum slate
 *      coverage. Those fill an "Expanded Coverage" section below Tier 3
 *      with clearly weaker visual emphasis.
 *   3. Top Play carries a "Highest conviction / Top N%" signal and a small
 *      reinforcement line.
 *   4. YesterdayContinuity shows above Top Play when there's a real graded
 *      result ("Top Play cashed yesterday · 3-1 board").
 */

import { useMemo } from 'react';
import { useMlbPicks, withTopPickCrossReference } from '../../../features/mlb/picks/useMlbPicks';
import { dedupeByMatchupKey } from '../../../features/mlb/picks/groupPicks';
import { relativeStrength } from '../../../features/mlb/picks/pickInsights';
import YesterdayScorecard from './YesterdayScorecard';
import YesterdayContinuity from './YesterdayContinuity';
import TopPlayHero from './TopPlayHero';
import TierSection from './TierSection';
import HowItWorks from './HowItWorks';
import TrackRecord from './TrackRecord';
import PerformanceLearning from './PerformanceLearning';
import AuditInsights from './AuditInsights';
import AboutTheModel from './AboutTheModel';
import tokens from './picks.tokens.module.css';
import styles from './MlbMaximusPicksSectionV2.module.css';

const MIN_COVERAGE = 5;
const MAX_COVERAGE_FROM_POOL = 6;

function asCards(picks) {
  return (picks || []).map(p => ({ primary: p, siblings: [] }));
}

export default function MlbMaximusPicksSectionV2({ mode = 'page' }) {
  const {
    payload, loading,
    scorecardSummary, topPick: rawTopPick, tiers, coverage,
    modelVersion, configVersion,
  } = useMlbPicks();

  const prepared = useMemo(() => {
    if (!tiers) {
      return { tier1: [], tier2: [], tier3: [], coverage: [], allSurviving: [], topPick: null };
    }
    const slateDate = payload?.date || null;

    const t1 = dedupeByMatchupKey(tiers.tier1 || [], { slateDate });
    const t2 = dedupeByMatchupKey(tiers.tier2 || [], { slateDate });
    const t3 = dedupeByMatchupKey(tiers.tier3 || [], { slateDate });

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

    // Expansion: if we have fewer than MIN_COVERAGE picks, fill from
    // the coverage pool — already dedupe-aware via takenKeys.
    let expanded = [];
    const totalSoFar = tier1.length + tier2.length + tier3.length;
    if (totalSoFar < MIN_COVERAGE && Array.isArray(coverage) && coverage.length > 0) {
      const needed = MIN_COVERAGE - totalSoFar;
      const extraCap = Math.min(MAX_COVERAGE_FROM_POOL, needed + 2);
      expanded = dedupeByMatchupKey(coverage, { slateDate }).picks
        .filter(p => !takenKeys.has(keyOf(p)))
        .slice(0, extraCap);
      for (const p of expanded) takenKeys.add(keyOf(p));
    }

    const allSurviving = [...tier1, ...tier2, ...tier3, ...expanded];
    let topPick = rawTopPick;
    if (topPick) {
      const topKey = keyOf(topPick);
      if (!allSurviving.some(p => keyOf(p) === topKey)) {
        topPick = tier1[0] || tier2[0] || null;
      }
    } else {
      topPick = tier1[0] || tier2[0] || null;
    }

    return { tier1, tier2, tier3, coverage: expanded, allSurviving, topPick };
  }, [tiers, payload?.date, rawTopPick, coverage]);

  if (loading) return <LoadingShell mode={mode} />;

  const { tier1, tier2, tier3, coverage: expanded, allSurviving, topPick } = prepared;
  const tier1Annotated = withTopPickCrossReference(tier1, topPick);
  const tier2Annotated = withTopPickCrossReference(tier2, topPick);
  const tier3Annotated = withTopPickCrossReference(tier3, topPick);
  const expandedAnnotated = withTopPickCrossReference(expanded, topPick);

  const totalPicks = allSurviving.length;
  const topPickStrength = topPick ? relativeStrength(topPick, allSurviving) : null;

  const tier1Cards = asCards(tier1Annotated).map(c => ({
    ...c, _relativeStrength: relativeStrength(c.primary, allSurviving),
  }));
  const tier2Cards = asCards(tier2Annotated);
  const tier3Cards = asCards(tier3Annotated);
  const coverageCards = asCards(expandedAnnotated);

  if (mode === 'home') {
    // MLB Home preview — goal: show ≥5 picks when available
    const homePreviewCount =
      tier1Cards.length + Math.min(tier2Cards.length, 3) + Math.min(tier3Cards.length, 2);
    const needCoverageOnHome = homePreviewCount < MIN_COVERAGE && coverageCards.length > 0;

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
            <p className={styles.whyThisMatters}>
              Designed to surface the most actionable bets — from highest conviction to broader slate coverage.
            </p>
          </div>
          {totalPicks > 0 && (
            <a href="/mlb/insights" className={styles.headerCta}>
              View full Odds Insights →
            </a>
          )}
        </header>

        <TrackRecord payload={payload} scorecard={scorecardSummary} compact />

        {scorecardSummary && <YesterdayContinuity summary={scorecardSummary} />}

        <div className={styles.homeGrid}>
          {scorecardSummary && <YesterdayScorecard summary={scorecardSummary} compact />}
          {topPick && <TopPlayHero pick={topPick} relativeStrength={topPickStrength} />}
        </div>

        <PerformanceLearning compact />
        <AboutTheModel variant="compact" />
        <HowItWorks variant="home" />

        {totalPicks > 0 ? (
          <>
            <FramingBlock />
            {tier1Cards.length > 0 && (
              <TierSection tier="tier1" cards={tier1Cards} mode="home" />
            )}
            {tier2Cards.length > 0 && (
              <TierSection tier="tier2" cards={tier2Cards.slice(0, 3)} mode="home" />
            )}
            {tier3Cards.length > 0 && (
              <TierSection tier="tier3" cards={tier3Cards.slice(0, 2)} mode="home" />
            )}
            {needCoverageOnHome && (
              <TierSection tier="coverage" cards={coverageCards.slice(0, Math.max(0, MIN_COVERAGE - homePreviewCount))} mode="home" />
            )}
          </>
        ) : (
          !topPick && <EmptyBoard />
        )}

        <footer className={styles.homeFooter}>
          {totalPicks > 0 && (
            <a href="/mlb/insights" className={styles.fullBoardLink}>
              View full Odds Insights →
            </a>
          )}
          <p className={styles.homeFollowLine}>
            Track performance daily. Picks are graded and refined over time.
          </p>
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

      {scorecardSummary && <YesterdayContinuity summary={scorecardSummary} />}

      {topPick && <TopPlayHero pick={topPick} featured relativeStrength={topPickStrength} />}

      <div className={styles.intelligenceGrid}>
        <PerformanceLearning />
        <AuditInsights />
      </div>

      <AboutTheModel />

      <HowItWorks />

      {totalPicks === 0 && !topPick && <EmptyBoard />}

      {totalPicks > 0 && (
        <>
          <TodaysPicksHeader totalPicks={totalPicks} />
          <TierSection tier="tier1" cards={tier1Cards} />
          <TierSection tier="tier2" cards={tier2Cards} />
          <TierSection tier="tier3" cards={tier3Cards} initialCollapsed />
          {coverageCards.length > 0 && (
            <TierSection tier="coverage" cards={coverageCards} initialCollapsed />
          )}
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

function TodaysPicksHeader({ totalPicks }) {
  return (
    <header className={styles.todaysHeader}>
      <div className={styles.todaysHeaderLeft}>
        <span className={styles.todaysKicker}>Today's Picks</span>
        <h2 className={styles.todaysTitle}>
          Tiered by conviction — not all picks are equal.
        </h2>
        <p className={styles.todaysCopy}>
          Top Plays represent the highest-conviction edges. Additional picks reflect
          broader coverage across today's slate with varying confidence levels.
        </p>
      </div>
      <span className={styles.todaysCountPill}>
        <span className={styles.todaysCountLabel}>Published</span>
        <span className={styles.todaysCountValue}>{totalPicks}</span>
      </span>
    </header>
  );
}

function FramingBlock() {
  return (
    <div className={styles.framingBlock}>
      <span className={styles.framingKicker}>Today's Picks</span>
      <p className={styles.framingCopy}>
        Top Plays represent the highest-conviction edges. Additional picks reflect broader
        coverage across today's slate with varying confidence levels.
      </p>
    </div>
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
