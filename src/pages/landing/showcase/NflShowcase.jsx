/**
 * NflShowcase — the product, shown on the guest landing page.
 *
 * Four pieces, each a light "app window" on the dark page, each filled with
 * the real Week 11 examples in ./week11.js:
 *
 *   PickTicket    one recommended pick as the NFL home page shows it
 *   EveryGame     the four ranked tabs from Odds Insights
 *   MatchupWindow unit against unit, and every position group, for one game
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

/** A light app surface with the address of the page it comes from. */
function Window({ path, children, className = '' }) {
  return (
    <div className={`${s.window} ${className}`}>
      <div className={s.windowBar}>
        <span className={s.windowDots} aria-hidden="true"><i /><i /><i /></span>
        <span className={s.windowPath}>maximussports.ai{path}</span>
      </div>
      <div className={s.windowBody}>{children}</div>
    </div>
  );
}

/* ───────────────────────── Pick ticket ───────────────────────── */

function TicketSide({ team, role }) {
  return (
    <div className={s.side}>
      <Logo team={team} size={44} />
      <span className={s.sideName}>{team.nickname}</span>
      <span className={s.sideMeta}>{team.record}</span>
      <span className={`${s.role} ${role === 'Home' ? s.roleHome : ''}`}>{role}</span>
    </div>
  );
}

export function PickTicket() {
  const t = TICKET;
  return (
    <Window path="/nfl">
      <article className={s.ticket} aria-label={`Example pick: ${t.pick}, ${t.away.nickname} at ${t.home.nickname}`}>
        <div className={s.ticketTop}>
          <TicketSide team={t.away} role="Away" />
          <div className={s.at}>
            <span className={s.atWhen}>{t.kickoff}</span>
            <span className={s.atNet}>{t.network}</span>
          </div>
          <TicketSide team={t.home} role="Home" />
        </div>
        <p className={s.venue}>{t.venue}, {t.city}<br />{t.conditions}</p>

        <div className={s.lines}>
          {t.lines.map((l) => (
            <div key={l.market} className={`${s.line} ${l.picked ? s.lineOn : ''}`}>
              <span className={s.lineLabel}>{l.market}</span>
              <span className={s.lineValue}>{l.value}</span>
              {l.sub && <span className={s.lineSub}>{l.sub}</span>}
            </div>
          ))}
        </div>

        <div className={s.call}>
          <span className={s.check} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <span className={s.callPick}>{t.pick}</span>
            <span className={s.callPrice}>{t.price} at {t.book}</span>
          </div>
          <Ring value={t.conviction} size={54} />
        </div>

        <p className={s.why}>{t.why}</p>
        <p className={s.stamp}>
          <span>{t.locked}</span>
          <span className={s.stampValue}>{t.value} expected value when locked</span>
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
          <Logo team={away} size={14} /> {away.abbrev} at <Logo team={home} size={14} /> {home.abbrev}, {row.meta}
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
    <Window path="/nfl/insights">
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

function EdgeRow({ row }) {
  const width = `${Math.min(50, (Math.abs(row.edge) / 20) * 50)}%`;
  return (
    <div className={s.edge}>
      <div className={s.edgeSide}>
        <span className={s.edgeUnit}>{row.unit}</span>
        <span className={s.edgeGrade}>{row.grade.toFixed(1)}</span>
        <Names players={row.players} />
      </div>
      <div className={s.edgeMid}>
        <span className={s.edgeTrack} aria-hidden="true">
          <span className={s.edgeFill} style={{ right: '50%', width }} />
        </span>
        <span className={`${s.edgeChip} ${row.size === 'big' ? s.edgeChipBig : ''}`}>
          {MATCHUP.offense.abbrev} +{row.edge.toFixed(1)}
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
    <Window path="/nfl/games/cardinals-at-chiefs" className={s.windowWide}>
      <div className={s.matchup}>
        <div className={s.matchHead}>
          <span className={s.matchTeams}>
            <Logo team={m.away} size={26} /> {m.away.nickname} <span className={s.matchAt}>at</span> <Logo team={m.home} size={26} /> {m.home.nickname}
          </span>
          <span className={s.matchLean}>{m.lean}</span>
        </div>

        <div className={s.matchGrid}>
          <section className={s.matchCard} aria-label="Unit matchups when the Chiefs have the ball">
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
