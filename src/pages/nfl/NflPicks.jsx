/**
 * /nfl/insights — NFL picks.
 *
 * Recommended picks first, then every game's markets, then the record.
 * Built from the same light pieces as the NFL home page; football is
 * graded by the week, so the scorecard is the NFL one.
 */

import HomePicks from '../../components/nfl/home/HomePicks';
import NflSectionTabs from '../../components/nfl/home/NflSectionTabs';
import NflScorecardReport from '../../components/nfl/NflScorecardReport';
import { SectionHead } from '../../components/nfl/home/HomeParts';
import SEOHead from '../../components/seo/SEOHead';
import h from '../../components/nfl/home/home.module.css';

export default function NflPicks() {
  return (
    <div className={h.page}>
      <SEOHead
        title="NFL Odds Insights: Picks Against the Spread, Moneylines & Totals"
        description="NFL picks for every game this week across spreads, moneylines and totals, recommended only when the price beats the market, locked when published and graded against final scores and the closing line."
      />
      <header className={h.header}>
        <div>
          <h1 className={h.title}>NFL picks</h1>
          <p className={h.meta}>Recommended only when a book’s price beats the market.</p>
        </div>
      </header>
      <NflSectionTabs />

      <HomePicks variant="full" />

      <NflScorecardReport />

      <section className={h.section} aria-label="How NFL picks are made">
        <SectionHead title="How picks are made" />
        <div className={h.card}>
          <p className={h.prose}>
            The fair number for a game is the market’s own: every book’s line and price is converted to the
            margin or total it implies, and the middle of those is the consensus. A pick is recommended when one
            book is posting a line and price that beat that consensus by at least 1.5% of expected value, counting
            pushes and the extra weight of 3 and 7. The one thing allowed to move the fair number is strong wind,
            where unders have beaten the closing total 57% of the time since 2003.
          </p>
          <p className={h.prose}>
            Maximus also rates every team from points and play-by-play efficiency, adjusts for who starts at
            quarterback, and projects each game. Over 4,096 games since 2011 those projections have not beaten the
            closing line, so they are shown as leans and graded, never recommended. A moneyline is judged on value
            alone, and is shown only when a book’s price pays more than the fair price. Schedule spots, coaching
            matchups and unit grades appear with their historical record against the spread.
          </p>
          <p className={h.prose}>
            A recommended pick is locked at its line, price and book the moment it is published. That ticket is
            what gets graded, in units and against the closing line. A quarterback in doubt or a stale price holds a
            game to tracking. Team and quarterback data: nflverse (CC BY 4.0).
          </p>
        </div>
      </section>

      <p className={h.fine}>For entertainment only. Please bet responsibly. 21+.</p>
    </div>
  );
}
