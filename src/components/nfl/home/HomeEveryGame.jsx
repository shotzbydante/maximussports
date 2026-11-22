/**
 * HomeEveryGame — a decision on every game, four ways.
 *
 *   Overall     the single strongest call on each game, whichever market
 *   Spreads     a side for every game
 *   Moneyline   only moneylines with value, best value first; often empty
 *   Over/under  over or under for every game
 *
 * Each tab ranks the games from the strongest call to the weakest and
 * gives one line of reasoning from the picks engine. The tabs can be
 * clicked, or the panels swiped on a touch screen; the two stay in sync.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import NflLogo from '../NflLogo';
import { Matchup, TeamText } from './NflTeamTag';
import { SectionHead, ScoreRing } from './HomeParts';
import { fmtOdds, kickoffShort } from './format';
import {
  HELD_BACK, THIN_VALUE, VALUE_FLOOR, bestPerGame, closestMoneyline, evText, isRecommended, oneLiner, pickedTeam,
  rankMarket, rankMoneylineValue, score,
} from './pickHelpers';
import { trackFilterChange } from '../../../analytics/sportEvents';
import h from './home.module.css';

const TABS = [
  { key: 'overall', label: 'Overall' },
  { key: 'runline', label: 'Spreads' },
  { key: 'moneyline', label: 'Moneyline' },
  { key: 'total', label: 'Over/under' },
];
const pctText = (v) => `${(v * 100).toFixed(1)}%`;
/** What each tab ranks by, said plainly. The moneyline one is about value, so it says what value means. */
function tabNote(key, floor, bar) {
  if (key === 'overall') return 'Our strongest call on each game at a playable price, whichever market it is in. A moneyline appears here only when it has value.';
  if (key === 'runline') return 'A side against the spread for every game, ranked by conviction.';
  if (key === 'total') return 'Over or under for every game, ranked by conviction.';
  return `Ranked by value, not by who is likelier to win. A moneyline is listed only when a book pays more than the fair price by +${pctText(floor)} or more of expected value: the average return on a bet at that price. We recommend at +${pctText(bar)}; anything under that is thin value.`;
}
const MARKET_NAME = { runline: 'Spread', moneyline: 'Moneyline', total: 'Over/under' };

function Row({ pick, rank, showMarket }) {
  const m = pick.matchup || {};
  const team = pickedTeam(pick);
  const recommended = isRecommended(pick);
  const held = HELD_BACK[pick.lowSignalReason];
  const thin = pick.lowSignalReason === THIN_VALUE;
  // A moneyline that has value but is held back (extreme price, quarterback in doubt): show the value and the hold.
  const valueHeld = pick.market?.type === 'moneyline' && Boolean(held) && typeof pick.ev === 'number' && pick.ev > 0;
  const price = pick.lock?.price ?? pick.market?.priceAmerican;
  const book = pick.lock?.book || pick.book?.title;
  const priceText = [pick.market?.type !== 'moneyline' ? fmtOdds(price) : '', book ? `at ${book}` : ''].filter(Boolean).join(' ');
  const why = oneLiner(pick);

  return (
    <li className={h.evRow}>
      <span className={`${h.rank} ${h.evRank} ${recommended ? '' : h.rankQuiet}`} aria-label={`Rank ${rank}`}>{rank}</span>

      <div className={h.evPick}>
        <span className={h.evLabel}>
          {team && <NflLogo slug={team.slug} src={team.logo} size={22} />}
          {pick.selection?.label}
        </span>
        <span className={h.chipRow}>
          {showMarket && <span className={h.chip}>{MARKET_NAME[pick.market?.type] || 'Pick'}</span>}
          {recommended && (
            <span className={`${h.chip} ${h.chipUp}`}>Recommended{pick.displayMetrics?.edgeValue ? ` ${pick.displayMetrics.edgeValue}` : ''}</span>
          )}
          {!recommended && thin && <span className={`${h.chip} ${h.chipUp}`}>Thin value {evText(pick.ev)}</span>}
          {!recommended && !thin && valueHeld && <span className={h.chip}>Value {evText(pick.ev)}</span>}
          {!recommended && !thin && !valueHeld && <span className={h.chip}>Lean</span>}
          {!recommended && held && <span className={`${h.chip} ${h.chipWarn}`}>{held}</span>}
        </span>
      </div>

      <div className={h.evMeta}>
        <Matchup away={m.awayTeam} home={m.homeTeam} size={16} />
        <span>{[kickoffShort(m.startTime), priceText].filter(Boolean).join(', ')}</span>
      </div>

      {why && <p className={h.evWhy}><TeamText text={why} abbrev size={14} /></p>}

      <div className={h.evScore}><ScoreRing value={score(pick)} small /></div>
    </li>
  );
}

export default function HomeEveryGame({ picks, valueFloor = VALUE_FLOOR, recommendBar = 0.015 }) {
  const [active, setActive] = useState(0);
  const scroller = useRef(null);
  const tabRefs = useRef([]);
  const panelRefs = useRef([]);
  const [height, setHeight] = useState(null);
  const frame = useRef(0);

  const lists = useMemo(() => ({
    overall: bestPerGame(picks, valueFloor),
    runline: rankMarket(picks, 'runline'),
    moneyline: rankMoneylineValue(picks, valueFloor),
    total: rankMarket(picks, 'total'),
  }), [picks, valueFloor]);
  const closest = useMemo(() => closestMoneyline(picks), [picks]);

  const select = useCallback((i, { focus = false } = {}) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    setActive(i);
    if (focus) tabRefs.current[i]?.focus();
  }, []);

  // Swiping the panels moves the tab.
  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = scroller.current;
      if (!el || !el.clientWidth) return;
      const i = Math.max(0, Math.min(TABS.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
      setActive((cur) => (cur === i ? cur : i));
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Keep the open panel in place when the window is resized.
  useEffect(() => {
    const onResize = () => {
      const el = scroller.current;
      if (el) el.scrollLeft = active * el.clientWidth;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active]);

  // The panels sit side by side, so the row would be as tall as the longest
  // list. Size it to the open panel instead, and follow that panel as it changes.
  useLayoutEffect(() => {
    const panel = panelRefs.current[active];
    if (!panel) return undefined;
    const measure = () => setHeight(panel.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    return () => ro.disconnect();
  }, [active, lists]);

  const tracked = useRef(0);
  useEffect(() => {
    if (tracked.current === active) return;
    tracked.current = active;
    trackFilterChange({ sport: 'nfl', page: 'nfl_picks', filter: 'every_game_view', value: TABS[active].key });
  }, [active]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); select((active + 1) % TABS.length, { focus: true }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); select((active + TABS.length - 1) % TABS.length, { focus: true }); }
  };

  return (
    <section className={h.section} aria-label="Every game">
      <SectionHead title="Every game" />
      <p className={h.sectionNote}>
        A call on every game, ranked from our strongest to our weakest. Recommended picks beat the
        market’s fair price. Leans are calls with no price edge: saved and graded, never recommended.
      </p>

      <div className={h.evTabs} role="tablist" aria-label="Every game, by market" onKeyDown={onKeyDown}>
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`every-game-tab-${t.key}`}
            aria-selected={active === i}
            aria-controls={`every-game-panel-${t.key}`}
            tabIndex={active === i ? 0 : -1}
            className={`${h.evTab} ${active === i ? h.evTabOn : ''}`}
            onClick={() => select(i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={h.evScroller} ref={scroller} onScroll={onScroll} style={height ? { height } : undefined}>
        {TABS.map((t, i) => {
          const rows = lists[t.key];
          return (
            <div
              key={t.key}
              role="tabpanel"
              id={`every-game-panel-${t.key}`}
              aria-labelledby={`every-game-tab-${t.key}`}
              className={h.evPanel}
              ref={(el) => { panelRefs.current[i] = el; }}
              inert={active !== i}
            >
              <p className={h.evNote}>{tabNote(t.key, valueFloor, recommendBar)}</p>
              {rows.length === 0 ? (
                t.key === 'moneyline' && closest ? (
                  <div className={h.empty}>
                    <b>No moneyline has value right now</b>
                    No side’s best price beats its fair price by enough to count. The closest
                    is <TeamText text={closest.selection?.label || ''} abbrev size={14} />
                    {closest.book?.title ? ` at ${closest.book.title}` : ''}, at {evText(closest.ev)} expected value.
                    A moneyline is listed here as soon as one clears +{pctText(valueFloor)}.
                  </div>
                ) : (
                  <div className={h.empty}>
                    <b>Nothing posted in this market yet</b>
                    Calls appear here as books post lines for the week.
                  </div>
                )
              ) : (
                <ol className={`${h.card} ${h.cardFlush} ${h.evList}`}>
                  {rows.map((p, n) => <Row key={p.id} pick={p} rank={n + 1} showMarket={t.key === 'overall'} />)}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
