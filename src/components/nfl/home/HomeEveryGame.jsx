/**
 * HomeEveryGame — a decision on every game, four ways.
 *
 *   Overall     the single strongest call on each game, whichever market
 *   Spreads     a side for every game
 *   Moneyline   who we expect to win each game (the engine's winner call)
 *   Over/under  over or under for every game
 *
 * Each tab ranks the games from the strongest call to the weakest and
 * gives one line of reasoning from the picks engine. The tabs can be
 * clicked, or the panels swiped on a touch screen; the two stay in sync.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NflLogo from '../NflLogo';
import { Matchup, TeamText } from './NflTeamTag';
import { SectionHead, ScoreRing } from './HomeParts';
import { fmtOdds, kickoffShort } from './format';
import { HELD_BACK, bestPerGame, isRecommended, oneLiner, pickedTeam, rankMarket, score } from './pickHelpers';
import { trackFilterChange } from '../../../analytics/sportEvents';
import h from './home.module.css';

const TABS = [
  { key: 'overall', label: 'Overall', note: 'Our strongest call on each game at a playable price, whichever market it is in.' },
  { key: 'runline', label: 'Spreads', note: 'A side against the spread for every game.' },
  { key: 'moneyline', label: 'Moneyline', note: 'Who we expect to win each game, most likely first.' },
  { key: 'total', label: 'Over/under', note: 'Over or under for every game.' },
];
const MARKET_NAME = { runline: 'Spread', moneyline: 'Moneyline', total: 'Over/under' };

function Row({ pick, rank, showMarket }) {
  const m = pick.matchup || {};
  const team = pickedTeam(pick);
  const recommended = isRecommended(pick);
  const held = HELD_BACK[pick.lowSignalReason];
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
          {recommended
            ? <span className={`${h.chip} ${h.chipUp}`}>Recommended{pick.displayMetrics?.edgeValue ? ` ${pick.displayMetrics.edgeValue}` : ''}</span>
            : <span className={h.chip}>Lean</span>}
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

export default function HomeEveryGame({ picks }) {
  const [active, setActive] = useState(0);
  const scroller = useRef(null);
  const tabRefs = useRef([]);
  const frame = useRef(0);

  const lists = useMemo(() => ({
    overall: bestPerGame(picks),
    runline: rankMarket(picks, 'runline'),
    moneyline: rankMarket(picks, 'moneyline'),
    total: rankMarket(picks, 'total'),
  }), [picks]);

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

      <div className={h.evScroller} ref={scroller} onScroll={onScroll}>
        {TABS.map((t, i) => {
          const rows = lists[t.key];
          return (
            <div
              key={t.key}
              role="tabpanel"
              id={`every-game-panel-${t.key}`}
              aria-labelledby={`every-game-tab-${t.key}`}
              className={h.evPanel}
              inert={active !== i}
            >
              <p className={h.evNote}>{t.note}</p>
              {rows.length === 0 ? (
                <div className={h.empty}>
                  <b>Nothing posted in this market yet</b>
                  Calls appear here as books post lines for the week.
                </div>
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
