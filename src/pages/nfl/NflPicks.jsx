/**
 * /nfl/insights — NFL Odds Insights.
 *
 * Same building blocks as /mlb/insights and /nba/insights: the shared picks
 * container (Top Play, tiers, coverage) and the full-slate board, with the
 * NFL scorecard in place of the daily one because football is graded by
 * the week.
 */

import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';
import NbaFullSlateBoard from '../../components/nba/picks/NbaFullSlateBoard';
import NflScorecardReport from '../../components/nfl/NflScorecardReport';
import SEOHead from '../../components/seo/SEOHead';
import s from '../../components/nfl/nfl.module.css';

const ENDPOINT = '/api/nfl/picks/built';

const FULL_SLATE_COPY = {
  title: 'Every game · every market',
  sub: 'A spread, moneyline and total lean on every game left this week. Recommended picks are the strongest edges on the board; tracking picks are recorded and graded so the model’s full record stays visible.',
  empty: 'No games left on this week’s board. Next week’s slate appears here once lines post.',
  bannerKicker: 'This week’s edges',
  bannerScope: 'this week',
};

export default function NflPicks() {
  return (
    <div className={s.page}>
      <SEOHead
        title="NFL Odds Insights: Picks Against the Spread, Moneylines & Totals"
        description="Model-scored NFL picks for every game this week across spreads, moneylines and totals, tiered by conviction and graded against final scores."
      />
      <MlbMaximusPicksSectionV2
        mode="page"
        sport="nfl"
        endpoint={ENDPOINT}
        suppressPerformanceBlocks
      />
      <NbaFullSlateBoard endpoint={ENDPOINT} sport="nfl" copy={FULL_SLATE_COPY} />
      <NflScorecardReport />
      <section className={s.card}>
        <h2 className={s.sectionTitle}>How the NFL model works</h2>
        <p className={s.note} style={{ marginTop: 8 }}>
          Each team gets an offense and a defense rating in points per game, solved from every final score this
          season and adjusted for the opponents it has played. A game’s projection is the rating difference plus
          1.7 points of home field. The model then moves most of the way to the betting line, because the market
          already prices injuries and other news the ratings cannot see, and a pick’s edge is what is left.
        </p>
        <p className={s.note} style={{ marginTop: 8 }}>
          When the ratings and the market disagree by a touchdown or more, the pick is tracked but never
          recommended. There is no injury or weather feed behind these numbers.
        </p>
      </section>
    </div>
  );
}
