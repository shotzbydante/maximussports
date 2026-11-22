/**
 * NbaGameCard — one NBA game on the games page: the aerial flyover of the
 * arena, status, score, the market's three numbers, and our call on the
 * game with its reason. The same card the NFL games page uses, with NBA
 * data behind it.
 */

import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import VenueFlyover from '../shared/VenueFlyover';
import { NbaLogo } from './home/NbaTeamTag';
import { fmtLine, fmtOdds, statusText, tipLong } from './home/nbaFormat';
import { isMaximusPick, nbaPickSummary } from './home/nbaPickHelpers';
import { trackOutboundClick } from '../../analytics/sportEvents';
import s from '../nfl/nfl.module.css';

function StatusPill({ game }) {
  const gs = game.gameState || {};
  if (gs.isLive) {
    return (
      <span className={`${s.pill} ${s.pillLive}`}>
        <span className={s.liveDot} aria-hidden />
        {statusText(game)}
      </span>
    );
  }
  if (gs.isFinal) return <span className={`${s.pill} ${s.pillFinal}`}>{statusText(game)}</span>;
  return <span className={s.pill}>{tipLong(game.startTime) || 'Scheduled'}</span>;
}

function TeamRow({ team, isLoser, showScore, to }) {
  return (
    <div className={s.gameTeam}>
      <span className={s.gameLogo}><NbaLogo slug={team?.slug} src={team?.logo} size={28} /></span>
      <span className={s.gameTeamName}>
        {to
          ? <Link to={to}>{team?.name || 'TBD'}</Link>
          : <span>{team?.name || 'TBD'}</span>}
        {team?.record && <span className={s.gameRecord}>{team.record}</span>}
      </span>
      {showScore && <span className={`${s.gameScore} ${isLoser ? s.gameLoser : ''}`}>{team?.score ?? ''}</span>}
    </div>
  );
}

/** `call` is the strongest pick or lean on this game from the picks board, if any. */
export default function NbaGameCard({ game, call }) {
  const { buildPath } = useWorkspace();
  if (!game) return null;

  const { teams, gameState: gs = {}, market = {}, links, broadcast } = game;
  const home = teams?.home;
  const away = teams?.away;
  const showScore = gs.isLive || gs.isFinal;
  const homeWon = gs.isFinal && (home?.score ?? 0) > (away?.score ?? 0);
  const awayWon = gs.isFinal && (away?.score ?? 0) > (home?.score ?? 0);
  const hasSpread = market.pregameSpread != null;
  const hasTotal = market.pregameTotal != null;
  const ml = market.moneyline;
  const why = call ? nbaPickSummary(call) : '';

  return (
    <article className={`${s.gameCard} ${gs.isLive ? s.gameCardLive : ''}`}>
      <VenueFlyover sport="nba" game={game} surface="nba_game_card" />
      <div className={s.gameTop}>
        <StatusPill game={game} />
        <span className={s.gameTopRight}>
          {broadcast?.network && <span>{broadcast.network}</span>}
        </span>
      </div>

      <div className={s.gameTeams}>
        <TeamRow team={away} showScore={showScore} isLoser={homeWon} to={away?.slug ? buildPath(`/teams/${away.slug}`) : null} />
        <TeamRow team={home} showScore={showScore} isLoser={awayWon} to={home?.slug ? buildPath(`/teams/${home.slug}`) : null} />
      </div>

      {(hasSpread || hasTotal || ml) && (
        <div className={s.gameLines}>
          <div className={s.lineCell}>
            <span className={s.lineLabel}>Spread</span>
            <span className={s.lineValue}>{hasSpread ? `${home?.abbrev} ${fmtLine(market.pregameSpread)}` : '—'}</span>
          </div>
          <div className={s.lineCell}>
            <span className={s.lineLabel}>Total</span>
            <span className={s.lineValue}>{hasTotal ? market.pregameTotal : '—'}</span>
          </div>
          <div className={s.lineCell}>
            <span className={s.lineLabel}>Moneyline</span>
            <span className={s.lineValue}>
              {ml?.away != null && ml?.home != null ? `${fmtOdds(ml.away)} / ${fmtOdds(ml.home)}` : '—'}
            </span>
          </div>
        </div>
      )}

      {call && !gs.isFinal && (
        <p className={s.gameInsight}>
          <b>{isMaximusPick(call) ? 'Maximus’s pick' : 'Lean'}: {call.selection?.label}.</b>{why ? ` ${why}` : ''}
        </p>
      )}

      <div className={s.gameFoot}>
        <span className={s.muted}>
          {[game.venue?.name, gs.isLive && (hasSpread || hasTotal) ? 'Lines are live' : null, !showScore && market.booksCount ? `${market.booksCount} books` : null].filter(Boolean).join(' · ')}
        </span>
        <span className={s.gameFootLinks}>
          {links?.gamecastUrl && (
            <a
              href={links.gamecastUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackOutboundClick({ sport: 'nba', surface: 'nba_game_card', destination: 'espn_gamecast' })}
            >
              ESPN Gamecast ↗
            </a>
          )}
        </span>
      </div>
    </article>
  );
}
