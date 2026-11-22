/**
 * /nfl/insights — NFL picks.
 *
 * Recommended picks first, then the model's lean on every game, then the
 * record. Built from the same light pieces as the NFL home page; football
 * is graded by the week, so the scorecard is the NFL one.
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
        description="Model-scored NFL picks for every game this week across spreads, moneylines and totals, tiered by conviction and graded against final scores."
      />
      <header className={h.header}>
        <div>
          <h1 className={h.title}>NFL picks</h1>
          <p className={h.meta}>Spreads, winners and totals for this week, scored by the model.</p>
        </div>
      </header>
      <NflSectionTabs />

      <HomePicks variant="full" />

      <NflScorecardReport />

      <section className={h.section} aria-label="How the model works">
        <SectionHead title="How the model works" />
        <div className={h.card}>
          <p className={h.prose}>
            Each team gets an offense and a defense rating in points per game, worked out from every final
            score this season and adjusted for who it has played. A game’s projection is the difference in
            ratings plus 1.7 points for home field. The model then moves most of the way to the betting line,
            because the market already prices in news the ratings can’t see. What’s left is the edge.
          </p>
          <p className={h.prose}>
            A pick is tracked but never recommended when the ratings and the market disagree by a touchdown
            or more, when a starting quarterback is ruled out, or when the price to win is a very heavy
            favorite or a long shot. The bet score runs from 0 to 100 and combines the size of the edge, how
            much data sits behind the ratings, the game situation and the quality of the market. Weather is
            not part of the model.
          </p>
        </div>
      </section>

      <p className={h.fine}>For entertainment only. Please bet responsibly. 21+.</p>
    </div>
  );
}
