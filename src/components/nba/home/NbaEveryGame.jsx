/**
 * NbaEveryGame — a call on every game, four ways, the same control the NFL
 * picks page uses.
 *
 *   Overall     the single strongest call on each game, whichever market
 *   Spreads     a side for every game
 *   Moneyline   a side to win for every game
 *   Over/under  over or under for every game
 *
 * Each tab ranks the games from the strongest call to the weakest and gives
 * one line of reasoning built from the engine's numbers. The tabs can be
 * clicked, or the panels swiped on a touch screen; the two stay in sync.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NbaLogo, Matchup, TeamText } from './NbaTeamTag';
import { SectionHead, ScoreRing } from '../../nfl/home/HomeParts';
import { tipShort } from './nbaFormat';
import { HELD_BACK, MARKET_NAME, bestPerGame, isMaximusPick, nbaPickSummary, pickedTeam, rankMarket, score } from './nbaPickHelpers';
import { trackFilterChange } from '../../../analytics/sportEvents';
import h from '../../nfl/home/home.module.css';

const TABS = [
  { key: 'overall', label: 'Overall' },
  { key: 'runline', label: 'Spreads' },
  { key: 'moneyline', label: 'Moneyline' },
  { key: 'total', label: 'Over/under' },
];

const NOTE = {
  overall: 'Our strongest call on each game, whichever market it is in.',
  runline: 'A side against the spread for every game, ranked by conviction. A side is called from the gap between the moneyline and the spread.',
  moneyline: 'A side to win for every game, ranked by conviction. The win chance comes from the spread, so a lean here is a price that looks a little long, not a prediction that the underdog wins.',
  total: 'Over or under for every game, ranked by conviction. A total is called from each team’s recent scoring.',
};

function Row({ pick, rank, showMarket }) {
  const m = pick.matchup || {};
  const team = pickedTeam(pick);
  const picked = isMaximusPick(pick);
  const held = HELD_BACK[pick.lowSignalReason];
  const why = nbaPickSummary(pick);
  return (
    <li className={h.evRow}>
      <span className={`${h.rank} ${h.evRank} ${picked ? '' : h.rankQuiet}`} aria-label={`Rank ${rank}`}>{rank}</span>
      <div className={h.evPick}>
        <span className={h.evLabel}>
          {team && <NbaLogo slug={team.slug} src={team.logo} size={22} />}
          {pick.selection?.label}
        </span>
        <span className={h.chipRow}>
          {showMarket && <span className={h.chip}>{MARKET_NAME[pick.market?.type] || 'Pick'}</span>}
          {picked
            ? <span className={`${h.chip} ${h.chipUp}`}>Maximus’s pick</span>
            : <span className={h.chip}>Lean</span>}
          {!picked && held && <span className={`${h.chip} ${h.chipWarn}`}>{held}</span>}
        </span>
      </div>
      <div className={h.evMeta}>
        <Matchup away={m.awayTeam} home={m.homeTeam} size={16} />
        <span>{tipShort(m.startTime)}</span>
      </div>
      {why && <p className={h.evWhy}><TeamText text={why} size={14} /></p>}
      <div className={h.evScore}><ScoreRing value={score(pick)} small /></div>
    </li>
  );
}

export default function NbaEveryGame({ picks }) {
  const [active, setActive] = useState(0);
  const scroller = useRef(null);
  const tabRefs = useRef([]);
  const panelRefs = useRef([]);
  const [height, setHeight] = useState(null);
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

  // The panels sit side by side; size the row to the open one.
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
    trackFilterChange({ sport: 'nba', page: 'nba_picks', filter: 'every_game_view', value: TABS[active].key });
  }, [active]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); select((active + 1) % TABS.length, { focus: true }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); select((active + TABS.length - 1) % TABS.length, { focus: true }); }
  };

  return (
    <section className={h.section} aria-label="Every game">
      <SectionHead title="Every game" />
      <p className={h.sectionNote}>
        A call on every game still to tip off, ranked from our strongest to our weakest. Maximus’s picks are
        the calls the engine is most confident in. Everything else is a lean: saved and graded, not a pick.
      </p>

      <div className={h.evTabs} role="tablist" aria-label="Every game, by market" onKeyDown={onKeyDown}>
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`nba-every-game-tab-${t.key}`}
            aria-selected={active === i}
            aria-controls={`nba-every-game-panel-${t.key}`}
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
              id={`nba-every-game-panel-${t.key}`}
              aria-labelledby={`nba-every-game-tab-${t.key}`}
              className={h.evPanel}
              ref={(el) => { panelRefs.current[i] = el; }}
              inert={active !== i}
            >
              <p className={h.evNote}>{NOTE[t.key]}</p>
              {rows.length === 0 ? (
                <div className={h.empty}>
                  <b>Nothing posted in this market yet</b>
                  Calls appear here as books post lines for tonight’s games.
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
