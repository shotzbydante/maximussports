/**
 * HomePickCard — one of Maximus's picks for the week, laid out like a ticket.
 *
 * Top to bottom: who is playing (away on the left, home on the right) and
 * where; the spread, price to win and total as quoted by the book the pick
 * is at, with the time of that quote; the pick itself; and one sentence on
 * why, written from the picks engine's numbers.
 */

import { Link } from 'react-router-dom';
import { getNflTeamBySlug } from '../../../sports/nfl/teams';
import NflLogo from '../NflLogo';
import { TeamTag } from './NflTeamTag';
import { fmtLine, fmtOdds, kickoffShort, stampShort } from './format';
import { pickSummary } from './pickSummary';
import h from './home.module.css';

const MARKET = { moneyline: 'Moneyline', runline: 'Spread', total: 'Over/under' };

function Check() {
  return (
    <span className={h.callCheck} aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Side({ team, role }) {
  const info = getNflTeamBySlug(team?.slug);
  return (
    <div className={h.side}>
      <NflLogo slug={team?.slug} src={team?.logo} size={48} />
      <span className={h.sideName}>{info?.nickname || team?.name || 'TBD'}</span>
      {team?.record && <span className={h.sideMeta}>{team.record}</span>}
      <span className={`${h.role} ${role === 'home' ? h.roleHome : ''}`}>
        {role === 'home' && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.5 5.5 6 1.75l4.5 3.75V10.5h-3V7.5h-3v3h-3z" fill="currentColor" />
          </svg>
        )}
        {role === 'home' ? 'Home' : 'Away'}
      </span>
    </div>
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
    source: market.booksCount ? `Consensus of ${market.booksCount} books` : 'Consensus',
    at: null,
    spreadHome: market.pregameSpread ?? null,
    spreadPrice: null,
    moneyline: market.moneyline || null,
    total: market.pregameTotal ?? null,
    totalPrice: null,
  };
}

function Lines({ pick, game, away, home, asOf }) {
  const q = quoteFor(pick, game);
  if (!q) return null;
  const on = pick.market?.type;
  const favHome = (q.spreadHome ?? 0) <= 0;
  const fav = favHome ? home : away;
  const favLine = q.spreadHome == null ? null : (favHome ? q.spreadHome : -q.spreadHome);
  const favPrice = q.spreadPrice ? (favHome ? q.spreadPrice.home : q.spreadPrice.away) : null;
  const cell = (type) => `${h.line} ${on === type ? h.lineOn : ''}`;
  const stamp = stampShort(q.at || asOf);

  return (
    <>
      <div className={h.lines}>
        <div className={cell('runline')}>
          <span className={h.lineLabel}>Spread</span>
          {favLine != null ? (
            <>
              <span className={h.lineValue}><TeamTag slug={fav?.slug} logo={fav?.logo} label="abbrev" size={14} /> {fmtLine(favLine)}</span>
              {favPrice != null && <span className={h.lineSub}>{fmtOdds(favPrice)}</span>}
            </>
          ) : <span className={h.lineSub}>Not posted</span>}
        </div>
        <div className={cell('moneyline')}>
          <span className={h.lineLabel}>Moneyline</span>
          {q.moneyline ? (
            <>
              <span className={h.lineValue}><TeamTag slug={away?.slug} logo={away?.logo} label="abbrev" size={14} /> {fmtOdds(q.moneyline.away)}</span>
              <span className={h.lineValue}><TeamTag slug={home?.slug} logo={home?.logo} label="abbrev" size={14} /> {fmtOdds(q.moneyline.home)}</span>
            </>
          ) : <span className={h.lineSub}>Not posted</span>}
        </div>
        <div className={cell('total')}>
          <span className={h.lineLabel}>Over/under</span>
          {q.total != null ? (
            <>
              <span className={h.lineValue}>{q.total}</span>
              {q.totalPrice && (
                <span className={h.lineSub}>O {fmtOdds(q.totalPrice.over)}<br />U {fmtOdds(q.totalPrice.under)}</span>
              )}
            </>
          ) : <span className={h.lineSub}>Not posted</span>}
        </div>
      </div>
      <p className={h.source}>
        Lines from {q.source}{stamp ? `, ${q.at ? 'updated' : 'as of'} ${stamp}` : ''}.
      </p>
    </>
  );
}

export default function HomePickCard({ pick, game, rank, to, asOf, children }) {
  const m = pick.matchup || {};
  const away = m.awayTeam;
  const home = m.homeTeam;
  const venue = game?.venue || {};
  // The engine's own venue wins when it has one: it knows where a neutral-site game is really played.
  const env = game?.engine?.env || {};
  const place = [env.venue || venue.name || m.venue, env.city || [venue.city, venue.state].filter(Boolean).join(', ')]
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
  // A reason stored with the pick by the engine is the one that was locked; otherwise build it from the same numbers.
  const summary = pick.why || pickSummary(pick, game);

  return (
    <article className={h.pick} role="listitem">
      <div className={h.pickHead}>
        <span className={h.chipRow}>
          {rank != null && <span className={h.rank} aria-label={`Pick ${rank}`}>{rank}</span>}
          <span className={h.chip}>{MARKET[pick.market?.type] || 'Pick'}</span>
        </span>
        <span>{[kickoffShort(m.startTime), m.network || game?.broadcast?.network].filter(Boolean).join(', ')}</span>
      </div>

      <div className={h.matchup}>
        <Side team={away} role="away" />
        <span className={h.at}>at</span>
        <Side team={home} role="home" />
      </div>
      {place && (
        <p className={h.venue}>
          <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden="true">
            <path d="M5.5 12.25s4.25-3.6 4.25-7A4.25 4.25 0 0 0 1.25 5.25c0 3.4 4.25 7 4.25 7Z" stroke="currentColor" strokeWidth="1.25" />
            <circle cx="5.5" cy="5.25" r="1.5" fill="currentColor" />
          </svg>
          {place}
        </p>
      )}

      <Lines pick={pick} game={game} away={away} home={home} asOf={asOf} />

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
          {ev && <b>{ev} expected value</b>}
          {pick.lock?.lockedAt && <span>Locked {stampShort(pick.lock.lockedAt)}</span>}
        </span>
        {to && <Link to={to} className={h.footLink}>Full breakdown</Link>}
      </div>
    </article>
  );
}
