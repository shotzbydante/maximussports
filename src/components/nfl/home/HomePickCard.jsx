/**
 * HomePickCard — one of Maximus's picks for the week, laid out like a ticket.
 *
 * Built to fit on a phone screen with room to spare. Top to bottom: the two
 * teams as rows (away first, home marked) with the spread, moneyline and
 * over/under beside them, as quoted by the book the pick is at; one line
 * for where and in what weather; the pick itself; and one sentence on why,
 * from the picks engine.
 */

import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { getNflTeamBySlug } from '../../../sports/nfl/teams';
import NflLogo from '../NflLogo';
import { fmtLine, fmtOdds, kickoffShort, stampShort } from './format';
import { ticketSummary } from './pickSummary';
import h from './home.module.css';
import { trackPickOpen } from '../../../analytics/sportEvents';

const MARKET = { moneyline: 'Moneyline', runline: 'Spread', total: 'Over/under' };

/** "Sat 8:02 PM": the lock time, short enough to share a line with what the value is now. */
function lockStamp(iso) {
  try { return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(',', ''); } catch { return ''; }
}

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
  const info = getNflTeamBySlug(team?.slug);
  return (
    <span className={h.tTeam}>
      <NflLogo slug={team?.slug} src={team?.logo} size={26} />
      <span className={h.tTeamText}>
        <span className={h.tName}>{info?.nickname || team?.name || 'TBD'}</span>
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

/**
 * The three markets for this game as one book quotes them. Falls back to
 * the multi-book consensus when that book is missing from the feed.
 */
function quoteFor(pick, game) {
  const market = game?.market || {};
  const wanted = pick.lock?.book || pick.book?.title;
  const book = (market.books || []).find((b) => b.title === wanted || b.key === pick.book?.key);
  if (book) {
    return {
      source: book.title,
      at: book.lastUpdate || book.total?.lastUpdate || book.spread?.lastUpdate || null,
      spreadHome: book.spread?.homeLine ?? null,
      spreadPrice: book.spread ? { home: book.spread.homePrice, away: book.spread.awayPrice } : null,
      moneyline: book.h2h ? { home: book.h2h.home, away: book.h2h.away } : null,
      total: book.total?.line ?? null,
      totalPrice: book.total ? { over: book.total.overPrice, under: book.total.underPrice } : null,
    };
  }
  if (market.pregameSpread == null && market.pregameTotal == null && !market.moneyline) return null;
  return {
    source: market.booksCount ? `a consensus of ${market.booksCount} books` : 'the market consensus',
    at: null,
    spreadHome: market.pregameSpread ?? null,
    spreadPrice: null,
    moneyline: market.moneyline || null,
    total: market.pregameTotal ?? null,
    totalPrice: null,
  };
}

/**
 * Two team rows against three columns of lines, the way a sportsbook lays
 * a game out. The one cell the pick is on is outlined.
 */
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

export default function HomePickCard({ pick, game, rank, to, asOf, children }) {
  const m = pick.matchup || {};
  const away = m.awayTeam;
  const home = m.homeTeam;
  const venue = game?.venue || {};
  // The engine's own venue wins when it has one: it knows where a neutral-site game is really played.
  const env = game?.engine?.env || {};
  const place = [env.venue || venue.name || m.venue, [venue.city || env.city, venue.state].filter(Boolean).join(', ')]
    .filter(Boolean).join(', ');
  const side = pick.selection?.side;
  const pickedTeam = side === 'home' ? home : side === 'away' ? away : null;
  const price = pick.lock?.price ?? pick.market?.priceAmerican;
  const book = pick.lock?.book || pick.book?.title;
  const priceText = pick.market?.type === 'moneyline'
    ? (book ? `at ${book}` : '')
    : [fmtOdds(price), book ? `at ${book}` : ''].filter(Boolean).join(' ');
  const score = pick.conviction?.score ?? Math.round((pick.betScore?.total || 0) * 100);
  const ev = pick.displayMetrics?.edgeValue;
  // One sentence, always. The engine's longer stored reason is shown with the full numbers on the picks page.
  const summary = ticketSummary(pick, game);
  // A locked pick keeps the value it had when it was locked; say so, and show where it stands now if that has moved.
  const lock = pick.lock || null;
  const q = quoteFor(pick, game);
  const stamp = stampShort(q?.at || asOf);
  const evPct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
  const evMoved = lock && typeof lock.evNow === 'number' && typeof lock.evAtLock === 'number'
    && Math.abs(lock.evNow - lock.evAtLock) >= 0.005;
  // Roof and forecast, when the engine has them for this game.
  const conditions = env.indoor === true
    ? 'Indoors'
    : env.indoor === false
      ? ['Outdoors', env.wind != null ? `${Math.round(env.wind)} mph wind` : null, env.temp != null ? `${Math.round(env.temp)}°F` : null]
        .filter(Boolean).join(', ')
      : '';

  return (
    <article className={h.pick} role="listitem">
      <div className={h.pickHead}>
        <span className={h.chipRow}>
          {rank != null && <span className={h.rank} aria-label={`Pick ${rank}`}>{rank}</span>}
          <span className={h.chip}>{MARKET[pick.market?.type] || 'Pick'}</span>
        </span>
        <span>{[kickoffShort(m.startTime), m.network || game?.broadcast?.network].filter(Boolean).join(', ')}</span>
      </div>

      <Board pick={pick} q={q} away={away} home={home} />

      <p className={h.tMeta}>
        {[place, conditions].filter(Boolean).join('. ')}
        {(place || conditions) && q ? '. ' : ''}
        {q ? `Lines from ${q.source}${stamp ? `, ${q.at ? 'updated' : 'as of'} ${stamp}` : ''}.` : ''}
      </p>

      <div className={h.call}>
        <Check />
        <div className={h.callMain}>
          <span className={h.callLabel}>
            {pickedTeam && <NflLogo slug={pickedTeam.slug} src={pickedTeam.logo} size={26} />}
            {pick.selection?.label}
          </span>
          {priceText && <span className={h.callPrice}>{priceText}</span>}
        </div>
        <div className={h.callScore} role="img" aria-label={`Conviction ${score} out of 100`}>
          <b>{score}</b>
          <span>conviction</span>
        </div>
      </div>

      {summary && <p className={h.logic}>{summary}</p>}
      {children}

      <div className={h.pickFoot}>
        <span className={h.footFacts}>
          {ev && <b>{ev} expected value{lock ? ' at lock' : ''}</b>}
          {lock?.lockedAt && (
            <span>Locked {lockStamp(lock.lockedAt)}{evMoved ? `, now ${evPct(lock.evNow)}` : ''}</span>
          )}
        </span>
        {to && (
          <Link to={to} className={h.footLink} onClick={() => trackPickOpen({ sport: 'nfl', surface: 'nfl_home', pick, rank })}>
            Full breakdown
          </Link>
        )}
      </div>
    </article>
  );
}
