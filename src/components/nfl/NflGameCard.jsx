/**
 * NflGameCard — one NFL game: status, score, the market's numbers and the
 * model's numbers side by side.
 */

import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import NflLogo from './NflLogo';
import s from './nfl.module.css';
import { trackOutboundClick } from '../../analytics/sportEvents';
import VenueFlyover from '../shared/VenueFlyover';

function fmtLine(v) {
  if (v == null) return '—';
  return v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`;
}
function fmtOdds(v) {
  if (v == null) return null;
  return v > 0 ? `+${v}` : `${v}`;
}

/** Kickoff in the viewer's own time zone, e.g. "Sun 10:00 AM PST". */
function kickoffLabel(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).replace(',', '');
  } catch { return ''; }
}

function StatusPill({ game }) {
  const gs = game.gameState || {};
  if (gs.isLive) {
    return (
      <span className={`${s.pill} ${s.pillLive}`}>
        <span className={s.liveDot} aria-hidden />
        {gs.periodLabel || 'Live'}
      </span>
    );
  }
  if (gs.isFinal) return <span className={`${s.pill} ${s.pillFinal}`}>{gs.isOvertime ? 'Final/OT' : 'Final'}</span>;
  if (game.status === 'postponed') return <span className={`${s.pill} ${s.pillWarn}`}>Postponed</span>;
  return <span className={s.pill}>{kickoffLabel(game.startTime) || game.displayTime || 'Scheduled'}</span>;
}

function TeamRow({ team, isWinner, isLoser, hasBall, showScore, to }) {
  return (
    <div className={s.gameTeam}>
      <span className={s.gameLogo}><NflLogo slug={team?.slug} src={team?.logo} size={28} /></span>
      <span className={s.gameTeamName}>
        {to
          ? <Link to={to}>{team?.name || 'TBD'}</Link>
          : <span>{team?.name || 'TBD'}</span>}
        {team?.record && <span className={s.gameRecord}>{team.record}</span>}
        {hasBall && <span className={s.possession} title="Has possession" aria-label="Has possession" />}
      </span>
      {showScore && (
        <span className={`${s.gameScore} ${isLoser ? s.gameLoser : ''}`} aria-label={isWinner ? 'Winner' : undefined}>
          {team?.score ?? ''}
        </span>
      )}
    </div>
  );
}

/** One line: players ruled out on each side, and any quarterback flag. */
function InjuryLine({ game }) {
  const { injuries, teams, gameState: gs = {} } = game;
  if (!injuries || gs.isFinal) return null;
  const count = (side) => (injuries[side]?.out || 0) + (injuries[side]?.doubtful || 0);
  const away = count('away');
  const home = count('home');
  const qbs = [
    ...(injuries.away?.quarterbacks || []).map((q) => `${teams.away.abbrev} QB ${q.name} ${String(q.status).toLowerCase()}`),
    ...(injuries.home?.quarterbacks || []).map((q) => `${teams.home.abbrev} QB ${q.name} ${String(q.status).toLowerCase()}`),
  ];
  if (away + home === 0 && qbs.length === 0) return null;
  return (
    <p className={s.gameInjuries}>
      <span className={s.gameInjuriesLabel}>Out or doubtful</span>
      {' '}{teams.away.abbrev} {away} · {teams.home.abbrev} {home}
      {qbs.length > 0 && <span className={s.gameInjuriesFlag}>{qbs.join(' · ')}</span>}
    </p>
  );
}

export default function NflGameCard({ game }) {
  const { buildPath } = useWorkspace();
  if (!game) return null;

  const { teams, gameState: gs = {}, market = {}, model = {}, insight, links, broadcast } = game;
  const home = teams?.home;
  const away = teams?.away;
  const showScore = gs.isLive || gs.isFinal;
  const homeWon = gs.isFinal && (home?.score ?? 0) > (away?.score ?? 0);
  const awayWon = gs.isFinal && (away?.score ?? 0) > (home?.score ?? 0);

  const hasSpread = market.pregameSpread != null;
  const hasTotal = market.pregameTotal != null;
  const ml = market.moneyline;
  const winProb = model.homeWinProb;
  const favoured = winProb != null ? (winProb >= 0.5 ? home : away) : null;
  const favouredPct = winProb != null ? Math.round(Math.max(winProb, 1 - winProb) * 100) : null;

  return (
    <article className={`${s.gameCard} ${gs.isLive ? s.gameCardLive : ''}`}>
      <VenueFlyover sport="nfl" game={game} surface="nfl_game_card" />
      <div className={s.gameTop}>
        <StatusPill game={game} />
        <span className={s.gameTopRight}>
          {broadcast?.network && <span>{broadcast.network}</span>}
        </span>
      </div>

      <div className={s.gameTeams}>
        <TeamRow
          team={away} showScore={showScore} isWinner={awayWon} isLoser={homeWon}
          hasBall={gs.isLive && gs.possession === 'away'}
          to={away?.slug ? buildPath(`/teams/${away.slug}`) : null}
        />
        <TeamRow
          team={home} showScore={showScore} isWinner={homeWon} isLoser={awayWon}
          hasBall={gs.isLive && gs.possession === 'home'}
          to={home?.slug ? buildPath(`/teams/${home.slug}`) : null}
        />
      </div>

      {gs.isLive && gs.downDistance && (
        <div className={s.gameSituation}>
          {gs.downDistance}{gs.isRedZone ? ' · Red zone' : ''}
        </div>
      )}

      {(hasSpread || hasTotal || ml) && (
        <div className={s.gameLines}>
          <div className={s.lineCell}>
            <span className={s.lineLabel}>Spread</span>
            <span className={s.lineValue}>{hasSpread ? `${home?.abbrev} ${fmtLine(market.pregameSpread)}` : '—'}</span>
            {model.fairSpread != null && !gs.isFinal && (
              <span className={s.lineSub}>Model {home?.abbrev} {fmtLine(model.fairSpread)}</span>
            )}
          </div>
          <div className={s.lineCell}>
            <span className={s.lineLabel}>Total</span>
            <span className={s.lineValue}>{hasTotal ? market.pregameTotal : '—'}</span>
            {model.fairTotal != null && !gs.isFinal && (
              <span className={s.lineSub}>Model {model.fairTotal.toFixed(1)}</span>
            )}
          </div>
          <div className={s.lineCell}>
            <span className={s.lineLabel}>Moneyline</span>
            <span className={s.lineValue}>
              {ml?.away != null && ml?.home != null ? `${fmtOdds(ml.away)} / ${fmtOdds(ml.home)}` : '—'}
            </span>
            {favoured && !gs.isFinal && (
              <span className={s.lineSub}>Model {favoured.abbrev} {favouredPct}%</span>
            )}
          </div>
        </div>
      )}

      {insight?.summary && <p className={s.gameInsight}>{insight.summary}</p>}

      <InjuryLine game={game} />

      {links?.gamecastUrl && (
        <div className={s.gameFoot}>
          <span className={s.muted}>{game.venue?.name || ''}</span>
          <a
            href={links.gamecastUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackOutboundClick({ sport: 'nfl', surface: 'nfl_game_card', destination: 'espn_gamecast' })}
          >
            ESPN Gamecast ↗
          </a>
        </div>
      )}
    </article>
  );
}
