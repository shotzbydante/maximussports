/**
 * MlbMaximusPicksSectionV2 — canonical MLB picks presentation layer.
 *
 * Modes:
 *   - "page"  → full Odds Insights layout (Scorecard → Top Play → Tier 1/2/3)
 *   - "home"  → compact Home-Daily-Briefing layout (Scorecard + Top Play + Tier 1)
 *
 * Both modes consume the SAME useMlbPicks() hook. No drift.
 */

import { useMlbPicks, withTopPickCrossReference } from '../../../features/mlb/picks/useMlbPicks';
import YesterdayScorecard from './YesterdayScorecard';
import TopPlayHero from './TopPlayHero';
import TierSection from './TierSection';
import tokens from './picks.tokens.module.css';
import styles from './MlbMaximusPicksSectionV2.module.css';

export default function MlbMaximusPicksSectionV2({ mode = 'page' }) {
  const { payload, loading, scorecardSummary, topPick, tiers, modelVersion, configVersion } = useMlbPicks();

  if (loading) return <LoadingShell mode={mode} />;

  const totalPicks = (tiers.tier1?.length || 0) + (tiers.tier2?.length || 0) + (tiers.tier3?.length || 0);
  const noData = !payload || totalPicks === 0;

  // Annotate picks with cross-reference flags so tier cards can show "Top Play"
  // badges without re-rendering the same matchup as a separate card.
  const tier1 = withTopPickCrossReference(tiers.tier1 || [], topPick);
  const tier2 = withTopPickCrossReference(tiers.tier2 || [], topPick);
  const tier3 = withTopPickCrossReference(tiers.tier3 || [], topPick);

  if (mode === 'home') {
    return (
      <section className={`${tokens.root} ${styles.root} ${styles.modeHome}`} aria-label="Maximus's Picks">
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.eyebrow}>Maximus's Picks</span>
            <h2 className={styles.title}>Today's Betting Intelligence</h2>
          </div>
          <a href="/mlb/insights" className={styles.headerCta}>Full board →</a>
        </header>

        <div className={styles.homeGrid}>
          {scorecardSummary && (
            <YesterdayScorecard summary={scorecardSummary} compact />
          )}
          {topPick && <TopPlayHero pick={topPick} />}
        </div>

        {!noData ? (
          <TierSection tier="tier1" picks={tier1} mode="home" />
        ) : (
          <EmptyBoard />
        )}

        <footer className={styles.homeFooter}>
          <a href="/mlb/insights" className={styles.fullBoardLink}>See all {totalPicks || ''} picks →</a>
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
            Model-scored picks across today's slate. Tiered by conviction, not market.
          </p>
        </div>
      </header>

      {scorecardSummary && <YesterdayScorecard summary={scorecardSummary} />}

      {topPick && <TopPlayHero pick={topPick} featured />}

      {noData && !topPick && <EmptyBoard />}

      {!noData && (
        <>
          <TierSection tier="tier1" picks={tier1} />
          <TierSection tier="tier2" picks={tier2} />
          <TierSection tier="tier3" picks={tier3} initialCollapsed />
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
