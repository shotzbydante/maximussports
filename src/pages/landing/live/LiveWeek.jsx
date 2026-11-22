/**
 * LiveWeek — this week's NFL games on the logged-out home page.
 *
 * Every game of the week as a tile, the way the NFL home page in the app
 * shows them: a flyover of the stadium, the score or the lines. The three
 * highest-conviction picks are shown in full, with where each one stands.
 * Every other game's call is behind a lock that leads to sign-up.
 *
 * The locked calls are not hidden with CSS. /api/nfl/public-week sends a
 * pick for the top three games only; what sits behind a lock is a drawing.
 *
 * The week turns over on its own: the server shows the week just played
 * until Tuesday morning, then the week ahead.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { track } from '../../../analytics/index';
import VenueFlyover from '../../../components/shared/VenueFlyover';
import gl from '../GuestLanding.module.css';
import s from './LiveWeek.module.css';

const ENDPOINT = '/api/nfl/public-week';
const LIVE_POLL_MS = 60_000;
const IDLE_POLL_MS = 5 * 60_000;
const HIDDEN_RECHECK_MS = 15_000;
/** Tiles shown on a wide screen before "Show all". A phone gets all of them in a rail. */
const PREVIEW = 6;
/** Calls on a game open three days before it kicks off. */
const OPENS_MS = 3 * 24 * 3_600_000;

const MARKET = { runline: 'Spread', total: 'Over/under', moneyline: 'Moneyline' };
const hide = (e) => { e.currentTarget.style.visibility = 'hidden'; };
const fmtLine = (v) => (v == null ? '' : v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`);
const fmtOdds = (v) => (v == null ? '' : v > 0 ? `+${v}` : `${v}`);
const when = (iso, opts) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-US', opts).replace(',', ''); } catch { return ''; }
};
const kickoff = (iso) => when(iso, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const stamp = (iso) => when(iso, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

function Logo({ team, size = 24 }) {
  if (!team?.logo) return null;
  return <img src={team.logo} alt="" width={size} height={size} className={s.logo} loading="lazy" decoding="async" onError={hide} />;
}

function Icon({ name, size = 14 }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true };
  if (name === 'check') {
    return <svg {...common}><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (name === 'cross') {
    return <svg {...common}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" /></svg>;
  }
  if (name === 'arrow') {
    return <svg {...common}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  // lock
  return (
    <svg {...common}>
      <rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function Ring({ value }) {
  const size = 42;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span className={s.ring} role="img" aria-label={`Conviction ${pct} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={s.ringTrack} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={s.ringFill} strokeDasharray={`${(pct / 100) * c} ${c}`} />
      </svg>
      <span className={s.ringValue}>{pct}</span>
    </span>
  );
}

function Status({ game }) {
  if (game.state.live) {
    return <span className={`${s.chip} ${s.chipLive}`}><span className={s.dot} aria-hidden="true" />{game.state.label || 'Live'}</span>;
  }
  if (game.state.final) return <span>{game.state.overtime ? 'Final, overtime' : 'Final'}</span>;
  if (game.status === 'postponed') return <span className={`${s.chip} ${s.chipWarn}`}>Postponed</span>;
  return <span>{kickoff(game.startTime) || 'Scheduled'}</span>;
}

function Team({ team, hasBall }) {
  return (
    <span className={s.team}>
      <Logo team={team} />
      <span className={s.teamName}>{team?.nickname || 'TBD'}</span>
      {team?.record && <span className={s.teamRecord}>{team.record}</span>}
      {hasBall && <span className={s.ball} role="img" aria-label="Has the ball" />}
    </span>
  );
}

const VERDICT = {
  won: { text: 'Won', icon: 'check', tone: 'up' },
  lost: { text: 'Lost', icon: 'cross', tone: 'down' },
  push: { text: 'Push', tone: 'flat' },
  ahead: { text: 'Ahead', tone: 'up', live: true },
  behind: { text: 'Behind', tone: 'down', live: true },
  level: { text: 'Level', tone: 'flat', live: true },
};

/** One of the week's top three picks, in full. */
function OpenPick({ pick }) {
  const v = VERDICT[pick.result?.verdict] || null;
  const settled = v && !v.live;
  const price = [fmtOdds(pick.price), pick.book ? `at ${pick.book}` : null].filter(Boolean).join(' ');
  return (
    <div className={`${s.pick} ${settled && v.tone === 'up' ? s.pickWon : ''} ${settled && v.tone === 'down' ? s.pickLost : ''}`}>
      <div className={s.pickTop}>
        <span className={s.chips}>
          <span className={`${s.chip} ${s.chipInk}`}>Top pick {pick.rank}</span>
          <span className={`${s.chip} ${pick.role === 'recommended' ? s.chipUp : ''}`}>
            {pick.role === 'recommended' ? 'Recommended' : 'Lean'}
          </span>
        </span>
        <Ring value={pick.conviction} />
      </div>
      <div className={s.pickMain}>
        <span className={s.pickLabel}>
          {pick.team && <Logo team={pick.team} size={22} />}
          {pick.label}
        </span>
        {v && (
          <span className={`${s.verdict} ${s[`verdict_${v.tone}`]} ${v.live ? s.verdictLive : ''}`}>
            {v.icon && <Icon name={v.icon} size={12} />}{v.text}
          </span>
        )}
      </div>
      <p className={s.pickMeta}>{[MARKET[pick.market], price].filter(Boolean).join(', ')}</p>
      {pick.why && <p className={s.pickWhy}>{pick.why}</p>}
      <p className={s.pickStand}>
        {pick.result?.text || (pick.lockedAt ? `Locked ${stamp(pick.lockedAt)}. Graded against the final score.` : '')}
      </p>
    </div>
  );
}

/** Every other game: the call exists for members, and is not on this page. */
function LockedPick({ game, signupTo, onUnlock, asOf }) {
  const away = game.teams.away?.nickname;
  const home = game.teams.home?.nickname;
  const kick = Date.parse(game.startTime || '');
  const notOpen = game.status === 'upcoming' && Number.isFinite(kick) && Number.isFinite(asOf) && kick - asOf > OPENS_MS;
  const what = game.state.final ? 'Our calls on this game, graded'
    : game.state.live ? 'Our calls on this game, tracked live'
      : notOpen ? 'Calls open three days before kickoff'
        : 'A call on the spread and the total';
  return (
    <Link
      to={signupTo}
      className={s.locked}
      onClick={() => onUnlock('tile', game)}
      aria-label={`Sign up to unlock the picks for ${away} at ${home}`}
    >
      <span className={s.lockedGhost} aria-hidden="true">
        <span className={s.ghostChip} />
        <span className={s.ghostChip} />
        <span className={s.ghostRing} />
        <span className={s.ghostLabel} />
      </span>
      <span className={s.lockedCopy}>
        <span className={s.lockBadge}><Icon name="lock" size={15} /></span>
        <span>
          <b>{what}</b>
          <span className={s.lockedSub}>Sign up free to unlock</span>
        </span>
      </span>
    </Link>
  );
}

function GameTile({ game, signupTo, onUnlock, asOf }) {
  const { away, home } = game.teams;
  const { state, lines } = game;
  const showScore = state.live || state.final;
  const spread = lines.spreadHome;
  const ml = lines.moneyline || {};
  const lineLabel = lines.kind === 'closed' ? 'Closed' : lines.kind === 'live' ? 'Live line' : null;
  const lost = (mine, theirs) => state.final && (mine ?? 0) < (theirs ?? 0);

  return (
    <article className={`${s.tile} ${game.pick ? s.tileOpen : ''}`} role="listitem">
      <VenueFlyover sport="nfl" game={game} variant="tile" surface="landing_week" budget="landing" />
      <div className={s.gameTop}>
        <Status game={game} />
        {game.network && <span>{game.network}</span>}
      </div>

      {showScore ? (
        <div className={`${s.gameGrid} ${s.gameGridScore}`}>
          <Team team={away} hasBall={state.possession === 'away'} />
          <span className={`${s.score} ${lost(away?.score, home?.score) ? s.scoreLose : ''}`}>{away?.score ?? ''}</span>
          <Team team={home} hasBall={state.possession === 'home'} />
          <span className={`${s.score} ${lost(home?.score, away?.score) ? s.scoreLose : ''}`}>{home?.score ?? ''}</span>
        </div>
      ) : (
        <div className={s.gameGrid}>
          <span />
          <span className={s.colHead}>Spread</span>
          <span className={s.colHead}>To win</span>
          <Team team={away} />
          <span className={s.cellBox}>{spread != null ? fmtLine(-spread) : '–'}</span>
          <span className={s.cellBox}>{fmtOdds(ml.away) || '–'}</span>
          <Team team={home} />
          <span className={s.cellBox}>{spread != null ? fmtLine(spread) : '–'}</span>
          <span className={s.cellBox}>{fmtOdds(ml.home) || '–'}</span>
        </div>
      )}

      <div className={s.gameFoot}>
        <span>{lines.total != null ? <>Total <b>{lines.total}</b></> : 'No total posted'}</span>
        {lineLabel && spread != null && (
          <span>{lineLabel} <b><Logo team={home} size={14} /> {home?.abbrev} {fmtLine(spread)}</b></span>
        )}
      </div>

      {game.pick
        ? <OpenPick pick={game.pick} />
        : <LockedPick game={game} signupTo={signupTo} onUnlock={onUnlock} asOf={asOf} />}
    </article>
  );
}

function asideText(week) {
  const { counts, games, phase, nextLabel } = week;
  const n = games.length;
  if (phase === 'final') {
    return `All ${n} games are final.${nextLabel ? ` ${nextLabel} takes over on Tuesday morning.` : ''}`;
  }
  if (phase === 'upcoming') {
    return week.featured > 0
      ? `${n} games to play. Picks lock as kickoff nears.`
      : `${n} games to play. Picks lock as kickoff nears, and the top three show here when they do.`;
  }
  const parts = [
    counts.live ? `${counts.live} live` : null,
    counts.upcoming ? `${counts.upcoming} to play` : null,
    counts.final ? `${counts.final} final` : null,
  ].filter(Boolean).join(', ');
  return `${parts}.${counts.live ? ' Scores update every minute.' : ''}`;
}

export default function LiveWeek({ signupTo }) {
  const [week, setWeek] = useState(undefined);   // undefined: loading. null: nothing to show.
  const [showAll, setShowAll] = useState(false);
  const viewed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = (first) => fetch(ENDPOINT)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return null;
        if (d?.games?.length > 0) setWeek(d);
        else if (first) setWeek(null);
        return d;
      })
      .catch(() => { if (!cancelled && first) setWeek(null); return null; });
    const run = (first) => load(first).then((d) => {
      if (cancelled) return;
      timer = setTimeout(tick, d?.counts?.live > 0 ? LIVE_POLL_MS : IDLE_POLL_MS);
    });
    // A tab in the background keeps its last score until it is looked at again.
    function tick() {
      if (cancelled) return;
      if (document.hidden) { timer = setTimeout(tick, HIDDEN_RECHECK_MS); return; }
      run(false);
    }
    run(true);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!week || viewed.current) return;
    viewed.current = true;
    track('landing_week_viewed', {
      variant: 'guest_v3', week: week.week, phase: week.phase,
      games: week.games.length, open_picks: week.featured,
    });
  }, [week]);

  if (week === null) return null;

  const onUnlock = (location, game) => {
    track('landing_cta_clicked', {
      cta: 'unlock_picks', location: `live_week_${location}`, variant: 'guest_v3',
      ...(game ? { game: `${game.teams.away?.abbrev}@${game.teams.home?.abbrev}` } : {}),
    });
  };
  const expand = () => {
    setShowAll(true);
    track('landing_week_show_all', { variant: 'guest_v3', games: week.games.length });
  };

  const loading = week === undefined;
  const games = week?.games || [];
  const live = week?.counts?.live > 0;
  const more = games.length - PREVIEW;
  // The server's clock, so the tiles read the same on every render.
  const asOf = Date.parse(week?.generatedAt || '');

  return (
    <section id="this-week" className={gl.section} aria-busy={loading}>
      <div className={gl.sectionHead}>
        <div>
          <p className={`${gl.kicker} ${s.kicker}`}>
            {live && <span className={s.liveDot} aria-hidden="true" />}
            {loading ? 'This week in the NFL' : `${live ? 'Live now' : week.phase === 'final' ? 'Final' : 'This week'}: NFL ${week.label}`}
          </p>
          <h2 className={gl.h2}>Every game this week.<br />Our top three picks, open.</h2>
        </div>
        <p className={gl.sectionAside}>
          {loading ? 'Loading this week’s games.' : asideText(week)}
        </p>
      </div>

      {loading ? (
        <div className={`${s.grid} ${s.gridClosed}`} aria-hidden="true">
          {[0, 1, 2].map((i) => <div key={i} className={s.skeleton} />)}
        </div>
      ) : (
        <>
          <div className={`${s.grid} ${showAll ? '' : s.gridClosed}`} role="list" aria-label={`NFL ${week.label} games`} tabIndex={0}>
            {games.map((g) => <GameTile key={g.gameId} game={g} signupTo={signupTo} onUnlock={onUnlock} asOf={asOf} />)}
          </div>

          {more > 0 && !showAll && (
            <button type="button" className={s.showAll} onClick={expand}>
              Show all {games.length} games
            </button>
          )}

          <div className={s.unlock}>
            <span className={s.unlockBadge} aria-hidden="true"><Icon name="lock" size={18} /></span>
            <p className={s.unlockCopy}>
              <b>
                {week.locked > 0
                  ? `The other ${week.locked} ${week.locked === 1 ? 'game is' : 'games are'} unlocked with a free account.`
                  : 'Every call on every game, with a free account.'}
              </b>
              <span>
                A side and a total on every game, a moneyline when the price beats fair, and one
                line on why. Locked at a real price, graded in public.
              </span>
            </p>
            <Link
              to={signupTo}
              className={`${gl.btn} ${gl.btnPrimary} ${gl.btnSm}`}
              onClick={() => onUnlock('banner')}
            >
              Unlock every pick <Icon name="arrow" />
            </Link>
          </div>

          {week.byeTeams?.length > 0 && (
            <p className={s.byes}>
              <span>On bye</span>
              {week.byeTeams.map((t) => <span key={t.slug} className={s.bye}><Logo team={t} size={16} /> {t.nickname}</span>)}
            </p>
          )}
          <p className={s.fine}>
            The top three are the week’s highest-conviction picks, shown as locked: line, price and
            sportsbook. Each is graded against the final score, win or lose.
            {week.rollsAt && week.phase === 'final' ? ` This board turns over ${stamp(week.rollsAt)}.` : ''}
          </p>
        </>
      )}
    </section>
  );
}
