/**
 * /nfl/ask and /ask — Ask Maximus, full page.
 *
 * The same conversation the launcher opens, with room to read. Open to
 * signed-out visitors: their first few questions need no account. A
 * question can ride in on the link (/ask?q=Who+do+you+like), which puts it
 * in the box for the visitor to send.
 */

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { track } from '../../analytics/index';
import AskThread from '../../components/ask/AskThread';
import { useAsk } from '../../components/ask/askState';
import NflSectionTabs from '../../components/nfl/home/NflSectionTabs';
import SEOHead from '../../components/seo/SEOHead';
import h from '../../components/nfl/home/home.module.css';

/** Seconds of the page being on screen at which to record that the visitor is still here. */
const DWELL_MARKS = [5, 15, 30, 60];

/**
 * Records that the chat is on screen, then how long the visitor stays.
 *
 * Instagram's in-app browser rarely reports a visitor leaving, so a visit
 * with no taps looks the same whether it lasted one second or a minute.
 * These events separate "the chat never appeared", "left at once" and
 * "read the prompts and left". Time only counts while the tab is visible.
 */
function usePageMeasure(ready, enabled) {
  useEffect(() => {
    if (!ready) return undefined;
    track('ask_page_ready', { sport: 'nfl', enabled, load_ms: Math.round(performance.now()) });
    let seen = 0;
    let next = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      seen += 1;
      if (seen >= DWELL_MARKS[next]) {
        track('ask_page_dwell', { sport: 'nfl', seconds: DWELL_MARKS[next] });
        next += 1;
        if (next >= DWELL_MARKS.length) clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [ready, enabled]);
}

export default function NflAsk() {
  const { enabled, status } = useAsk();
  const [params] = useSearchParams();
  usePageMeasure(status !== null, enabled);
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
