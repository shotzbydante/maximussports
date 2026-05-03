/**
 * MlbMaximusPicksSectionV2 — canonical picks presentation layer.
 *
 *   mode="page"      → full Odds Insights
 *   mode="home"      → MLB / NBA home preview (Top Play FIRST)
 *   endpoint         → canonical picks source (default /api/mlb/picks/built)
 *   sport            → 'mlb' | 'nba' (used for copy + links)
 *
 * The component is sport-agnostic when `endpoint` + `sport` are passed. MLB
 * callers keep the defaults; NBA callers supply `sport="nba"` +
 * `endpoint="/api/nba/picks/built"`.
 *
 * HOME FLOW (post-refactor):
 *   1. Header (title + one-line subtitle only — no secondary framing here)
 *   2. Top Play HERO (first major element)
 *   3. Horizontal trust strip: Scorecard | TrackRecord | YesterdayContinuity
 *   4. Today's Picks section (framing copy lives HERE, above the grid)
 *   5. Tier grids + coverage
 *   6. Performance + AboutTheModel
 *   7. HowItWorks (bottom)
 */

import { useMemo } from 'react';
import { useCanonicalPicks, withTopPickCrossReference } from '../../../features/picks/useCanonicalPicks';
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

const SPORT_META = {
  mlb: {
    label: "Maximus's Picks",
    homeTitle: 'Model-driven betting intelligence',
    pageEyebrow: 'Betting Intelligence',
    pageTitle: 'MLB Odds Insights',
    pageSubtitle: "Model-scored picks across today's slate. Tiered by conviction, grouped by bet type.",
    insightsHref: '/mlb/insights',
  },
  nba: {
    label: "Maximus's Picks",
    homeTitle: 'Model-driven NBA betting intelligence',
    pageEyebrow: 'Betting Intelligence',
    pageTitle: 'NBA Odds Insights',
    pageSubtitle: "Model-scored picks across today's slate. Tiered by conviction, grouped by bet type.",
    insightsHref: '/nba/insights',
  },
};

function asCards(picks) { return (picks || []).map(p => ({ primary: p, siblings: [] })); }

export default function MlbMaximusPicksSectionV2({
  mode = 'page',
  sport = 'mlb',
  endpoint = '/api/mlb/picks/built',
  // When true (NBA Odds Insights uses this), skip the embedded
  // YesterdayScorecard / TrackRecord / YesterdayContinuity / Performance
  // Learning / Audit Insights blocks so a parent component (like
  // NbaScorecardReport) can own a single unified performance section
  // without duplication. MLB defaults to false → no regression.
  suppressPerformanceBlocks = false,
  // NBA Home: surface every published pick + every coverage pick instead
  // of the truncated home preview. MLB Home keeps the existing preview
  // behavior (homeShowAll defaults to false). Only respected in mode='home'.
  homeShowAll = false,
}) {
  const {
    payload, loading,
    scorecardSummary, topPick: rawTopPick, tiers, coverage,
    modelVersion, configVersion,
  } = useCanonicalPicks({ endpoint });

  const meta = SPORT_META[sport] || SPORT_META.mlb;

  const prepared = useMemo(() => {
    if (!tiers) return { tier1: [], tier2: [], tier3: [], coverage: [], allSurviving: [], topPick: null };
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
    const filterAcross = (arr) => arr.filter(p => {
      const k = keyOf(p);
      if (takenKeys.has(k)) return false;
      takenKeys.add(k);
      return true;
    });
    const tier1 = filterAcross(t1.picks);
    const tier2 = filterAcross(t2.picks);
    const tier3 = filterAcross(t3.picks);

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
    const homePreviewCount =
      tier1Cards.length + Math.min(tier2Cards.length, 3) + Math.min(tier3Cards.length, 2);
    const needCoverageOnHome = homePreviewCount < MIN_COVERAGE && coverageCards.length > 0;

    return (
      <section className={`${tokens.root} ${styles.root} ${styles.modeHome}`} aria-label={meta.label}>
        {/* 1. Header — title + short subheader only */}
        <header className={styles.homeHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.eyebrow}>{meta.label}</span>
            <h2 className={styles.title}>{meta.homeTitle}</h2>
          </div>
          {totalPicks > 0 && (
            <a href={meta.insightsHref} className={styles.headerCta}>
              View full Odds Insights →
            </a>
          )}
        </header>

        {/* 2. Top Play FIRST — the entry point */}
        {topPick && <TopPlayHero pick={topPick} relativeStrength={topPickStrength} />}

        {/* 3. Horizontal trust strip — components always mount and self-fetch
            when `scorecardSummary` embed is null (e.g. /built cache is stale
            but the picks_daily_scorecards row was just written). */}
        {!suppressPerformanceBlocks && (
          <div className={styles.trustStrip}>
            <div className={styles.trustCell}>
              <YesterdayScorecard summary={scorecardSummary} compact />
            </div>
            <div className={styles.trustCell}>
              <TrackRecord payload={payload} scorecard={scorecardSummary} compact />
            </div>
            <div className={styles.trustCellWide}>
              <YesterdayContinuity summary={scorecardSummary} />
            </div>
          </div>
        )}

        {/* 4. Today's Picks section header — framing copy lives HERE */}
        {totalPicks > 0 && <TodaysPicksHeader totalPicks={totalPicks} compact />}

        {/* 5. Picks grid
            homeShowAll=true (NBA Home): render every tier + every coverage
            pick — no artificial truncation. Default home behavior is the
            preview (tier2.slice(3), tier3.slice(2), coverage cap). */}
        {totalPicks > 0 ? (
          <>
            {tier1Cards.length > 0 && <TierSection tier="tier1" cards={tier1Cards} mode="home" />}
            {tier2Cards.length > 0 && (
              <TierSection
                tier="tier2"
                cards={homeShowAll ? tier2Cards : tier2Cards.slice(0, 3)}
                mode="home"
              />
            )}
            {tier3Cards.length > 0 && (
              <TierSection
                tier="tier3"
                cards={homeShowAll ? tier3Cards : tier3Cards.slice(0, 2)}
                mode="home"
              />
            )}
            {homeShowAll
              ? coverageCards.length > 0 && (
                  <TierSection tier="coverage" cards={coverageCards} mode="home" />
                )
              : needCoverageOnHome && (
                  <TierSection
                    tier="coverage"
                    cards={coverageCards.slice(0, Math.max(0, MIN_COVERAGE - homePreviewCount))}
                    mode="home"
                  />
                )
            }
          </>
        ) : (
          !topPick && <EmptyBoard />
        )}

        {/* 6. Performance + About */}
        {!suppressPerformanceBlocks && <PerformanceLearning compact sport={sport} />}
        <AboutTheModel variant="compact" />

        {/* 7. How it works — moved to BOTTOM */}
        <HowItWorks variant="home" />

        <footer className={styles.homeFooter}>
          {totalPicks > 0 && (
            <a href={meta.insightsHref} className={styles.fullBoardLink}>
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
    <section className={`${tokens.root} ${styles.root}`} aria-label={meta.pageTitle}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>{meta.pageEyebrow}</span>
          <h1 className={styles.title}>{meta.pageTitle}</h1>
          <p className={styles.subtitle}>{meta.pageSubtitle}</p>
        </div>
      </header>

      {!suppressPerformanceBlocks && (
        <>
          <TrackRecord payload={payload} scorecard={scorecardSummary} />
          {/* Always mount — self-fetches when embed is null. */}
          <YesterdayScorecard summary={scorecardSummary} />
          <YesterdayContinuity summary={scorecardSummary} />
        </>
      )}
      {topPick && <TopPlayHero pick={topPick} featured relativeStrength={topPickStrength} />}

      {!suppressPerformanceBlocks && (
        <div className={styles.intelligenceGrid}>
          <PerformanceLearning sport={sport} />
          <AuditInsights sport={sport} />
        </div>
      )}

      <AboutTheModel />

      {totalPicks === 0 && !topPick && <EmptyBoard />}

      {totalPicks > 0 && (
        <>
          <TodaysPicksHeader totalPicks={totalPicks} />
          <TierSection tier="tier1" cards={tier1Cards} />
          <TierSection tier="tier2" cards={tier2Cards} />
          <TierSection tier="tier3" cards={tier3Cards} initialCollapsed />
          {coverageCards.length > 0 && <TierSection tier="coverage" cards={coverageCards} initialCollapsed />}
        </>
      )}

      <HowItWorks />

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

function TodaysPicksHeader({ totalPicks, compact }) {
  return (
    <header className={`${styles.todaysHeader} ${compact ? styles.todaysHeaderCompact : ''}`}>
      <div className={styles.todaysHeaderLeft}>
        <span className={styles.todaysKicker}>Today's Picks</span>
        <h2 className={styles.todaysTitle}>
          Tiered by conviction — not all picks are equal.
        </h2>
        {!compact && (
          <p className={styles.todaysCopy}>
            Top Plays represent the highest-conviction edges. Additional picks reflect broader
            coverage across today's slate with varying confidence levels.
          </p>
        )}
      </div>
      <span className={styles.todaysCountPill}>
        <span className={styles.todaysCountLabel}>Published</span>
        <span className={styles.todaysCountValue}>{totalPicks}</span>
      </span>
    </header>
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
      <p className={styles.emptyBoardTitle}>No qualified edges today</p>
      <p className={styles.emptyBoardDesc}>The model is being selective — check back as the slate firms up.</p>
    </div>
  );
}
