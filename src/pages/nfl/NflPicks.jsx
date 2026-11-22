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
  sub: 'Every game left this week, across spread, moneyline and total. A pick is recommended only when a book’s price beats the market’s own fair number. Everything else is the model’s lean, recorded and graded so its full record stays visible.',
  empty: 'No games left on this week’s board. Next week’s slate appears here once lines post.',
  bannerKicker: 'This week’s edges',
  bannerScope: 'this week',
};

export default function NflPicks() {
  return (
    <div className={s.page}>
      <SEOHead
        title="NFL Odds Insights: Picks Against the Spread, Moneylines & Totals"
        description="NFL picks for every game this week across spreads, moneylines and totals, recommended only when the price beats the market, locked when published and graded against final scores and the closing line."
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
        <h2 className={s.sectionTitle}>How NFL picks are made</h2>
        <p className={s.note} style={{ marginTop: 8 }}>
          The fair number for a game is the market’s own: every book’s line and price is converted to the
          margin or total it implies, and the middle of those is the consensus. A pick is recommended when one
          book is posting a line and price that beat that consensus by at least 1.5% of expected value, counting
          pushes and the extra weight of 3 and 7. The one thing allowed to move the fair number is strong wind,
          where unders have beaten the closing total 57% of the time since 2003.
        </p>
        <p className={s.note} style={{ marginTop: 8 }}>
          Maximus also rates every team from points and play-by-play efficiency, adjusts for who starts at
          quarterback, and projects each game. Over 4,096 games since 2011 those projections have not beaten the
          closing line, so they are shown as leans and graded, never recommended. Schedule spots, coaching
          matchups and unit grades appear with their historical record against the spread.
        </p>
        <p className={s.note} style={{ marginTop: 8 }}>
          A recommended pick is locked at its line, price and book the moment it is published. That ticket is
          what gets graded, in units and against the closing line. A quarterback in doubt or a stale price holds a
          game to tracking. Team and quarterback data: nflverse (CC BY 4.0).
        </p>
      </section>
    </div>
  );
}
