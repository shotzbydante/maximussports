/**
 * HomeGameTile — one game in the home page rail.
 *
 * Before kickoff: each team with its spread and moneyline, then the total
 * and the model's own line. Live and final: the score, with the closing
 * line underneath. A chip appears only when there is something to act on:
 * the model disagreeing with the market, or a quarterback ruled out.
 */

import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import NflLogo from '../NflLogo';
import { getNflTeamBySlug } from '../../../sports/nfl/teams';
import { fmtLine, fmtOdds, kickoffShort } from './format';
import h from './home.module.css';

const EDGE_CHIP_MIN = 2; // points of disagreement before the tile calls it out

function qbFlag(game) {
  const { injuries, teams } = game;
  if (!injuries) return null;
  const side = ['away', 'home'].find((k) => (injuries[k]?.quarterbacks || []).length > 0);
  if (!side) return null;
  const q = injuries[side].quarterbacks[0];
  return `${teams[side].abbrev} QB ${String(q.status || 'out').toLowerCase()}`;
}

function Status({ game }) {
  const gs = game.gameState || {};
  if (gs.isLive) {
    return <span className={`${h.chip} ${h.chipLive}`}><span className={h.dot} aria-hidden="true" />{gs.periodLabel || 'Live'}</span>;
  }
  if (gs.isFinal) return <span>{gs.isOvertime ? 'Final, overtime' : 'Final'}</span>;
  if (game.status === 'postponed') return <span className={`${h.chip} ${h.chipWarn}`}>Postponed</span>;
  return <span>{kickoffShort(game.startTime) || game.displayTime || 'Scheduled'}</span>;
}

function Team({ team, to, hasBall }) {
  const label = getNflTeamBySlug(team?.slug)?.nickname || team?.name || 'TBD';
  return (
    <span className={h.team}>
      <NflLogo slug={team?.slug} src={team?.logo} size={24} />
      {to
        ? <Link to={to} className={h.teamName}>{label}</Link>
        : <span className={h.teamName}>{label}</span>}
      {team?.record && <span className={h.teamRecord}>{team.record}</span>}
      {hasBall && <span className={h.ball} role="img" aria-label="Has the ball" />}
    </span>
  );
}

export default function HomeGameTile({ game }) {
  const { buildPath } = useWorkspace();
  const { teams, gameState: gs = {}, market = {}, model = {}, broadcast } = game;
  const away = teams?.away;
  const home = teams?.home;
  const showScore = gs.isLive || gs.isFinal;
  const spread = market.pregameSpread;
  const ml = market.moneyline || {};
  const edge = model.pregameEdge;
  const qb = !gs.isFinal ? qbFlag(game) : null;
  const leanTeam = edge != null && Math.abs(edge) >= EDGE_CHIP_MIN ? (edge > 0 ? home : away) : null;
  const teamPath = (t) => (t?.slug ? buildPath(`/teams/${t.slug}`) : null);

  let chip = null;
  if (qb) chip = <span className={`${h.chip} ${h.chipWarn}`}>{qb}</span>;
  else if (leanTeam && !showScore) chip = <span className={`${h.chip} ${h.chipUp}`}>Model likes {leanTeam.abbrev} by {Math.abs(edge).toFixed(1)}</span>;

  return (
    <article className={h.tile} role="listitem">
      <div className={h.gameTop}>
        <Status game={game} />
        {chip || (broadcast?.network && <span>{broadcast.network}</span>)}
      </div>

      {showScore ? (
        <div className={`${h.gameGrid} ${h.gameGridScore}`}>
          <Team team={away} to={teamPath(away)} hasBall={gs.isLive && gs.possession === 'away'} />
          <span className={`${h.score} ${gs.isFinal && (away?.score ?? 0) < (home?.score ?? 0) ? h.scoreLose : ''}`}>{away?.score ?? ''}</span>
          <Team team={home} to={teamPath(home)} hasBall={gs.isLive && gs.possession === 'home'} />
          <span className={`${h.score} ${gs.isFinal && (home?.score ?? 0) < (away?.score ?? 0) ? h.scoreLose : ''}`}>{home?.score ?? ''}</span>
        </div>
      ) : (
        <div className={h.gameGrid}>
          <span />
          <span className={h.colHead}>Spread</span>
          <span className={h.colHead}>To win</span>
          <Team team={away} to={teamPath(away)} />
          <span className={`${h.cellNum} ${h.cellBox}`}>{spread != null ? fmtLine(-spread) : '–'}</span>
          <span className={`${h.cellNum} ${h.cellBox}`}>{fmtOdds(ml.away) || '–'}</span>
          <Team team={home} to={teamPath(home)} />
          <span className={`${h.cellNum} ${h.cellBox}`}>{spread != null ? fmtLine(spread) : '–'}</span>
          <span className={`${h.cellNum} ${h.cellBox}`}>{fmtOdds(ml.home) || '–'}</span>
        </div>
      )}

      <div className={h.gameFoot}>
        {gs.isLive && gs.downDistance ? (
          <span>{gs.downDistance}{gs.isRedZone ? ', red zone' : ''}</span>
        ) : (
          <span>{market.pregameTotal != null ? <>Total <b>{market.pregameTotal}</b></> : 'No total posted'}</span>
        )}
        {showScore ? (
          spread != null && <span>Closed <b>{home?.abbrev} {fmtLine(spread)}</b></span>
        ) : (
          model.fairSpread != null && (
            <span>Model <b>{home?.abbrev} {fmtLine(model.fairSpread)}</b>{model.fairTotal != null ? <>, <b>{model.fairTotal.toFixed(1)}</b></> : null}</span>
          )
        )}
      </div>
    </article>
  );
}
