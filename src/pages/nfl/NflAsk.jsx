/**
 * /nfl/ask and /ask — Ask Maximus, full page.
 *
 * The same conversation the launcher opens, with room to read. Open to
 * signed-out visitors: their first few questions need no account. A
 * question can ride in on the link (/ask?q=Who+do+you+like), which puts it
 * in the box for the visitor to send.
 */

import { useSearchParams } from 'react-router-dom';
import AskThread from '../../components/ask/AskThread';
import { useAsk } from '../../components/ask/askState';
import NflSectionTabs from '../../components/nfl/home/NflSectionTabs';
import SEOHead from '../../components/seo/SEOHead';
import h from '../../components/nfl/home/home.module.css';

export default function NflAsk() {
  const { enabled, status } = useAsk();
  const [params] = useSearchParams();
  return (
    <div className={h.page}>
      <SEOHead
        title="Ask Maximus: NFL Picks, Prices and Matchups, Answered"
        description="Ask Maximus about this week's NFL picks, spreads, totals and matchups. Every answer comes with the price, the book and the reason."
      />
      <header className={h.header}>
        <div>
          <h1 className={h.title}>Ask Maximus</h1>
          <p className={h.meta}>This week’s picks, prices and matchups, with the reason for each.</p>
        </div>
      </header>
      <NflSectionTabs />
      {status === null
        ? <div className={h.skeleton} aria-busy="true" />
        : enabled
          ? <AskThread variant="page" seed={params.get('q') || ''} />
          : <div className={h.empty}><b>Ask Maximus is not open yet</b>The picks, the lines and the record are on the NFL pages.</div>}
    </div>
  );
}
