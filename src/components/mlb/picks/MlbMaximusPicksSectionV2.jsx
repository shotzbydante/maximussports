/**
 * MlbMaximusPicksSectionV2 — canonical MLB picks presentation layer.
 *
 *   mode="page"  → full Odds Insights:
 *     Scorecard → Top Play → HowItWorks → Tier 1 → Tier 2 → Tier 3 (collapsed)
 *
 *   mode="home"  → compact Home-Daily-Briefing:
 *     Scorecard + Top Play (row) → HowItWorks (inline) → Tier 1 → Tier 2 → CTA
 *
 * Both modes consume the SAME useMlbPicks() hook. No drift.
 *
 * Before rendering, picks are:
 *   1. Doubleheader-annotated — two games same teams same day get Game 1 / 2.
 *   2. Grouped by matchup — one card per game; additional markets become
 *      sibling rows inside that card. This kills accidental duplicates.
 *   3. Cross-referenced against topPick so the tier card that is the Top
 *      Play shows a ★ tag.
 */

import { useMlbPicks, withTopPickCrossReference } from '../../../features/mlb/picks/useMlbPicks';
import { groupByMatchup, annotateDoubleheaders } from '../../../features/mlb/picks/groupPicks';
import YesterdayScorecard from './YesterdayScorecard';
import TopPlayHero from './TopPlayHero';
import TierSection from './TierSection';
import HowItWorks from './HowItWorks';
import tokens from './picks.tokens.module.css';
import styles from './MlbMaximusPicksSectionV2.module.css';

function prepareTier(picks, topPick, slateDate) {
  const annotated = annotateDoubleheaders(picks || [], { slateDate });
  const withCrossRef = withTopPickCrossReference(annotated, topPick);
  return groupByMatchup(withCrossRef);
}

export default function MlbMaximusPicksSectionV2({ mode = 'page' }) {
  const { payload, loading, scorecardSummary, topPick, tiers, modelVersion, configVersion } = useMlbPicks();

  if (loading) return <LoadingShell mode={mode} />;

  const slateDate = payload?.date || null;

  const tier1Cards = prepareTier(tiers.tier1 || [], topPick, slateDate);
  const tier2Cards = prepareTier(tiers.tier2 || [], topPick, slateDate);
  const tier3Cards = prepareTier(tiers.tier3 || [], topPick, slateDate);

  const totalCards = tier1Cards.length + tier2Cards.length + tier3Cards.length;
  const totalPicks = (tiers.tier1?.length || 0) + (tiers.tier2?.length || 0) + (tiers.tier3?.length || 0);

  if (mode === 'home') {
    return (
      <section className={`${tokens.root} ${styles.root} ${styles.modeHome}`} aria-label="Maximus's Picks">
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.eyebrow}>Maximus's Picks</span>
            <h2 className={styles.title}>Today's Betting Intelligence</h2>
          </div>
          {totalPicks > 0 && (
            <a href="/mlb/insights" className={styles.headerCta}>
              See all {totalPicks} picks →
            </a>
          )}
        </header>

        <div className={styles.homeGrid}>
          {scorecardSummary && <YesterdayScorecard summary={scorecardSummary} compact />}
          {topPick && <TopPlayHero pick={topPick} />}
        </div>

        <HowItWorks variant="home" />

        {totalCards > 0 ? (
          <>
            {tier1Cards.length > 0 && (
              <TierSection tier="tier1" cards={tier1Cards} mode="home" />
            )}
            {tier2Cards.length > 0 && (
              <TierSection tier="tier2" cards={tier2Cards.slice(0, 2)} mode="home" />
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

      {scorecardSummary && <YesterdayScorecard summary={scorecardSummary} />}

      {topPick && <TopPlayHero pick={topPick} featured />}

      <HowItWorks />

      {totalCards === 0 && !topPick && <EmptyBoard />}

      {totalCards > 0 && (
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
