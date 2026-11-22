/**
 * HomePicks — Maximus's picks for the week.
 *
 * A recommended pick is a specific book's line and price that beats the
 * market's fair number. The section shows the highest-conviction ones as
 * tickets (see HomePickCard). It never pads the list: if the engine
 * recommends two picks, two are shown. Everything else on the board is a
 * lean: tracked and graded, never recommended.
 *
 *   variant="home"  up to five tickets and one line for the record
 *   variant="full"  every recommended pick with its reasons, then every game
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { fetchNflGames, fetchNflScorecard } from '../../../api/nfl';
import NflLogo from '../NflLogo';
import HomePickCard from './HomePickCard';
import { Matchup } from './NflTeamTag';
import { SectionHead, Rail, ScoreRing, ModelMarketBars, Chevron } from './HomeParts';
import { fmtOdds, kickoffShort } from './format';
import h from './home.module.css';

const ENDPOINT = '/api/nfl/picks/built';
const HOME_MAX = 5;
const LEAN_MAX = 6;
const MARKET = { moneyline: 'To win', runline: 'Spread', total: 'Total' };
/** Why a game is held to tracking. A plain "no price edge" needs no chip. */
const HELD_BACK = {
  qb_uncertain: 'Quarterback in doubt',
  injury_feed_down: 'No injury report',
  stale_price: 'Stale price',
  price_outlier: 'Price out of line',
  outside_window: 'Opens 3 days out',
  price_guard: 'Extreme price',
  thin_market: 'Few books',
  data_gap: 'Thin data',
};

const score = (p) => p?.conviction?.score ?? Math.round((p?.betScore?.total || 0) * 100);
/** Highest conviction first; expected value breaks ties. */
const byConviction = (a, b) => (score(b) - score(a)) || ((b.ev || 0) - (a.ev || 0));

function pickedTeam(p) {
  const m = p.matchup || {};
  return p.selection?.side === 'home' ? m.homeTeam : p.selection?.side === 'away' ? m.awayTeam : null;
}

/**
 * Why this pick, in the engine's own words. Every pick carries a full
 * sentence (`why`) and a few words (`whyShort`). Picks locked before those
 * fields existed fall back to what the headline says after the pick label.
 */
function headlineReason(p) {
  const lean = (p.rationale?.headline || '').match(/^Model lean: .*?\. (.+)$/);
  return lean ? lean[1] : '';
}
const whyOf = (p) => p?.why || p?.rationale?.why || headlineReason(p);
const whyShortOf = (p) => p?.whyShort || p?.rationale?.whyShort || whyOf(p);
const sentence = (t) => (t && !/[.!?]$/.test(t) ? `${t}.` : t);

function recordText(r) {
  if (!r) return null;
  const n = (r.won || 0) + (r.lost || 0) + (r.push || 0);
  if (n === 0) return null;
  return r.push > 0 ? `${r.won}-${r.lost}-${r.push}` : `${r.won}-${r.lost}`;
}

function Reasons({ pick }) {
  const bullets = pick.rationale?.bullets || [];
  if (bullets.length === 0) return null;
  return (
    <details className={`${h.why} ${h.whyInCard}`}>
      <summary>All the numbers behind it</summary>
      {(pick.why || pick.rationale?.why) && <p>{pick.why || pick.rationale.why}</p>}
      <ul>{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
    </details>
  );
}

/** A lean, shown on the home page only when nothing is recommended. */
function LeanTile({ pick, to }) {
  const m = pick.matchup || {};
  const team = pickedTeam(pick);
  return (
    <Link to={to} className={h.tile} role="listitem">
      <div className={h.pickTop}>
        <span className={h.chipRow}>
          <span className={h.chip}>{MARKET[pick.market?.type] || 'Pick'}</span>
          <span className={h.chip}>Lean</span>
          {HELD_BACK[pick.lowSignalReason] && (
            <span className={`${h.chip} ${h.chipWarn}`}>{HELD_BACK[pick.lowSignalReason]}</span>
          )}
        </span>
        <ScoreRing value={score(pick)} small />
      </div>
      <div>
        <div className={h.team}>
          {team && <NflLogo slug={team.slug} src={team.logo} size={24} />}
          <span className={h.pickLabel}>{pick.selection?.label}</span>
        </div>
        <div className={h.pickGame}>
          <Matchup away={m.awayTeam} home={m.homeTeam} size={14} />
          <span>{kickoffShort(m.startTime)}</span>
        </div>
      </div>
      <ModelMarketBars model={pick.modelProb} market={pick.impliedProb} />
      {whyShortOf(pick) && <p className={h.pickWhy}>{sentence(whyShortOf(pick))}</p>}
    </Link>
  );
}

/** Every market on the board, one expandable block per game. */
function EveryGame({ picks, recommendedIds }) {
  const games = new Map();
  for (const p of picks) {
    if (!games.has(p.gameId)) games.set(p.gameId, []);
    games.get(p.gameId).push(p);
  }
  const order = { runline: 0, moneyline: 1, total: 2 };
  const blocks = [...games.values()].sort((a, b) =>
    Date.parse(a[0].matchup?.startTime || 0) - Date.parse(b[0].matchup?.startTime || 0));
  return (
    <div className={h.gameList}>
      {blocks.map((rows) => {
        const m = rows[0].matchup || {};
        const flag = HELD_BACK[rows.find((r) => r.lowSignalReason)?.lowSignalReason];
        const picked = rows.some((r) => recommendedIds.has(r.id));
        const best = [...rows].sort((a, b) =>
          (recommendedIds.has(b.id) - recommendedIds.has(a.id)) || byConviction(a, b))[0];
        return (
          <details key={rows[0].gameId} className={`${h.card} ${h.cardFlush}`}>
            <summary className={h.leanHead}>
              <span>
                <span className={h.teamName}><Matchup away={m.awayTeam} home={m.homeTeam} size={18} /></span>
                <span className={h.leanSub}>
                  <span className={h.small}>{kickoffShort(m.startTime)}</span>
                  {picked && <span className={`${h.chip} ${h.chipUp}`}>Recommended</span>}
                  {!picked && flag && <span className={`${h.chip} ${h.chipWarn}`}>{flag}</span>}
                </span>
              </span>
              {picked
                ? <span className={h.leanBest}>{best.selection?.label}</span>
                : <span className={h.leanNone}>Leans only</span>}
              <span className={h.leanCaret}><Chevron size={12} /></span>
            </summary>
            {[...rows].sort((a, b) => (order[a.market?.type] ?? 9) - (order[b.market?.type] ?? 9)).map((p) => {
              const team = pickedTeam(p);
              return (
                <div key={p.id} className={h.leanRow}>
                  <span className={h.small}>{MARKET[p.market?.type]}</span>
                  <span className={h.leanPick}>
                    {team && <NflLogo slug={team.slug} src={team.logo} size={18} />}
                    {p.selection?.label}
                    {recommendedIds.has(p.id) && <span className={`${h.chip} ${h.chipUp}`}>{p.displayMetrics?.edgeValue || 'Recommended'}</span>}
                  </span>
                  <span className={h.leanNum}>
                    {p.market?.type !== 'moneyline' && fmtOdds(p.market?.priceAmerican)}
                    {p.book?.title && <span className={h.small}> {p.book.title}</span>}
                  </span>
                  <span className={h.leanScore} aria-label={`Conviction ${score(p)}`}>{score(p)}</span>
                  {whyOf(p) && <span className={h.leanWhy}>{sentence(whyOf(p))}</span>}
                </div>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}

export default function HomePicks({ variant = 'home', games: gamesProp, weekLabel }) {
  const full = variant === 'full';
  const { buildPath } = useWorkspace();
  const [board, setBoard] = useState(undefined);
  const [card, setCard] = useState(null);
  const [ownGames, setOwnGames] = useState(null);
  const insights = buildPath('/insights');
  const needGames = gamesProp === undefined;

  useEffect(() => {
    let cancelled = false;
    fetch(ENDPOINT)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setBoard(d || null); })
      .catch(() => { if (!cancelled) setBoard(null); });
    fetchNflScorecard().then((d) => { if (!cancelled) setCard(d); });
    if (needGames) fetchNflGames().then((d) => { if (!cancelled) setOwnGames(d?.games || []); });
    return () => { cancelled = true; };
  }, [needGames]);

  const games = gamesProp ?? ownGames ?? [];
  const gameById = new Map(games.map((g) => [String(g.gameId), g]));
  const gameFor = (p) => gameById.get(String(p.gameId)) || null;

  const tiers = board?.tiers || {};
  const recommended = [...(tiers.tier1 || []), ...(tiers.tier2 || []), ...(tiers.tier3 || [])].sort(byConviction);
  const recommendedIds = new Set(recommended.map((p) => p.id));
  const leans = (board?.fullSlatePicks || board?.coverage || [])
    .filter((p) => !recommendedIds.has(p.id))
    .sort(byConviction);
  const total = recommended.length + leans.length;
  const shown = full ? recommended : recommended.slice(0, HOME_MAX);
  const week = weekLabel || (board?.week ? `Week ${board.week}` : null);
  const title = week ? `Maximus’s picks for ${week}` : 'Maximus’s picks for the week';

  const cards = shown.length > 0 && (
    <div className={`${h.picks} ${shown.length === 1 ? h.picksOne : shown.length === 2 || shown.length === 4 ? h.picksTwo : ''}`} role="list">
      {shown.map((p, i) => (
        <HomePickCard
          key={p.id}
          pick={p}
          game={gameFor(p)}
          rank={i + 1}
          to={full ? undefined : insights}
          asOf={board?.generatedAt}
        >
          {full && <Reasons pick={p} />}
        </HomePickCard>
      ))}
    </div>
  );

  const nothingYet = (
    <div className={h.empty}>
      <b>{total === 0 ? `No picks yet for ${week || 'this week'}` : 'Nothing recommended right now'}</b>
      {total === 0
        ? 'Picks are recommended and locked inside three days of kickoff, once enough books have posted lines.'
        : 'No book is beating the market’s fair price by enough to recommend a bet. A pick shows up here the moment one does.'}
    </div>
  );

  if (full) {
    return (
      <>
        <section className={h.section} aria-label="Recommended picks">
          <SectionHead title={title} countBelow count={recommended.length > 0 ? `${recommended.length} ${recommended.length === 1 ? 'pick' : 'picks'}, ranked by conviction` : null} />
          {board === undefined ? <div className={h.skeleton} aria-busy="true" /> : (cards || nothingYet)}
        </section>

        {total > 0 && (
          <section className={h.section} aria-label="Every game">
            <SectionHead title="Every game" />
            <p className={h.sectionNote}>
              Open a game for its spread, winner and total, each with the best price on the board and
              a conviction score out of 100. Only the picks marked with an expected value beat the market’s
              fair price. The rest are the ratings’ leans: saved and graded, never recommended.
            </p>
            <EveryGame picks={board.fullSlatePicks || [...recommended, ...leans]} recommendedIds={recommendedIds} />
          </section>
        )}
      </>
    );
  }

  const season = recordText(card?.season?.record);
  const recent = recordText(card?.record);
  const picked = recordText(card?.byPickRole?.hero);
  const showLeans = recommended.length === 0 && leans.length > 0;

  return (
    <section className={h.section} aria-label={title}>
      <SectionHead
        title={title}
        countBelow
        count={recommended.length > 0 ? `${shown.length} ${shown.length === 1 ? 'pick' : 'picks'}, ranked by conviction` : null}
        to={insights}
        moreLabel="All picks and results"
      />

      {board === undefined ? <div className={h.skeleton} aria-busy="true" /> : (cards || nothingYet)}

      {showLeans && (
        <>
          <p className={h.sectionNote}>
            These are the ratings’ strongest leans in the meantime. They are tracked and graded, not recommended.
          </p>
          <Rail label="Leans" cap={6}>
            {leans.slice(0, LEAN_MAX).map((p) => <LeanTile key={p.id} pick={p} to={insights} />)}
          </Rail>
        </>
      )}

      {recommended.length > 0 && recommended.length < 3 && (
        <p className={h.sectionNote}>
          {recommended.length === 1 ? 'One pick clears' : 'Two picks clear'} the bar this week. A pick is only
          recommended when a book’s price beats the market’s fair price by 1.5% or more, so some weeks are short.
        </p>
      )}

      {(season || recent) ? (
        <Link to={insights} className={h.recordLine}>
          {recent && <span><b>{recent}</b> last 9 days</span>}
          {picked && <span><b>{picked}</b> recommended</span>}
          {season && <span><b>{season}</b> season</span>}
        </Link>
      ) : card !== null && recommended.length > 0 ? (
        <p className={h.fine}>
          No results yet. Each pick is locked at its line, price and book, then graded against the final score and the closing line.
        </p>
      ) : null}
    </section>
  );
}
