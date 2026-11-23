/**
 * NbaPicks — Maximus's picks for tonight.
 *
 * The section shows the engine's highest-conviction calls as tickets (see
 * NbaPickCard), up to five on the home page, always with the team picks
 * (spreads) among them. It never pads the list: if the engine has two
 * picks, two are shown. Everything else on the board is a
 * lean: tracked and graded, not a pick.
 *
 *   variant="home"  up to five tickets, picks already in play, the record
 *   variant="full"  every pick with its numbers, then a call on every game
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { fetchNbaGames, fetchNbaPicks, fetchNbaScorecard } from '../../../api/nba';
import NbaPickCard from './NbaPickCard';
import NbaInPlay from './NbaInPlay';
import NbaEveryGame from './NbaEveryGame';
import { NbaLogo, Matchup, TeamText } from './NbaTeamTag';
import { SectionHead, Rail, ScoreRing } from '../../nfl/home/HomeParts';
import { tipShort } from './nbaFormat';
import { HELD_BACK, MARKET, leanPicks, nbaPickSummary, pickedTeam, recordText, score, splitByStart, topPicksWithTeams } from './nbaPickHelpers';
import { trackPicksBoardView } from '../../../analytics/sportEvents';
import h from '../../nfl/home/home.module.css';

const HOME_MAX = 5;
const LEAN_MAX = 6;

/** The engine's own numbers behind a pick, opened on demand on the picks page. */
function Numbers({ pick }) {
  const rows = [];
  const t = pick.totalDebug;
  if (pick.market?.type === 'total' && t) {
    if (t.fairTotal != null) rows.push(`Projected total ${Math.round(t.fairTotal * 10) / 10}, against ${t.marketTotal}.`);
    for (const [form, side] of [[pick.awayTeamForm, pick.matchup?.awayTeam], [pick.homeTeamForm, pick.matchup?.homeTeam]]) {
      if (form?.sample > 0) {
        rows.push(`${side?.shortName || ''}: last ${form.sample} ${form.sample === 1 ? 'game' : 'games'}, ${Math.round(form.recentScoringAvg)} scored and ${Math.round(form.recentAllowedAvg)} allowed a game.`);
      }
    }
  }
  if (pick.model?.dataQuality != null) rows.push(`Data quality ${Math.round(pick.model.dataQuality * 100)} out of 100. There is no injury report in the model yet.`);
  if (rows.length === 0) return null;
  return (
    <details className={`${h.why} ${h.whyInCard}`}>
      <summary>The numbers behind it</summary>
      <ul>{rows.map((r) => <li key={r}><TeamText text={r} abbrev size={14} /></li>)}</ul>
    </details>
  );
}

/** A lean, shown on the home page only when there are no picks. */
function LeanTile({ pick, to }) {
  const m = pick.matchup || {};
  const team = pickedTeam(pick);
  const why = nbaPickSummary(pick);
  return (
    <Link to={to} className={h.tile} role="listitem">
      <div className={h.pickTop}>
        <span className={h.chipRow}>
          <span className={h.chip}>{MARKET[pick.market?.type] || 'Pick'}</span>
          <span className={h.chip}>Lean</span>
          {HELD_BACK[pick.lowSignalReason] && <span className={`${h.chip} ${h.chipWarn}`}>{HELD_BACK[pick.lowSignalReason]}</span>}
        </span>
        <ScoreRing value={score(pick)} small />
      </div>
      <div>
        <div className={h.team}>
          {team && <NbaLogo slug={team.slug} src={team.logo} size={24} />}
          <span className={h.pickLabel}>{pick.selection?.label}</span>
        </div>
        <div className={h.pickGame}>
          <Matchup away={m.awayTeam} home={m.homeTeam} size={14} />
          <span>{tipShort(m.startTime)}</span>
        </div>
      </div>
      {why && <p className={h.pickWhy}>{why}</p>}
    </Link>
  );
}

export default function NbaPicks({ variant = 'home', games: gamesProp }) {
  const full = variant === 'full';
  const { buildPath } = useWorkspace();
  const [board, setBoard] = useState(undefined);
  const [card, setCard] = useState(undefined);
  const [ownGames, setOwnGames] = useState(null);
  const insights = buildPath('/insights');
  const needGames = gamesProp === undefined;

  useEffect(() => {
    let cancelled = false;
    fetchNbaPicks().then((d) => { if (!cancelled) setBoard(d || null); });
    fetchNbaScorecard().then((d) => { if (!cancelled) setCard(d || null); });
    if (needGames) fetchNbaGames().then((d) => { if (!cancelled) setOwnGames(d?.games || []); });
    return () => { cancelled = true; };
  }, [needGames]);

  const games = gamesProp ?? ownGames ?? [];
  const gameById = new Map(games.map((g) => [String(g.gameId), g]));
  const { toPlay, inPlay } = splitByStart(board, games);
  const leans = leanPicks(board).filter((p) => { const g = gameById.get(String(p.gameId)); return !g || g.status === 'upcoming'; });
  const shown = full ? toPlay : topPicksWithTeams(toPlay, HOME_MAX);
  const total = toPlay.length + leans.length;
  const title = 'Maximus’s picks for tonight';

  // One picks_board_view per mount, once the board has loaded with something on it.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current || !board || total === 0) return;
    viewTracked.current = true;
    trackPicksBoardView({ sport: 'nba', surface: full ? 'nba_picks' : 'nba_home', recommended: toPlay.length, leans: leans.length });
  }, [board, total, full, toPlay.length, leans.length]);

  const cards = shown.length > 0 && (
    <div className={`${h.picks} ${shown.length === 1 ? h.picksOne : shown.length === 2 || shown.length === 4 ? h.picksTwo : ''}`} role="list">
      {shown.map((p, i) => (
        <NbaPickCard
          key={p.id}
          pick={p}
          game={gameById.get(String(p.gameId)) || null}
          rank={i + 1}
          to={full ? undefined : insights}
          asOf={board?.generatedAt}
        >
          {full && <Numbers pick={p} />}
        </NbaPickCard>
      ))}
    </div>
  );

  const nothingYet = (
    <div className={h.empty}>
      <b>{total === 0 ? 'No picks yet for tonight' : 'No picks right now'}</b>
      {total === 0
        ? 'Picks appear once books have posted lines for the next slate, usually by late morning Eastern.'
        : 'Nothing on tonight’s board clears the bar for a pick. The leans are still tracked and graded.'}
    </div>
  );

  if (full) {
    return (
      <>
        <section className={h.section} aria-label="Maximus's picks">
          <SectionHead title={title} countBelow count={toPlay.length > 0 ? `${toPlay.length} ${toPlay.length === 1 ? 'pick' : 'picks'}, ranked by conviction` : null} />
          {board === undefined ? <div className={h.skeleton} aria-busy="true" /> : (cards || (inPlay.length > 0 ? null : nothingYet))}
          <NbaInPlay rows={inPlay} />
        </section>
        {total > 0 && <NbaEveryGame picks={[...toPlay, ...leans]} />}
      </>
    );
  }

  const liveCount = inPlay.filter((r) => r.game.status === 'live').length;
  const doneCount = inPlay.length - liveCount;
  const nightCount = toPlay.length + inPlay.length;
  const countText = nightCount === 0 ? null : [
    `${nightCount} ${nightCount === 1 ? 'pick' : 'picks'} tonight`,
    [toPlay.length ? `${toPlay.length} to play` : null, liveCount ? `${liveCount} live` : null, doneCount ? `${doneCount} final` : null].filter(Boolean).join(', '),
  ].filter(Boolean).join(': ');
  const inPlayFirst = liveCount > 0;
  const showLeans = toPlay.length === 0 && inPlay.length === 0 && leans.length > 0;

  const rolling = recordText(card?.rolling?.record || card?.totals?.record || card?.totals?.overall);
  const lastSlate = recordText(card?.scorecard?.record);

  return (
    <section className={h.section} aria-label={title}>
      <SectionHead title={title} countBelow count={countText} to={insights} moreLabel="All picks and results" />

      {inPlayFirst && <NbaInPlay rows={inPlay} />}

      {board === undefined
        ? <div className={h.skeleton} aria-busy="true" />
        : (cards || (inPlay.length > 0 ? null : nothingYet))}

      {!inPlayFirst && <NbaInPlay rows={inPlay} />}

      {showLeans && (
        <>
          <p className={h.sectionNote}>These are the board’s strongest leans in the meantime. They are tracked and graded, not picks.</p>
          <Rail label="Leans" cap={6}>
            {leans.slice(0, LEAN_MAX).map((p) => <LeanTile key={p.id} pick={p} to={insights} />)}
          </Rail>
        </>
      )}

      {(rolling || lastSlate) ? (
        <Link to={insights} className={h.recordLine}>
          {lastSlate && <span><b>{lastSlate}</b> last graded night</span>}
          {rolling && <span><b>{rolling}</b> recent</span>}
        </Link>
      ) : card !== undefined && nightCount > 0 ? (
        <p className={h.fine}>
          No graded results yet this season. Each pick is saved as published and graded against the final score.
        </p>
      ) : null}
    </section>
  );
}
