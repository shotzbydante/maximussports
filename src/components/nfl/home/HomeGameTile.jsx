/**
 * HomeGameTile — one game in the home page rail.
 *
 * Before kickoff: each team with its spread and moneyline, then the total
 * and the ratings' own line. Live and final: the score, with the closing
 * line underneath. A chip appears only for what moves a price: a
 * quarterback ruled out, or strong wind at an outdoor stadium.
 */

import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import NflLogo from '../NflLogo';
import { TeamTag } from './NflTeamTag';
import { getNflTeamBySlug } from '../../../sports/nfl/teams';
import { fmtLine, fmtOdds, kickoffShort } from './format';
import h from './home.module.css';
import VenueFlyover from '../../shared/VenueFlyover';

const WIND_CHIP_MIN = 15; // mph: strong wind. The engine's wind ramp starts at 10 mph and is half way up here.

function qbFlag(game) {
  const { injuries, teams } = game;
  if (!injuries) return null;
  const side = ['away', 'home'].find((k) => (injuries[k]?.quarterbacks || []).length > 0);
  if (!side) return null;
  const q = injuries[side].quarterbacks[0];
  return { team: teams[side], text: `QB ${String(q.status || 'out').toLowerCase()}` };
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
  const qb = !gs.isFinal ? qbFlag(game) : null;
  const teamPath = (t) => (t?.slug ? buildPath(`/teams/${t.slug}`) : null);

  // Wind is the one condition the picks engine lets move a fair total.
  const env = game.engine?.env;
  const windy = !showScore && env && !env.indoor && env.wind >= WIND_CHIP_MIN;

  let chip = null;
  if (qb) chip = <span className={`${h.chip} ${h.chipWarn}`}><TeamTag slug={qb.team?.slug} logo={qb.team?.logo} label="abbrev" size={14} /> {qb.text}</span>;
  else if (windy) chip = <span className={h.chip}>Wind {Math.round(env.wind)} mph</span>;

  return (
    <article className={h.tile} role="listitem">
      <VenueFlyover sport="nfl" game={game} variant="tile" surface="nfl_home_tile" />
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

      {(() => {
        // A finished game often has no line left in the feed. Say how it ended, or say nothing.
        const noLine = market.pregameTotal == null && spread == null;
        const ending = gs.isFinal && game.insight?.headline && !/^final\.?$/i.test(game.insight.headline.trim()) ? game.insight.headline : null;
        if (gs.isFinal && noLine) return ending ? <div className={h.gameFoot}><span>{ending}</span></div> : null;
        return (
          <div className={h.gameFoot}>
            {gs.isLive && gs.downDistance ? (
              <span>{gs.downDistance}{gs.isRedZone ? ', red zone' : ''}</span>
            ) : (
              <span>{market.pregameTotal != null ? <>Total <b>{market.pregameTotal}</b></> : 'Total not posted yet'}</span>
            )}
            {showScore ? (
              spread != null && <span>{gs.isLive ? 'Live line' : 'Closed'} <b><TeamTag slug={home?.slug} logo={home?.logo} label="abbrev" size={14} /> {fmtLine(spread)}</b></span>
            ) : (
              model.fairSpread != null && (
                <span>Ratings <b><TeamTag slug={home?.slug} logo={home?.logo} label="abbrev" size={14} /> {fmtLine(Math.round(model.fairSpread * 10) / 10)}</b>{model.fairTotal != null ? <>, <b>{model.fairTotal.toFixed(1)}</b></> : null}</span>
              )
            )}
          </div>
        );
      })()}
    </article>
  );
}
