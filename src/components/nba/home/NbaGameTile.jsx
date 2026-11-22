/**
 * NbaGameTile — one game in the home page rail, opening with the aerial
 * flyover of the arena.
 *
 * Before tip-off: each team with its spread and moneyline, then the total.
 * Live and final: the score, with the pregame line underneath.
 */

import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { NbaLogo, TeamTag } from './NbaTeamTag';
import { fmtLine, fmtOdds, nbaNickname, statusText, tipShort } from './nbaFormat';
import VenueFlyover from '../../shared/VenueFlyover';
import h from '../../nfl/home/home.module.css';

function Status({ game }) {
  const gs = game.gameState || {};
  if (gs.isLive) {
    return <span className={`${h.chip} ${h.chipLive}`}><span className={h.dot} aria-hidden="true" />{statusText(game)}</span>;
  }
  if (gs.isFinal) return <span>{statusText(game)}</span>;
  return <span>{tipShort(game.startTime) || 'Scheduled'}</span>;
}

function Team({ team, to }) {
  const label = nbaNickname(team?.slug) || team?.name || 'TBD';
  return (
    <span className={h.team}>
      <NbaLogo slug={team?.slug} src={team?.logo} size={24} />
      {to
        ? <Link to={to} className={h.teamName}>{label}</Link>
        : <span className={h.teamName}>{label}</span>}
      {team?.record && <span className={h.teamRecord}>{team.record}</span>}
    </span>
  );
}

export default function NbaGameTile({ game, pick }) {
  const { buildPath } = useWorkspace();
  const { teams, gameState: gs = {}, market = {}, broadcast } = game;
  const away = teams?.away;
  const home = teams?.home;
  const showScore = gs.isLive || gs.isFinal;
  const spread = market.pregameSpread;
  const ml = market.moneyline || {};
  const teamPath = (t) => (t?.slug ? buildPath(`/teams/${t.slug}`) : null);

  return (
    <article className={h.tile} role="listitem">
      <VenueFlyover sport="nba" game={game} variant="tile" surface="nba_home_tile" />
      <div className={h.gameTop}>
        <Status game={game} />
        {pick
          ? <span className={`${h.chip} ${h.chipUp}`}>Pick: {pick.selection?.label}</span>
          : broadcast?.network && <span>{broadcast.network}</span>}
      </div>

      {showScore ? (
        <div className={`${h.gameGrid} ${h.gameGridScore}`}>
          <Team team={away} to={teamPath(away)} />
          <span className={`${h.score} ${gs.isFinal && (away?.score ?? 0) < (home?.score ?? 0) ? h.scoreLose : ''}`}>{away?.score ?? ''}</span>
          <Team team={home} to={teamPath(home)} />
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
        <span>{market.pregameTotal != null ? <>Total <b>{market.pregameTotal}</b></> : (showScore ? '' : 'No total posted')}</span>
        {showScore
          ? spread != null && <span>{gs.isLive ? 'Live line' : 'Line'} <b><TeamTag slug={home?.slug} logo={home?.logo} label="abbrev" size={14} /> {fmtLine(spread)}</b></span>
          : market.booksCount > 0 && <span>{market.booksCount} books</span>}
      </div>
    </article>
  );
}
