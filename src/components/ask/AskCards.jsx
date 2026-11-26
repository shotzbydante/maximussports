/**
 * Ask Maximus cards — the web renderer for the cards the server sends
 * with each answer (api/_lib/ask/cards.js).
 *
 * Nothing here computes a number. Every line, price and score is printed
 * as stored; the only thing worked out on the client is how old it is.
 */

import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import NflLogo from '../nfl/NflLogo';
import { fmtLine, fmtOdds, kickoffShort, stampShort } from '../nfl/home/format';
import { startProCheckout, PRO_PRICE_TEXT } from '../../features/account/upgrade';
import { PLAN_LIMITS } from '../../lib/entitlements';
import { track } from '../../analytics/index';
import AskEmailGate from './AskEmailGate';
import a from './ask.module.css';

const MARKET = { runline: 'Spread', moneyline: 'Moneyline', total: 'Over/under' };
const STALE_AFTER_MS = 15 * 60 * 1000;

const VERDICT = {
  won: { text: 'Won', tone: 'up' },
  lost: { text: 'Lost', tone: 'down' },
  push: { text: 'Push', tone: 'flat' },
  ahead: { text: 'Ahead', tone: 'up' },
  behind: { text: 'Behind', tone: 'down' },
  level: { text: 'Level', tone: 'flat' },
};

function Team({ team, size = 18 }) {
  if (!team) return null;
  return (
    <span className={a.team}>
      <NflLogo slug={team.slug} size={size} />
      <span>{team.name}</span>
    </span>
  );
}

function matchupPath(card) {
  return card.away?.slug && card.home?.slug ? `/nfl/games/${card.away.slug}-at-${card.home.slug}` : null;
}

const isOld = (card, now) => card.asOf && card.game?.status !== 'final' && card.status !== 'final' && now - card.asOf > STALE_AFTER_MS;

/** "Lines as of Sun 1:04 PM PST", with a refresh once the numbers are old. */
function AsOf({ card, now, onAsk, what = 'Lines' }) {
  if (!card.asOf) return null;
  const old = card.stale || isOld(card, now);
  return (
    <span className={a.asOf}>
      {what} as of {stampShort(new Date(card.asOf).toISOString())}
      {old && onAsk && card.away && card.home && (
        <button type="button" className={a.refresh} onClick={() => onAsk(`Latest on ${card.away.name} at ${card.home.name}`, 'refresh')}>
          May have moved. Ask again
        </button>
      )}
    </span>
  );
}

function Check() {
  return (
    <span className={a.check} aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Lock() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="9" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const PickCard = memo(function PickCard({ card, now, onAsk, onOpen }) {
  const side = card.side === 'home' ? card.home : card.side === 'away' ? card.away : null;
  const price = card.market === 'moneyline'
    ? (card.book ? `at ${card.book}` : '')
    : [fmtOdds(card.price), card.book ? `at ${card.book}` : ''].filter(Boolean).join(' ');
  const verdict = card.standing ? VERDICT[card.standing.verdict] : null;
  const started = !!card.game;
  const hasScore = started && card.away?.score != null && card.home?.score != null;
  const to = matchupPath(card);
  return (
    <article className={`${a.card} ${a.pick} ${card.recommended ? '' : a.lean}`}>
      <div className={a.pickTop}>
        <span className={a.kind}>
          {card.recommended ? <Check /> : null}
          {card.recommended ? MARKET[card.market] || 'Pick' : `Lean, ${(MARKET[card.market] || 'pick').toLowerCase()}`}
        </span>
        {verdict
          ? <span className={`${a.verdict} ${a[verdict.tone]}`}>{verdict.text}</span>
          : card.conviction != null && (
            <span className={a.conviction} role="img" aria-label={`Conviction ${card.conviction} out of 100`}>
              <b>{card.conviction}</b> conviction
            </span>
          )}
      </div>

      <p className={a.call}>
        {side && <NflLogo slug={side.slug} size={26} />}
        <span className={a.callLabel}>{card.label}</span>
        {price && <span className={a.callPrice}>{price}</span>}
      </p>

      <p className={a.where}>
        <Team team={card.away} /> <span className={a.at}>at</span> <Team team={card.home} />
        <span className={a.when}>
          {hasScore
            ? `${card.away.abbrev} ${card.away.score}, ${card.home.abbrev} ${card.home.score}${card.game.status === 'final' ? ', final' : card.game.clock ? `, ${card.game.clock}` : ''}`
            : [kickoffShort(card.startTime), card.network].filter(Boolean).join(', ')}
        </span>
      </p>

      {card.standing?.text && <p className={a.standing}>{card.standing.text}</p>}
      {card.why && <p className={a.why}>{card.why}</p>}

      <div className={a.foot}>
        <span className={a.facts}>
          {card.ev && <b>{card.ev} expected value{card.lockedAt ? ' at lock' : ''}</b>}
          {card.lockedAt && <span>Locked {kickoffShort(card.lockedAt)}</span>}
          {!started && <AsOf card={card} now={now} onAsk={onAsk} what="Price" />}
          {started && card.game.status !== 'final' && <AsOf card={card} now={now} onAsk={onAsk} what="Score" />}
        </span>
        {to && <Link to={to} className={a.more} onClick={() => onOpen?.(card)}>Full matchup</Link>}
      </div>
    </article>
  );
});

function ScoreRow({ team, score, lead }) {
  return (
    <div className={`${a.gRow} ${lead ? a.gLead : ''}`}>
      <Team team={team} size={22} />
      {team?.record && <span className={a.gRecord}>{team.record}</span>}
      <span className={a.gScore}>{score ?? ''}</span>
    </div>
  );
}

const GameCard = memo(function GameCard({ card, now, onAsk, onOpen }) {
  const played = card.status !== 'upcoming';
  const state = card.status === 'final' ? 'Final' : card.status === 'live' ? (card.clock || 'Live') : kickoffShort(card.startTime);
  const to = matchupPath(card);
  const hs = card.home?.score;
  const as = card.away?.score;
  return (
    <article className={`${a.card} ${a.game}`}>
      <div className={a.pickTop}>
        <span className={`${a.kind} ${card.status === 'live' ? a.live : ''}`}>{state}</span>
        <span className={a.when}>{[card.network, card.conditions].filter(Boolean).join(', ')}</span>
      </div>
      <ScoreRow team={card.away} score={played ? as : null} lead={played && as > hs} />
      <ScoreRow team={card.home} score={played ? hs : null} lead={played && hs > as} />
      <dl className={a.lines}>
        <div><dt>Spread</dt><dd>{card.spreadHome != null ? `${card.home.abbrev} ${fmtLine(card.spreadHome)}` : 'Off the board'}</dd></div>
        <div><dt>Total</dt><dd>{card.total ?? 'Off the board'}</dd></div>
        <div><dt>Moneyline {card.away?.abbrev}/{card.home?.abbrev}</dt><dd>{card.moneyline ? `${fmtOdds(card.moneyline.away)} / ${fmtOdds(card.moneyline.home)}` : 'Off the board'}</dd></div>
      </dl>
      <div className={a.foot}>
        <span className={a.facts}>
          {card.books ? <span>Consensus of {card.books} books</span> : null}
          <AsOf card={card} now={now} onAsk={onAsk} what={played ? 'Score' : 'Lines'} />
        </span>
        {to && <Link to={to} className={a.more} onClick={() => onOpen?.(card)}>Full matchup</Link>}
      </div>
    </article>
  );
});

function Best({ label, pick, line }) {
  if (!pick) return <div className={a.bestCell}><dt>{label}</dt><dd className={a.none}>No price</dd></div>;
  return (
    <div className={a.bestCell}>
      <dt>{label}</dt>
      <dd><b>{line ? `${line} ` : ''}{fmtOdds(pick.price)}</b><span>{pick.book}</span></dd>
    </div>
  );
}

const PricesCard = memo(function PricesCard({ card, now, onAsk }) {
  const b = card.best || {};
  const { away, home } = card;
  const best = (cell, value) => (cell && cell.book === value ? a.bestMark : '');
  return (
    <article className={`${a.card} ${a.prices}`}>
      <div className={a.pickTop}>
        <span className={a.kind}><Team team={away} /> <span className={a.at}>at</span> <Team team={home} /></span>
        <span className={a.when}>{kickoffShort(card.startTime)}</span>
      </div>
      <p className={a.pricesTitle}>Best number at {card.rows.length} books</p>
      <dl className={a.bestGrid}>
        <Best label={`${away.abbrev} spread`} pick={b.spreadAway} line={b.spreadAway ? fmtLine(b.spreadAway.line) : ''} />
        <Best label={`${home.abbrev} spread`} pick={b.spreadHome} line={b.spreadHome ? fmtLine(b.spreadHome.line) : ''} />
        <Best label="Over" pick={b.over} line={b.over?.line} />
        <Best label="Under" pick={b.under} line={b.under?.line} />
        <Best label={`${away.abbrev} to win`} pick={b.moneylineAway} />
        <Best label={`${home.abbrev} to win`} pick={b.moneylineHome} />
      </dl>
      <details className={a.books}>
        <summary>Every book</summary>
        <div className={a.tableWrap}>
          <table>
            <thead>
              <tr><th scope="col">Book</th><th scope="col">{home.abbrev} spread</th><th scope="col">Total</th><th scope="col">{away.abbrev} / {home.abbrev}</th></tr>
            </thead>
            <tbody>
              {card.rows.map((r) => (
                <tr key={r.book}>
                  <th scope="row">{r.book}</th>
                  <td className={best(b.spreadHome, r.book) || best(b.spreadAway, r.book)}>{r.spread ? `${fmtLine(r.spread.home)} (${fmtOdds(r.spread.homePrice)})` : ''}</td>
                  <td className={best(b.over, r.book) || best(b.under, r.book)}>{r.total ? r.total.line : ''}</td>
                  <td className={best(b.moneylineAway, r.book) || best(b.moneylineHome, r.book)}>{r.moneyline ? `${fmtOdds(r.moneyline.away)} / ${fmtOdds(r.moneyline.home)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className={a.foot}>
        <span className={a.facts}><span>Best line first, then best price</span><AsOf card={card} now={now} onAsk={onAsk} what="Prices" /></span>
      </div>
    </article>
  );
});

/** "Nov 17" from a YYYY-MM-DD slate date, without shifting it across time zones. */
function dayShort(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const units = (u) => (u == null ? null : `${u > 0 ? '+' : ''}${u} units`);

const RecordCard = memo(function RecordCard({ card }) {
  return (
    <article className={`${a.card} ${a.record}`}>
      <p className={a.recordTitle}>{card.title}</p>
      {card.rows.map((r) => (
        <div key={r.label} className={a.recordRow}>
          <span className={a.recordSpan}>{r.label}</span>
          <b className={a.recordNum}>{r.won}-{r.lost}{r.push ? `-${r.push}` : ''}</b>
          <span className={`${a.recordUnits} ${r.units > 0 ? a.up : r.units < 0 ? a.down : ''}`}>{units(r.units)}</span>
          {r.beatClosePct != null && <span className={a.recordNote}>Beat the closing line {r.beatClosePct}% of the time</span>}
        </div>
      ))}
      <div className={a.foot}>
        <span className={a.facts}>{card.lastGraded && <span>Graded through {dayShort(card.lastGraded)}</span>}</span>
        <Link to="/record" className={a.more}>Every result</Link>
      </div>
    </article>
  );
});

const whole = (v) => `${Math.round(v * 100)}%`;

const TeamCard = memo(function TeamCard({ card, onOpen }) {
  const tiles = [
    card.powerRank != null && ['Power rank', `${card.powerRank} of 32`],
    card.projectedWins != null && ['Projected wins', card.projectedWins],
    card.playoffPct != null && ['Playoffs', whole(card.playoffPct)],
    card.titleOdds != null && ['Super Bowl', fmtOdds(card.titleOdds)],
  ].filter(Boolean);
  return (
    <article className={`${a.card} ${a.teamCard}`}>
      <div className={a.teamHead}>
        <NflLogo slug={card.team.slug} size={34} />
        <p>
          <b>{card.team.name}</b>
          <span>{[card.record, card.division && card.divisionRank ? `${ordinal(card.divisionRank)} in the ${card.division}` : card.division].filter(Boolean).join(', ')}</span>
        </p>
      </div>
      <dl className={a.tiles}>
        {tiles.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <div className={a.foot}>
        <span className={a.facts}><span>Projections from Maximus’s season simulation</span></span>
        <Link to={`/nfl/teams/${card.team.slug}`} className={a.more} onClick={() => onOpen?.(card)}>Team page</Link>
      </div>
    </article>
  );
});

function ordinal(n) {
  return `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;
}

const NewsCard = memo(function NewsCard({ card }) {
  return (
    <article className={`${a.card} ${a.news}`}>
      <ul>
        {card.items.map((h) => (
          <li key={h.url}>
            <a href={h.url} target="_blank" rel="noopener noreferrer nofollow">{h.title}</a>
            <span>{[h.source, h.time].filter(Boolean).join(', ')}</span>
          </li>
        ))}
      </ul>
    </article>
  );
});

/** What a signed-out visitor has not been shown, and the one field that opens it. */
const LockedCard = memo(function LockedCard({ card, guestPass }) {
  const n = card.count;
  return (
    <article className={`${a.card} ${a.locked}`}>
      <div className={a.lockedHead}>
        <Lock />
        <p className={a.lockedText}>
          <b>{n} more {n === 1 ? 'call' : 'calls'}{card.games ? ` across ${card.games} ${card.games === 1 ? 'game' : 'games'}` : ''} this week</b>
          <span>{guestPass
            ? 'Confirm your email and every spread, total and moneyline opens here, with the reasons.'
            : 'A free account opens every spread, total and moneyline, with the reasons and the model’s projection.'}</span>
        </p>
      </div>
      {!guestPass && <AskEmailGate placement="ask_locked_card" cta="Open every call" />}
    </article>
  );
});

const PRO_COPY = {
  shop_prices: {
    title: 'Pro shops every book for you',
    body: 'Maximus lines up every sportsbook’s spread, total and moneyline for a game and shows where the best number is.',
  },
};

/** The Pro offer. Shown by the server only when a free account asked for something Pro includes. */
const UpgradeCard = memo(function UpgradeCard({ card, userId, placement = 'ask_pro_card' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = PRO_COPY[card.reason] || PRO_COPY.shop_prices;
  async function upgrade() {
    if (busy) return;
    setBusy(true);
    setError('');
    track('ask_upgrade_clicked', { sport: 'nfl', surface: placement, reason: card.reason });
    const result = await startProCheckout({ placement, userId });
    if (!result.ok) { setBusy(false); setError(result.message); }
  }
  return (
    <article className={`${a.card} ${a.pro}`}>
      <p className={a.proText}>
        <b>{copy.title}</b>
        <span>{copy.body} Pro also asks up to {PLAN_LIMITS.pro.askDailyMessages} questions a day and emails each pick the moment it locks.</span>
      </p>
      {error && <p className={a.gateError} role="alert">{error}</p>}
      <button type="button" className={a.proBtn} onClick={upgrade} disabled={busy}>
        {busy ? 'Opening checkout…' : `Go Pro, ${PRO_PRICE_TEXT}`}
      </button>
    </article>
  );
});

/** Follow-up suggestions. Tapping one sends it as an ordinary message. */
export function Chips({ items = [], onAsk, disabled, source = 'followup' }) {
  if (!items.length) return null;
  return (
    <div className={a.chips}>
      {items.map((text) => (
        <button key={text} type="button" className={a.chipBtn} disabled={disabled} onClick={() => onAsk(text, source)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export { UpgradeCard };

export default function AskCards({ cards = [], now, onAsk, onOpen, disabled, last, userId, guestPass }) {
  const shown = cards.filter((c) => c.type !== 'chips');
  const chips = cards.find((c) => c.type === 'chips');
  if (shown.length === 0 && !chips) return null;
  const ask = disabled ? null : onAsk;
  return (
    <>
      {shown.length > 0 && (
        <div className={a.cards}>
          {shown.map((card) => {
            if (card.type === 'pick') return <PickCard key={card.id} card={card} now={now} onAsk={ask} onOpen={onOpen} />;
            if (card.type === 'game') return <GameCard key={card.id} card={card} now={now} onAsk={ask} onOpen={onOpen} />;
            if (card.type === 'prices') return <PricesCard key={card.id} card={card} now={now} onAsk={ask} />;
            if (card.type === 'record') return <RecordCard key={card.id} card={card} />;
            if (card.type === 'team') return <TeamCard key={card.id} card={card} onOpen={onOpen} />;
            if (card.type === 'news') return <NewsCard key={card.id} card={card} />;
            // The offers belong to the newest answer only: an old one would ask again for what was already given.
            if (card.type === 'locked') return last ? <LockedCard key={card.id} card={card} guestPass={guestPass} /> : null;
            if (card.type === 'upgrade') return last ? <UpgradeCard key={card.id} card={card} userId={userId} /> : null;
            return null;
          })}
        </div>
      )}
      {/* Only the newest answer offers follow-ups; older ones would be stale suggestions. */}
      {last && chips && <Chips items={chips.items} onAsk={onAsk} disabled={disabled} />}
    </>
  );
}
