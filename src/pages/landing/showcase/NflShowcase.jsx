/**
 * NflShowcase — the product, shown on the guest landing page.
 *
 * Four pieces, each a light app surface on the dark page, each filled with
 * the real Week 11 examples in ./week11.js:
 *
 *   PickTicket    one game's calls as locked, with how each was graded
 *   EveryGame     the four ranked tabs from Odds Insights
 *   MatchupWindow unit against unit, and every position group, for that game
 *   WeekClock     when the board refreshes, locks and grades
 *
 * They are drawn for this page, not imported from the app, so the landing
 * page stays small and sends none of the app's own analytics events.
 */

import { useRef, useState } from 'react';
import { track } from '../../../analytics/index';
import { TEAMS, TICKET, EVERY_GAME, MATCHUP, CLOCK, WEEK } from './week11';
import s from './Showcase.module.css';

const hide = (e) => { e.currentTarget.style.visibility = 'hidden'; };

function Logo({ team, size = 22 }) {
  if (!team?.logo) return null;
  return <img src={team.logo} alt="" width={size} height={size} className={s.logo} loading="lazy" decoding="async" onError={hide} />;
}

/** The app's conviction ring. */
function Ring({ value, size = 44 }) {
  const stroke = size > 50 ? 5 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={s.ring} style={{ width: size, height: size }} role="img" aria-label={`Conviction ${value} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={s.ringTrack} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={s.ringFill} strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <span className={s.ringValue}>{value}</span>
    </span>
  );
}

/**
 * A light app surface on the dark page. No browser chrome and no address:
 * the surface is the product, not a picture of a browser. `flush` is for a
 * single card that fills the surface; without it the surface is a tray
 * that holds several cards.
 */
function Window({ children, flush = false }) {
  return <div className={`${s.window} ${flush ? s.windowFlush : s.windowTray}`}>{children}</div>;
}

/* ───────────────────────── Pick ticket ───────────────────────── */

function Check({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TicketSide({ team, role, won }) {
  const final = team.score != null;
  return (
    <div className={s.side}>
      <Logo team={team} size={44} />
      <span className={s.sideName}>{team.nickname}</span>
      {final
        ? <span className={`${s.sideScore} ${won ? '' : s.sideScoreLost}`}>{team.score}</span>
        : <span className={s.sideMeta}>{team.record}</span>}
      <span className={`${s.role} ${role === 'Home' ? s.roleHome : ''}`}>{role}</span>
    </div>
  );
}

/** One call on the ticket: what was locked, why, and how it was graded. */
function TicketCall({ call }) {
  const won = call.result === 'won';
  return (
    <li className={`${s.call} ${won ? s.callWon : ''}`}>
      <span className={s.check} aria-hidden="true"><Check /></span>
      <div className={s.callMain}>
        <span className={s.callPick}>
          {call.team && <Logo team={TEAMS[call.team]} size={22} />}
          {call.pick}
        </span>
        <span className={s.callPrice}>{call.market}, {call.price} at {call.book}</span>
      </div>
      {won && <span className={s.won}><Check size={12} /> Won</span>}
      <p className={s.callWhy}>
        <span className={s.chip}>Lean</span> {call.why} <b>{call.graded}</b>
      </p>
    </li>
  );
}

export function PickTicket() {
  const t = TICKET;
  const final = t.status === 'Final';
  const awayWon = final && t.away.score > t.home.score;
  const label = `${t.away.nickname} at ${t.home.nickname}${final ? `, final ${t.away.score} to ${t.home.score}` : ''}: ${t.calls.map((c) => `${c.pick} ${c.result}`).join(', ')}`;
  return (
    <Window flush>
      <article className={s.ticket} aria-label={label}>
        <div className={s.ticketTop}>
          <TicketSide team={t.away} role="Away" won={awayWon} />
          <div className={s.at}>
            {final && <span className={s.atFinal}>Final</span>}
            <span className={final ? s.atNet : s.atWhen}>{t.kickoff}</span>
            <span className={s.atNet}>{t.network}</span>
          </div>
          <TicketSide team={t.home} role="Home" won={final && !awayWon} />
        </div>
        <p className={s.venue}>{t.venue}, {t.city}{t.conditions && <><br />{t.conditions}</>}</p>

        <div className={s.lines}>
          {t.lines.map((l) => (
            <div key={l.market} className={`${s.line} ${l.picked ? s.lineOn : ''}`}>
              <span className={s.lineLabel}>{l.market}{l.picked && final && <Check size={12} />}</span>
              <span className={s.lineValue}>{l.value}</span>
              {l.sub && <span className={s.lineSub}>{l.sub}</span>}
            </div>
          ))}
        </div>

        <ul className={s.calls}>
          {t.calls.map((c) => <TicketCall key={c.pick} call={c} />)}
        </ul>

        <p className={s.stamp}>
          <span>{t.locked}</span>
          <span className={s.stampValue}>{t.graded}</span>
        </p>
      </article>
    </Window>
  );
}

/* ───────────────────────── Every game ───────────────────────── */

const CHIP = { rec: 'Recommended', lean: 'Lean', value: 'Value' };

function CallRow({ row, rank }) {
  const [away, home] = row.game.map((code) => TEAMS[code]);
  return (
    <li className={s.callRow}>
      <span className={`${s.rank} ${row.chip === 'rec' ? '' : s.rankQuiet}`} aria-label={`Rank ${rank}`}>{rank}</span>
      <div className={s.rowMain}>
        <span className={s.rowPick}>
          {row.team && <Logo team={TEAMS[row.team]} size={20} />}
          {row.pick}
        </span>
        <span className={s.chips}>
          {row.market && <span className={s.chip}>{row.market}</span>}
          <span className={`${s.chip} ${row.chip === 'rec' ? s.chipUp : ''}`}>
            {CHIP[row.chip]}{row.value ? ` ${row.value}` : ''}
          </span>
          {row.hold && <span className={`${s.chip} ${s.chipWarn}`}>{row.hold}</span>}
        </span>
        <span className={s.rowMeta}>
          <span><Logo team={away} size={14} /> {away.abbrev} at <Logo team={home} size={14} /> {home.abbrev}, {row.when}</span>
          <span>{row.price}</span>
        </span>
        <span className={s.rowWhy}>{row.why}</span>
      </div>
      <Ring value={row.score} />
    </li>
  );
}

export function EveryGame() {
  const [active, setActive] = useState(0);
  const tabs = useRef([]);
  const tab = EVERY_GAME[active];

  const select = (i, focus) => {
    setActive(i);
    track('landing_showcase_tab', { tab: EVERY_GAME[i].key, variant: 'guest_v3' });
    if (focus) tabs.current[i]?.focus();
  };
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = EVERY_GAME.length;
    select((active + (e.key === 'ArrowRight' ? 1 : n - 1)) % n, true);
  };

  return (
    <Window flush>
      <div className={s.board}>
        <div className={s.boardHead}>
          <span className={s.boardTitle}>Every game</span>
          <span className={s.boardWeek}>{WEEK.label}, {WEEK.games} games</span>
        </div>
        <div className={s.tabs} role="tablist" aria-label="Every game, by market" onKeyDown={onKeyDown}>
          {EVERY_GAME.map((t, i) => (
            <button
              key={t.key}
              ref={(el) => { tabs.current[i] = el; }}
              type="button"
              role="tab"
              id={`showcase-tab-${t.key}`}
              aria-selected={i === active}
              aria-controls="showcase-panel"
              tabIndex={i === active ? 0 : -1}
              className={`${s.tab} ${i === active ? s.tabOn : ''}`}
              onClick={() => select(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${tab.key}`} className={s.panel}>
          <p className={s.panelNote}>{tab.note}</p>
          <ol className={s.callList}>
            {tab.rows.map((row, i) => <CallRow key={row.pick + row.game.join('')} row={row} rank={i + 1} />)}
          </ol>
          {tab.more && <p className={s.more}>and {tab.more} more games, ranked the same way</p>}
          {tab.empty && <p className={s.more}>{tab.empty}</p>}
        </div>
      </div>
    </Window>
  );
}

/* ───────────────────────── Matchup ───────────────────────── */

function Names({ players }) {
  return (
    <span className={s.edgeNames}>
      {players.map(([name, score]) => <span key={name}>{name} <b>{score.toFixed(1)}</b></span>)}
    </span>
  );
}

/** The edge is drawn from the middle, toward the side it favours. An even matchup draws none. */
function EdgeRow({ row }) {
  const size = Math.abs(row.edge);
  const width = `${Math.min(50, (size / 20) * 50)}%`;
  const toOffense = row.edge > 0;
  const even = row.size === 'even';
  const favoured = toOffense ? MATCHUP.offense : MATCHUP.defense;
  return (
    <div className={s.edge}>
      <div className={s.edgeSide}>
        <span className={s.edgeUnit}>{row.unit}</span>
        <span className={s.edgeGrade}>{row.grade.toFixed(1)}</span>
        <Names players={row.players} />
      </div>
      <div className={s.edgeMid}>
        <span className={s.edgeTrack} aria-hidden="true">
          {!even && (
            <span
              className={`${s.edgeFill} ${toOffense ? '' : s.edgeFillRight}`}
              style={toOffense ? { right: '50%', width } : { left: '50%', width }}
            />
          )}
        </span>
        <span className={`${s.edgeChip} ${row.size === 'big' ? s.edgeChipBig : even ? s.edgeChipEven : ''}`}>
          {even ? 'Even' : `${favoured.abbrev} +${size.toFixed(1)}`}
        </span>
      </div>
      <div className={`${s.edgeSide} ${s.edgeSideRight}`}>
        <span className={s.edgeUnit}>{row.against}</span>
        <span className={s.edgeGrade}>{row.againstGrade.toFixed(1)}</span>
        <Names players={row.againstPlayers} />
      </div>
    </div>
  );
}

const ordinal = (n) => {
  const v = n % 100;
  const sfx = ['th', 'st', 'nd', 'rd'];
  return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]);
};
const tone = (rank) => (rank <= 10 ? s.cellStrong : rank > 22 ? s.cellWeak : '');

function GroupStrip({ team, index }) {
  return (
    <div className={s.stripTeam}>
      <span className={s.stripName}><Logo team={team} size={18} /> {team.nickname}</span>
      {MATCHUP.groups.map((g) => (
        <div key={g.side} className={s.stripRow}>
          <span className={s.stripLabel}>{g.side}</span>
          <div className={s.strip} style={{ gridTemplateColumns: `repeat(${g.cells.length}, minmax(0, 1fr))` }}>
            {g.cells.map((c) => (
              <span key={c[0]} className={`${s.cell} ${tone(c[index])}`}>
                <span className={s.cellLabel}>{c[0]}</span>
                <span className={s.cellRank}>{ordinal(c[index])}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MatchupWindow() {
  const m = MATCHUP;
  return (
    <Window>
      <div className={s.matchup}>
        <div className={s.matchHead}>
          <span className={s.matchTeams}>
            <Logo team={m.away} size={26} /> {m.away.nickname} <span className={s.matchAt}>at</span> <Logo team={m.home} size={26} /> {m.home.nickname}
          </span>
          <span className={s.matchLean}>{m.lean}</span>
        </div>

        <div className={s.matchGrid}>
          <section className={s.matchCard} aria-label={`Unit matchups when the ${m.offense.nickname} have the ball`}>
            <h3 className={s.cardTitle}><Logo team={m.offense} size={20} /> When the {m.offense.nickname} have the ball</h3>
            <div className={s.edgeKey} aria-hidden="true">
              <span><Logo team={m.offense} size={14} /> {m.offense.abbrev} offense</span>
              <span>{m.defense.abbrev} defense <Logo team={m.defense} size={14} /></span>
            </div>
            {m.rows.map((row) => <EdgeRow key={row.unit} row={row} />)}
          </section>

          <section className={s.matchCard} aria-label="Position groups, league rank">
            <h3 className={s.cardTitle}>Position groups, ranked of 32</h3>
            <p className={s.overall}>
              Roster overall: {m.home.nickname} <b>{ordinal(m.overall.home[0])}</b>, {m.away.nickname} <b>{ordinal(m.overall.away[0])}</b>
            </p>
            <GroupStrip team={m.home} index={1} />
            <GroupStrip team={m.away} index={2} />
            <p className={s.legend}>
              <span className={`${s.swatch} ${s.cellStrong}`} /> Top ten
              <span className={`${s.swatch} ${s.cellWeak}`} /> Bottom ten
            </p>
            {m.note && <p className={s.matchNote}>{m.note}</p>}
          </section>
        </div>
      </div>
    </Window>
  );
}

/* ───────────────────────── The week ───────────────────────── */

export function WeekClock() {
  return (
    <ol className={s.clock}>
      {CLOCK.map((step) => (
        <li key={step.what} className={s.tick}>
          <span className={s.tickWhen}>{step.when}</span>
          <span className={s.tickWhat}>{step.what}</span>
          <span className={s.tickBody}>{step.body}</span>
        </li>
      ))}
    </ol>
  );
}
