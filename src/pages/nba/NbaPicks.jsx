/**
 * /nba/insights — NBA picks.
 *
 * Maximus's picks first, then a call on every game four ways, then the
 * record, then how picks are made. Built from the same light pieces as the
 * NBA home page and laid out like the NFL picks page.
 */

import NbaPicksSection from '../../components/nba/home/NbaPicks';
import NbaSectionTabs from '../../components/nba/home/NbaSectionTabs';
import NbaScorecardReport from '../../components/nba/picks/NbaScorecardReport';
import { SectionHead } from '../../components/nfl/home/HomeParts';
import SEOHead from '../../components/seo/SEOHead';
import h from '../../components/nfl/home/home.module.css';

export default function NbaPicks() {
  return (
    <div className={h.page}>
      <SEOHead
        title="NBA Odds Insights: Picks Against the Spread, Moneylines & Totals"
        description="NBA picks for tonight across spreads, moneylines and totals, each with the reasoning behind it, plus a lean on every game and a graded record."
      />
      <header className={h.header}>
        <div>
          <h1 className={h.title}>NBA picks</h1>
          <p className={h.meta}>The engine’s highest-conviction calls, each with its reason.</p>
        </div>
      </header>
      <NbaSectionTabs />

      <NbaPicksSection variant="full" />

      <NbaScorecardReport />

      <section className={h.section} aria-label="How NBA picks are made">
        <SectionHead title="How picks are made" />
        <div className={h.card}>
          <p className={h.prose}>
            Every game gets three calls: a side against the spread, a side to win, and over or under. Lines are
            the consensus across sportsbooks. A total is projected from each team’s scoring in its most recent
            games and compared with the posted number. A side is called from the gap between two prices on the
            same game: what the moneyline says the margin should be, against the spread.
          </p>
          <p className={h.prose}>
            Each call gets a conviction score out of 100. It is a ranking of how strongly the numbers point one
            way, not a probability of winning. The calls that score highest are Maximus’s picks. Everything else
            is a lean: saved and graded so the record is complete, but not a pick.
          </p>
          <p className={h.prose}>
            What the model does not have yet: an injury report, rest and travel, and book-by-book prices. A star
            sitting out moves an NBA line more than anything the model sees, so check the lineup before tip-off.
            Every pick is saved as published and graded against the final score.
          </p>
        </div>
      </section>

      <p className={h.fine}>For entertainment only. Please bet responsibly. 21+.</p>
    </div>
  );
}
