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
 *   variant="full"  every recommended pick with its reasons, then a call on
 *                   every game (see HomeEveryGame)
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { fetchNflGames, fetchNflPicksInPlay, fetchNflScorecard } from '../../../api/nfl';
import NflLogo from '../NflLogo';
import HomePickCard from './HomePickCard';
import HomeInPlay from './HomeInPlay';
import { Matchup } from './NflTeamTag';
import { SectionHead, Rail, ScoreRing, ModelMarketBars } from './HomeParts';
import { kickoffShort } from './format';
import HomeEveryGame from './HomeEveryGame';
import { MARKET, HELD_BACK, score, byConviction, pickedTeam, whyShortOf, sentence, freeLeans } from './pickHelpers';
import { useAuth } from '../../../context/AuthContext';
import { GateStart } from '../../common/GatedContent';
import { trackSignupCtaClicked } from '../../../analytics/onboarding';
import h from './home.module.css';
import { trackPicksBoardView } from '../../../analytics/sportEvents';

const ENDPOINT = '/api/nfl/picks/built';
const HOME_MAX = 5;
const LEAN_MAX = 6;
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
function LeanTile({ pick, to, onClick }) {
  const m = pick.matchup || {};
  const team = pickedTeam(pick);
  return (
    <Link to={to} className={h.tile} role="listitem" onClick={onClick}>
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

export default function HomePicks({ variant = 'home', games: gamesProp, weekLabel }) {
  const full = variant === 'full';
  const { buildPath } = useWorkspace();
  const { user, loading: authLoading } = useAuth();
  const guest = !user && !authLoading;
  const [board, setBoard] = useState(undefined);
  const [card, setCard] = useState(null);
  const [inPlay, setInPlay] = useState([]);
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
    if (!full) fetchNflPicksInPlay().then((d) => { if (!cancelled) setInPlay(d?.picks || []); });
    if (needGames) fetchNflGames().then((d) => { if (!cancelled) setOwnGames(d?.games || []); });
    return () => { cancelled = true; };
  }, [needGames, full]);

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
  // Signed out, the picks page opens with three calls: the recommended picks, topped up with the strongest leans.
  const free = full && guest ? freeLeans(leans, recommended, 3) : [];
  const gameCount = new Set((board?.fullSlatePicks || [...recommended, ...leans]).map((p) => p.gameId)).size;
  const signupHref = `/settings?next=${encodeURIComponent(insights)}`;
  const shown = full ? recommended : recommended.slice(0, HOME_MAX);
  const week = weekLabel || (board?.week ? `Week ${board.week}` : null);
  const title = week ? `Maximus’s picks for ${week}` : 'Maximus’s picks for the week';

  // One picks_board_view per mount, once the board has loaded with something on it.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current || !board || total === 0) return;
    viewTracked.current = true;
    trackPicksBoardView({
      sport: 'nfl',
      surface: full ? 'nfl_picks' : 'nfl_home',
      recommended: recommended.length,
      leans: leans.length,
    });
  }, [board, total, full, recommended.length, leans.length]);

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
          {/* Signed out, the wall sits right under this section: a short placeholder would put the wall on the first screen before any pick. */}
          {board === undefined
            ? <div className={h.skeleton} style={guest || authLoading ? { minHeight: '70vh' } : undefined} aria-busy="true" />
            : (cards || (free.length > 0 ? null : nothingYet))}
          {free.length > 0 && (
            <>
              <p className={h.sectionNote}>
                {recommended.length > 0
                  ? `The ratings’ strongest ${free.length === 1 ? 'lean' : 'leans'} in the other markets. Tracked and graded, not recommended.`
                  : 'No price clears the bar for a recommendation right now. These are the ratings’ strongest leans, tracked and graded.'}
              </p>
              <div className={h.picksStack} role="list">
                {free.map((p) => (
                  <LeanTile key={p.id} pick={p} to={signupHref} onClick={() => trackSignupCtaClicked({ placement: 'free_lean', sport: 'nfl' })} />
                ))}
              </div>
            </>
          )}
        </section>

        {guest && total > 0 && (
          <GateStart
            title={gameCount > 1 ? `See the call on all ${gameCount} games` : 'See the call on every game'}
            sub="Create a free account for every spread, total and moneyline this week, the reasons behind each, and the graded record."
            freePicks={recommended.length + free.length}
          />
        )}

        {total > 0 && (
          <HomeEveryGame
            picks={board.fullSlatePicks || [...recommended, ...leans]}
            valueFloor={board.meta?.model?.evThresholds?.thin}
            recommendBar={board.meta?.model?.evThresholds?.tier3}
          />
        )}
      </>
    );
  }

  const season = recordText(card?.season?.record);
  const recent = recordText(card?.record);
  const picked = recordText(card?.byPickRole?.hero);
  const showLeans = recommended.length === 0 && leans.length > 0 && inPlay.length === 0;
  // A pick leaves the board at kickoff, so the week's count is the board plus what has kicked off.
  const liveCount = inPlay.filter((p) => p.gameStatus === 'live').length;
  const doneCount = inPlay.length - liveCount;
  const weekCount = recommended.length + inPlay.length;
  const countText = weekCount === 0 ? null : [
    `${weekCount} ${weekCount === 1 ? 'pick' : 'picks'} this week`,
    [recommended.length ? `${recommended.length} to play` : null, liveCount ? `${liveCount} live` : null, doneCount ? `${doneCount} final` : null]
      .filter(Boolean).join(', '),
  ].filter(Boolean).join(': ');
  const inPlayFirst = liveCount > 0;

  return (
    <section className={h.section} aria-label={title}>
      <SectionHead
        title={title}
        countBelow
        count={countText}
        to={insights}
        moreLabel="All picks and results"
      />

      {/* One pick to come and picks already played: side by side on a wide screen. */}
      <div className={shown.length === 1 && inPlay.length > 0 ? h.picksPair : h.picksStack}>
        {inPlayFirst && <HomeInPlay picks={inPlay} />}

        {board === undefined
          ? <div className={h.skeleton} aria-busy="true" />
          : (cards || (inPlay.length > 0 ? null : nothingYet))}

        {!inPlayFirst && <HomeInPlay picks={inPlay} />}
      </div>

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

      {weekCount > 0 && weekCount < 3 && (
        <p className={h.sectionNote}>
          {weekCount === 1 ? 'One pick clears' : 'Two picks clear'} the bar this week. A pick is only
          recommended when a book’s price beats the market’s fair price by 1.5% or more, so some weeks are short.
        </p>
      )}

      {(season || recent) ? (
        <Link to={insights} className={h.recordLine}>
          {recent && <span><b>{recent}</b> last 9 days</span>}
          {picked && <span><b>{picked}</b> recommended</span>}
          {season && <span><b>{season}</b> season</span>}
        </Link>
      ) : card !== null && recommended.length > 0 && inPlay.length === 0 ? (
        <p className={h.fine}>
          No results yet. Each pick is locked at its line, price and book, then graded against the final score and the closing line.
        </p>
      ) : null}
    </section>
  );
}
