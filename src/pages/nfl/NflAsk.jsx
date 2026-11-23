/**
 * /nfl/ask — Ask Maximus.
 *
 * A chat about this week's NFL picks, lines and matchups. The page is a
 * thin shell: the header and section tabs every NFL page has, then the
 * conversation.
 */

import AskMaximus from '../../components/ask/AskMaximus';
import NflSectionTabs from '../../components/nfl/home/NflSectionTabs';
import SEOHead from '../../components/seo/SEOHead';
import h from '../../components/nfl/home/home.module.css';

export default function NflAsk() {
  return (
    <div className={h.page}>
      <SEOHead
        title="Ask Maximus: NFL Picks, Lines and Matchups, Answered"
        description="Ask Maximus about this week's NFL picks, spreads, totals and matchups. Every answer comes with the price, the book and the reason."
      />
      <header className={h.header}>
        <div>
          <h1 className={h.title}>Ask Maximus</h1>
          <p className={h.meta}>This week’s picks, lines and matchups, with the price and the reason.</p>
        </div>
      </header>
      <NflSectionTabs />
      <AskMaximus />
    </div>
  );
}
