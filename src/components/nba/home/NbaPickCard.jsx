/**
 * NbaPickCard — one of Maximus's NBA picks, laid out like a ticket, the
 * same shape as the NFL one.
 *
 * Top to bottom: the two teams as rows (away first, home marked) with the
 * spread, moneyline and over/under beside them; one line for where the
 * game is and where the lines come from; the pick; and one sentence on why,
 * built from the engine's own numbers.
 *
 * The NBA feed carries a consensus across books, not each book's price, so
 * the ticket cites the consensus and when it was read.
 */

import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { NbaLogo } from './NbaTeamTag';
import { fmtLine, fmtOdds, nbaNickname, tipLong, tipShort } from './nbaFormat';
import { MARKET_NAME, linesFor, nbaPickSummary, score, totalSample } from './nbaPickHelpers';
import { trackPickOpen } from '../../../analytics/sportEvents';
import h from '../../nfl/home/home.module.css';

function Check() {
  return (
    <span className={h.callCheck} aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function TeamCell({ team, role }) {
  return (
    <span className={h.tTeam}>
      <NbaLogo slug={team?.slug} src={team?.logo} size={26} />
      <span className={h.tTeamText}>
        <span className={h.tName}>{nbaNickname(team?.slug) || team?.name || 'TBD'}</span>
        <span className={`${h.tSub} ${role === 'home' ? h.tSubHome : ''}`}>
          {role === 'home' && (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1.5 5.5 6 1.75l4.5 3.75V10.5h-3V7.5h-3v3h-3z" fill="currentColor" />
            </svg>
          )}
          <span className={h.tRole}>{role === 'home' ? 'Home' : 'Away'}</span>
          {team?.record && <span>{team.record}</span>}
        </span>
      </span>
    </span>
  );
}

function Board({ pick, q, away, home }) {
  const on = pick.market?.type;
  const side = pick.selection?.side;
  const cell = (type, rowSide) => {
    const picked = on === type && (type === 'total' ? (rowSide === 'away' ? side === 'over' : side === 'under') : side === rowSide);
    return `${h.tCell} ${picked ? h.tCellOn : ''}`;
  };
  const spread = (rowSide) => (q?.spreadHome == null ? '–' : fmtLine(rowSide === 'home' ? q.spreadHome : -q.spreadHome));
  const ml = (rowSide) => (q?.moneyline ? fmtOdds(q.moneyline[rowSide]) || '–' : '–');
  const total = (rowSide) => (q?.total == null ? '–' : `${rowSide === 'away' ? 'O' : 'U'} ${q.total}`);
  return (
    <div className={h.tBoard}>
      <span />
      <span className={h.tHead}>Spread</span>
      <span className={h.tHead}>Moneyline</span>
      <span className={h.tHead}>Total</span>
      {[['away', away], ['home', home]].map(([rowSide, team]) => (
        <Fragment key={rowSide}>
          <TeamCell team={team} role={rowSide} />
          <span className={cell('runline', rowSide)}>{spread(rowSide)}</span>
          <span className={cell('moneyline', rowSide)}>{ml(rowSide)}</span>
          <span className={cell('total', rowSide)}>{total(rowSide)}</span>
        </Fragment>
      ))}
    </div>
  );
}

export default function NbaPickCard({ pick, game, rank, to, asOf, children }) {
  const m = pick.matchup || {};
  // The games feed knows each team's record; the pick only knows who is playing.
  const away = { ...m.awayTeam, ...(game?.teams?.away || {}) };
  const home = { ...m.homeTeam, ...(game?.teams?.home || {}) };
  const venue = game?.venue || {};
  const place = [venue.name, [venue.city, venue.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const side = pick.selection?.side;
  const pickedTeam = side === 'home' ? home : side === 'away' ? away : null;
  const q = linesFor(pick, game);
  const stamp = tipLong(asOf);
  const source = q ? (q.books ? `the consensus of ${q.books} books` : 'the market consensus') : null;
  const summary = nbaPickSummary(pick);
  const sample = pick.market?.type === 'total' ? totalSample(pick) : null;
  const priceText = pick.market?.type === 'moneyline' ? 'at the consensus price' : 'at the consensus line';

  return (
    <article className={h.pick} role="listitem">
      <div className={h.pickHead}>
        <span className={h.chipRow}>
          {rank != null && <span className={h.rank} aria-label={`Pick ${rank}`}>{rank}</span>}
          <span className={h.chip}>{MARKET_NAME[pick.market?.type] || 'Pick'}</span>
        </span>
        <span>{[tipShort(m.startTime || game?.startTime), game?.broadcast?.network].filter(Boolean).join(', ')}</span>
      </div>

      <Board pick={pick} q={q} away={away} home={home} />

      <p className={h.tMeta}>
        {place}
        {place && source ? '. ' : ''}
        {source ? `Lines are ${source}${stamp ? `, as of ${stamp}` : ''}.` : ''}
      </p>

      <div className={h.call}>
        <Check />
        <div className={h.callMain}>
          <span className={h.callLabel}>
            {pickedTeam && <NbaLogo slug={pickedTeam.slug} src={pickedTeam.logo} size={26} />}
            {pick.selection?.label}
          </span>
          <span className={h.callPrice}>{priceText}</span>
        </div>
        <div className={h.callScore} role="img" aria-label={`Conviction ${score(pick)} out of 100`}>
          <b>{score(pick)}</b>
          <span>conviction</span>
        </div>
      </div>

      {summary && <p className={h.logic}>{summary}</p>}
      {children}

      <div className={h.pickFoot}>
        <span className={h.footFacts}>
          {sample != null && <span>Small sample: {sample === 1 ? '1 recent game' : `${sample} recent games`}</span>}
        </span>
        {to && (
          <Link to={to} className={h.footLink} onClick={() => trackPickOpen({ sport: 'nba', surface: 'nba_home', pick, rank })}>
            Full breakdown
          </Link>
        )}
      </div>
    </article>
  );
}
