/**
 * The NFL brief: what is happening right now, what is next, and what the
 * numbers say about it.
 *
 * Three layers, each testable on its own:
 *
 *   buildBriefData()    every fact the brief may use, computed here so the
 *                       writer never does arithmetic on a live score
 *   buildEngineBrief()  a complete brief written from those facts with no
 *                       language model: the floor, and what a preview build
 *                       or a failed model call shows
 *   briefPrompt() / parseBrief()
 *                       Claude rewrites the brief in Maximus's voice. Its
 *                       reply is checked against the data and thrown away
 *                       if it names a game that is not on the slate or
 *                       breaks the shape.
 *
 * The brief is structured, not a wall of text:
 *   { headline, dek, now[], next[], numbers[], take, also }
 * `now` and `next` items carry a gameId, so the page can draw logos and the
 * live score itself. The copy never has to state a score that will be stale
 * a minute later.
 */

import { NFL_TEAMS } from '../../src/sports/nfl/teams.js';
import { gameVsClose } from '../../src/features/nfl/picks/pickLive.js';
import { recommendedPicks, pickWhy } from '../../src/features/nfl/picks/pickSummary.js';
import { fixPositiveOdds } from './oddsText.js';

export const BRIEF_LIMITS = Object.freeze({ headline: 72, dek: 220, item: 230, take: 340, also: 440, value: 9, label: 110, now: 4, next: 4, numbers: 3 });

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const odds = (v) => (isNum(v) ? (v > 0 ? `+${v}` : `${v}`) : null);
const line = (v) => (isNum(v) ? (v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`) : null);
const r1 = (v) => Math.round(v * 10) / 10;
/** A stored line as a number. A missing one is null, never zero. */
const toNum = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const NICK = Object.fromEntries(NFL_TEAMS.map((t) => [t.slug, t.nickname]));
const NAME = Object.fromEntries(NFL_TEAMS.map((t) => [t.slug, t.name]));

function et(iso, opts) {
  try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', ...opts }); } catch { return ''; }
}
const kickoffText = (iso) => `${et(iso, { weekday: 'long', hour: 'numeric', minute: '2-digit' })} ET`;

/** Which TV window a kickoff falls in, in the words a fan uses. */
export function windowFor(iso) {
  const day = et(iso, { weekday: 'long' });
  const hour = Number(et(iso, { hour: 'numeric', hour12: false }));
  if (day === 'Sunday') return hour < 15 ? 'the early window' : hour < 19 ? 'the late window' : 'Sunday night';
  if (day === 'Monday') return 'Monday night';
  if (day === 'Thursday') return 'Thursday night';
  return day;
}

function spreadText(game, spreadHome) {
  if (!isNum(spreadHome)) return null;
  if (spreadHome === 0) return 'pick’em';
  const fav = spreadHome < 0 ? game.teams.home : game.teams.away;
  return `${fav.abbrev} ${line(-Math.abs(spreadHome))}`;
}

/** The single biggest position-group edge in a game, from the roster-talent block. */
function talentEdge(engine) {
  const top = [...(engine?.talent?.matchups || [])].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))[0];
  if (!top || Math.abs(top.edge) < 6) return null;
  const favOffense = top.favours === top.offenseTeam;
  const strong = favOffense ? `${top.offenseTeam}’s ${top.offense}` : `${top.defenseTeam}’s ${top.defense}`;
  const weak = favOffense ? `${top.defenseTeam}’s ${top.defense}` : `${top.offenseTeam}’s ${top.offense}`;
  return { text: `${strong} against ${weak}: a ${r1(Math.abs(top.edge))}-point talent edge`, points: r1(Math.abs(top.edge)), team: top.favours };
}

const UNIT_PAIRS = [
  ['passOffense', 'passDefense', 'pass offense', 'pass defense'],
  ['rushOffense', 'rushDefense', 'run game', 'run defense'],
  ['passProtection', 'passRush', 'pass protection', 'pass rush'],
];
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

/** A top-six unit lined up against a bottom-seven one, by this season's play-by-play ranks. */
function unitMismatch(game) {
  const u = game.engine?.units;
  if (!u?.home || !u?.away) return null;
  let best = null;
  for (const [off, def, offName, defName] of UNIT_PAIRS) {
    for (const [o, d] of [['home', 'away'], ['away', 'home']]) {
      const a = u[o]?.[off]?.rank, b = u[d]?.[def]?.rank;
      if (!isNum(a) || !isNum(b)) continue;
      const gap = Math.abs(a - b);
      if (Math.min(a, b) > 6 || Math.max(a, b) < 26) continue;
      if (!best || gap > best.gap) {
        const good = a < b
          ? `${game.teams[o].abbrev}’s ${offName} (${ord(a)})`
          : `${game.teams[d].abbrev}’s ${defName} (${ord(b)})`;
        const bad = a < b
          ? `${game.teams[d].abbrev}’s ${defName} (${ord(b)})`
          : `${game.teams[o].abbrev}’s ${offName} (${ord(a)})`;
        best = { gap, text: `${good} meets ${bad}` };
      }
    }
  }
  return best?.text || null;
}

function quarterbackNews(game) {
  const out = [];
  for (const side of ['away', 'home']) {
    const qb = game.engine?.quarterbacks?.[side];
    // The injury list names every quarterback who is out, backups included.
    // It is only news when the starter has changed (or we cannot tell).
    const starterChanged = !qb || qb.changed;
    for (const q of game.injuries?.[side]?.quarterbacks || []) {
      if (!starterChanged || (qb?.starter && q.name === qb.starter)) continue;
      out.push(`${game.teams[side].abbrev} quarterback ${q.name} is ${String(q.status || 'out').toLowerCase()}`);
    }
    if (qb?.changed && qb?.starter) out.push(`${qb.starter} starts for ${game.teams[side].abbrev}`);
  }
  return out;
}

function seedText(team, standings) {
  const s = standings?.[team.slug];
  if (!s || !isNum(s.playoffSeed) || s.playoffSeed > 7) return null;
  return `${team.abbrev} holds the ${s.conference} ${s.playoffSeed} seed${s.streak ? ` (${s.streak})` : ''}`;
}

/**
 * Every fact the brief may use.
 * @param {object} args
 * @param {object} args.slate       getNflSlate()
 * @param {object} [args.standings] teams keyed by slug
 * @param {Array}  [args.headlines]
 * @param {object} [args.champOdds] keyed by slug
 * @param {object} [args.board]     the picks board (upcoming picks)
 * @param {Array}  [args.weekPicks] picks in games that have started (nflWeekPicks)
 * @param {Map}    [args.closes]    closing snapshots keyed by game id
 * @param {Date}   [args.now]
 */
export function buildBriefData({ slate, standings = {}, headlines = [], champOdds = {}, board = null, weekPicks = [], closes = new Map(), now = new Date() }) {
  const games = slate?.games || [];
  const pickByGame = new Map();
  for (const p of recommendedPicks(board)) {
    if (Date.parse(p.matchup?.startTime || 0) <= now.getTime()) continue;
    pickByGame.set(String(p.gameId), {
      pick: p.selection?.label,
      price: p.market?.type === 'moneyline' ? null : odds(p.lock?.price ?? p.market?.priceAmerican),
      book: p.lock?.book || p.book?.title || null,
      expectedValue: p.displayMetrics?.edgeValue || null,
      why: pickWhy(p),
    });
  }
  const inPlayByGame = new Map(weekPicks.map((p) => [String(p.gameId), p]));

  const live = games.filter((g) => g.status === 'live').map((g) => {
    const close = closes.get(String(g.gameId));
    const vs = close ? gameVsClose(g, { spreadHome: toNum(close.spread_home), total: toNum(close.total) }) : null;
    const gs = g.gameState || {};
    const margin = Math.abs((g.teams.home.score ?? 0) - (g.teams.away.score ?? 0));
    const mine = inPlayByGame.get(String(g.gameId));
    return {
      gameId: String(g.gameId),
      away: g.teams.away.abbrev, home: g.teams.home.abbrev,
      awayName: NAME[g.teams.away.slug] || g.teams.away.name, homeName: NAME[g.teams.home.slug] || g.teams.home.name,
      score: `${g.teams.away.abbrev} ${g.teams.away.score}, ${g.teams.home.abbrev} ${g.teams.home.score}`,
      clock: gs.isHalftime ? 'halftime' : gs.periodLabel || null,
      period: gs.period ?? null,
      margin,
      situation: gs.downDistance ? `${gs.possession ? `${g.teams[gs.possession]?.abbrev} ball, ` : ''}${gs.downDistance}${gs.isRedZone ? ' (red zone)' : ''}` : null,
      closingSpread: close ? spreadText(g, toNum(close.spread_home)) : null,
      closingTotal: close ? toNum(close.total) : null,
      againstTheSpread: vs?.spread || null,
      againstTheTotal: vs?.total || null,
      favoriteTrailing: Boolean(vs?.spread && /trails by/.test(vs.spread)),
      maximusPick: mine ? { pick: mine.label, price: odds(mine.price), book: mine.book, standing: mine.status.text, verdict: mine.status.verdict } : null,
    };
  });

  const upcoming = games
    .filter((g) => g.status === 'upcoming')
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .map((g) => {
      const e = g.engine || {};
      const homeWin = e.fair?.homeWin;
      const fav = isNum(homeWin) ? (homeWin >= 0.5 ? g.teams.home : g.teams.away) : null;
      const gap = e.modelGap?.side;
      const rest = e.rest && isNum(e.rest.home) && isNum(e.rest.away) && Math.abs(e.rest.home - e.rest.away) >= 3
        ? `${g.teams.home.abbrev} on ${e.rest.home} days of rest, ${g.teams.away.abbrev} on ${e.rest.away}` : null;
      const move = isNum(g.market?.openSpread) && isNum(g.market?.pregameSpread) ? g.market.pregameSpread - g.market.openSpread : null;
      const out = {
        gameId: String(g.gameId),
        away: g.teams.away.abbrev, home: g.teams.home.abbrev,
        awayName: NAME[g.teams.away.slug] || g.teams.away.name, homeName: NAME[g.teams.home.slug] || g.teams.home.name,
        awayRecord: g.teams.away.record || null, homeRecord: g.teams.home.record || null,
        kickoff: kickoffText(g.startTime),
        window: windowFor(g.startTime),
        minutesToKickoff: Math.max(0, Math.round((Date.parse(g.startTime) - now.getTime()) / 60000)),
        network: g.broadcast?.network || null,
        spread: spreadText(g, g.market?.pregameSpread),
        total: g.market?.pregameTotal ?? null,
        marketWinChance: fav && isNum(homeWin) ? `${fav.abbrev} ${Math.round(Math.max(homeWin, 1 - homeWin) * 100)}%` : null,
        ratingsLine: isNum(e.projection?.fairSpreadHome) ? `${g.teams.home.abbrev} ${line(r1(e.projection.fairSpreadHome))}` : null,
        ratingsVsMarket: isNum(gap) && Math.abs(gap) >= 2
          ? `our ratings are ${r1(Math.abs(gap))} points ${gap > 0 ? 'higher' : 'lower'} on ${g.teams.home.abbrev} than the market` : null,
        conditions: e.env?.label || null,
        windMph: e.env && !e.env.indoor && isNum(e.env.wind) ? Math.round(e.env.wind) : null,
        neutralSite: e.neutral ? `${e.env?.venue || 'a neutral site'}${e.env?.city ? `, ${e.env.city}` : ''}` : null,
        quarterbackNews: quarterbackNews(g),
        talentEdge: talentEdge(e)?.text || null,
        talentEdgePoints: talentEdge(e)?.points || null,
        talentLean: e.talent?.leansTo ? `roster talent leans ${e.talent.leansTo}` : null,
        unitMismatch: unitMismatch(g),
        spots: (e.situations || []).map((s) => s.note).filter(Boolean).slice(0, 2),
        rest,
        lineMove: isNum(move) && Math.abs(move) >= 1 ? `the spread has moved ${r1(Math.abs(move))} toward ${move < 0 ? g.teams.home.abbrev : g.teams.away.abbrev} since it opened` : null,
        divisional: Boolean(e.divisional),
        stakes: [seedText(g.teams.away, standings), seedText(g.teams.home, standings)].filter(Boolean),
        maximusPick: pickByGame.get(String(g.gameId)) || null,
      };
      return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0) && v !== false));
    });

  const finals = games.filter((g) => g.status === 'final').map((g) => {
    const close = closes.get(String(g.gameId));
    const h = g.teams.home.score ?? 0, a = g.teams.away.score ?? 0;
    const winner = h === a ? null : h > a ? g.teams.home : g.teams.away;
    const mine = inPlayByGame.get(String(g.gameId));
    let cover = null, totalResult = null;
    if (close && toNum(close.spread_home) != null) {
      const s = toNum(close.spread_home);
      const fav = s <= 0 ? g.teams.home : g.teams.away;
      const favMargin = s <= 0 ? h - a : a - h;
      const d = favMargin - Math.abs(s);
      cover = d === 0 ? `a push on ${fav.abbrev} ${line(-Math.abs(s))}` : d > 0 ? `${fav.abbrev} covered ${line(-Math.abs(s))}` : `${fav.abbrev} did not cover ${line(-Math.abs(s))}`;
    }
    if (close && toNum(close.total) != null) {
      const t = toNum(close.total);
      totalResult = h + a === t ? `a push on ${t}` : h + a > t ? `over ${t}` : `under ${t}`;
    }
    return {
      gameId: String(g.gameId), away: g.teams.away.abbrev, home: g.teams.home.abbrev,
      final: `${g.teams.away.abbrev} ${a}, ${g.teams.home.abbrev} ${h}`,
      winner: winner?.abbrev || 'tie', margin: Math.abs(h - a),
      againstTheSpread: cover, total: totalResult,
      day: et(g.startTime, { weekday: 'long' }),
      maximusPick: mine ? { pick: mine.label, result: mine.status.verdict, detail: mine.status.text } : null,
    };
  });

  const settled = weekPicks.filter((p) => ['won', 'lost', 'push'].includes(p.status.verdict));
  const picksThisWeek = {
    toCome: pickByGame.size,
    inPlay: weekPicks.filter((p) => p.gameStatus === 'live').length,
    won: settled.filter((p) => p.status.verdict === 'won').length,
    lost: settled.filter((p) => p.status.verdict === 'lost').length,
    push: settled.filter((p) => p.status.verdict === 'push').length,
  };

  const seeds = (conf) => Object.values(standings)
    .filter((t) => t.conference === conf && isNum(t.playoffSeed) && t.playoffSeed <= 7)
    .sort((a, b) => a.playoffSeed - b.playoffSeed)
    .map((t) => ({ seed: t.playoffSeed, team: t.name, record: t.record, streak: t.streak }));
  const titleOdds = Object.entries(champOdds)
    .filter(([, v]) => isNum(v?.bestChanceAmerican))
    .map(([slug, v]) => ({ team: NAME[slug] || slug, odds: odds(v.bestChanceAmerican) , _p: v.bestChanceAmerican > 0 ? 100 / (v.bestChanceAmerican + 100) : -v.bestChanceAmerican / (-v.bestChanceAmerican + 100) }))
    .sort((a, b) => b._p - a._p).slice(0, 6).map((t) => ({ team: t.team, odds: t.odds }));

  const next = upcoming[0] || null;
  return {
    now: `${now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET`,
    week: slate?.week ?? null,
    counts: { live: live.length, toPlay: upcoming.length, final: finals.length },
    nextKickoff: next ? `${next.away} at ${next.home}, ${next.kickoff}${next.minutesToKickoff <= 180 ? ` (in ${next.minutesToKickoff} minutes)` : ''}` : null,
    maximusPicksThisWeek: picksThisWeek,
    liveGames: live,
    gamesToCome: upcoming,
    finals,
    byeTeams: (slate?.byeTeams || []).map((s) => NICK[s] || s),
    playoffPicture: { AFC: seeds('AFC'), NFC: seeds('NFC') },
    superBowlOdds: titleOdds,
    headlines: headlines.slice(0, 8).map((x) => ({ title: x.title, source: x.source, topic: x.topic })),
  };
}

/** A fingerprint of the slate's state. When it changes, a cached brief is out of date. */
export function briefSignature(slate) {
  const c = { live: 0, upcoming: 0, final: 0 };
  for (const g of slate?.games || []) if (g.status in c) c[g.status] += 1;
  return `w${slate?.week ?? '?'}|l${c.live}|u${c.upcoming}|f${c.final}`;
}

/* ── Keeping the copy from going stale ──────────────────────────────── */

const CLOCK_IN_STANDING = / at (?:Q\d \d{1,2}:\d{2}|halftime|the half|OT[^.,]*)/i;
/** "29 points at Q4 13:41." → "29 points so far." The page shows the clock itself. */
export const withoutClock = (text) => String(text || '').replace(CLOCK_IN_STANDING, ' so far');

const STALE = [
  /\b\d{1,2}:\d{2}\s+(?:left|remaining|to play|to go)\b/i,          // time left
  /\bQ[1-4]\s+\d{1,2}:\d{2}\b/,                                       // Q4 5:47
  /\b[1-4](?:st|nd|rd|th)\s*(?:&|and)\s*(?:goal|inches|\d{1,2})\b/i,  // 3rd & Goal
  /\b(?:at|on|inside) the [A-Z]{2,3} \d{1,2}\b/,                       // at the MIA 10
  /\bnear midfield\b/i,
];
/** Drop any sentence that states the clock, the down or field position. */
export function dropStale(text) {
  const kept = String(text || '').split(/(?<=[.!?])\s+/).filter((sentence) => !STALE.some((re) => re.test(sentence)));
  return kept.join(' ').trim();
}

const STAGE = { 1: 'first quarter', 2: 'second quarter', 3: 'third quarter', 4: 'fourth quarter' };
/** What the model is shown: no clock, no score line, no down and distance. */
function forModel(data) {
  return {
    ...data,
    liveGames: data.liveGames.map((live) => {
      const g = { ...live };
      for (const key of ['score', 'clock', 'situation', 'period']) delete g[key];
      return {
        ...g,
        stage: /half/i.test(live.clock || '') ? 'halftime' : live.period > 4 ? 'overtime' : STAGE[live.period] || 'under way',
        maximusPick: live.maximusPick ? { ...live.maximusPick, standing: withoutClock(live.maximusPick.standing) } : null,
      };
    }),
  };
}

/* ── The floor: a brief with no language model ──────────────────────── */

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen'];
const word = (n) => WORDS[n] || `${n}`;

function liveRank(g) {
  return (g.maximusPick ? 100 : 0) + (g.favoriteTrailing ? 40 : 0) + (g.period >= 4 && g.margin <= 8 ? 30 : 0) + (g.period >= 3 ? 5 : 0) - g.margin / 10;
}
function nextRank(g) {
  return (g.maximusPick ? 100 : 0) + ((g.quarterbackNews || []).length ? 30 : 0) + ((g.windMph || 0) >= 12 ? 25 : 0)
    + (g.talentEdgePoints || 0) + (g.stakes || []).length * 6 + (g.divisional ? 5 : 0) - (g.minutesToKickoff || 0) / 600;
}

const PICK_LEAD = {
  won: (p) => `Our ${p} is home.`,
  lost: (p) => `Our ${p} is gone.`,
  push: (p) => `Our ${p} landed right on the number.`,
  ahead: (p) => `Our ${p} is on track.`,
  behind: (p) => `Our ${p} needs help.`,
  level: (p) => `Our ${p} is sitting on the number.`,
};
function liveLine(g) {
  if (g.maximusPick) {
    const lead = (PICK_LEAD[g.maximusPick.verdict] || ((p) => `Our ${p} is live here.`))(g.maximusPick.pick);
    // The page shows the clock beside this line, so the copy leaves it out.
    return `${lead} ${withoutClock(g.maximusPick.standing)}`.trim();
  }
  const late = g.period >= 4;
  if (g.favoriteTrailing && g.againstTheSpread) {
    return `Upset watch: ${g.againstTheSpread}${late ? ' in the fourth' : ''}.${g.againstTheTotal ? ` ${cap(g.againstTheTotal)}.` : ''}`;
  }
  if (late && g.margin <= 8 && g.againstTheSpread) {
    return `One score late. ${cap(g.againstTheSpread)}${g.againstTheTotal ? `; ${g.againstTheTotal}` : ''}.`;
  }
  const parts = [g.againstTheSpread, g.againstTheTotal].filter(Boolean);
  if (parts.length) return `${cap(parts.join('; '))}.`;
  return g.situation ? `${cap(g.situation)}.` : 'Under way.';
}
function nextLine(g) {
  const lines = [g.spread, isNum(g.total) ? `total ${g.total}` : null].filter(Boolean).join(', ');
  // The two facts most likely to change how a bettor sees the game.
  const facts = [
    g.maximusPick ? `our pick is ${g.maximusPick.pick}${g.maximusPick.price ? ` ${g.maximusPick.price}` : ''}${g.maximusPick.book ? ` at ${g.maximusPick.book}` : ''}` : null,
    (g.quarterbackNews || [])[0] || null,
    g.windMph >= 12 ? `${g.windMph} mph wind in the forecast` : null,
    g.ratingsVsMarket || null,
    g.unitMismatch || null,
    g.talentEdge || null,
    g.lineMove || null,
    g.rest || null,
    (g.stakes || [])[0] || null,
    g.marketWinChance ? `the market gives ${g.marketWinChance} to win` : null,
  ].filter(Boolean).slice(0, 2);
  return [lines ? `${cap(lines)}.` : null, ...facts.map((f) => `${cap(f)}.`)].filter(Boolean).join(' ');
}

export function buildEngineBrief(data) {
  const { counts, liveGames, gamesToCome, finals, maximusPicksThisWeek: mp, week } = data;
  const now = [...liveGames].sort((a, b) => liveRank(b) - liveRank(a)).slice(0, BRIEF_LIMITS.now)
    .map((g) => ({ gameId: g.gameId, text: liveLine(g) }));
  const next = [...gamesToCome].sort((a, b) => nextRank(b) - nextRank(a)).slice(0, BRIEF_LIMITS.next)
    .sort((a, b) => a.minutesToKickoff - b.minutesToKickoff)
    .map((g) => ({ gameId: g.gameId, text: nextLine(g) }));

  let headline;
  const ours = liveGames.map((g) => g.maximusPick?.verdict).filter(Boolean);
  const good = ours.filter((v) => v === 'ahead' || v === 'won').length;
  const bad = ours.filter((v) => v === 'behind' || v === 'lost').length;
  if (counts.live > 0 && ours.length > 0) {
    const state = good && bad ? `${word(good).toLowerCase()} of ours on track, ${word(bad).toLowerCase()} in trouble`
      : good ? (good === 1 ? 'and our pick is on track' : `and all ${word(good).toLowerCase()} of ours are on track`)
        : bad ? (bad === 1 ? 'and our pick needs help' : 'and our picks need help') : 'and ours is on the number';
    headline = good && bad ? `${word(counts.live)} live: ${state}` : `${word(counts.live)} live, ${state}`;
  } else if (counts.live > 0) headline = `${word(counts.live)} live, ${counts.toPlay ? `${word(counts.toPlay).toLowerCase()} still to come` : 'and the slate is nearly done'}`;
  else if (counts.toPlay > 0 && counts.final > 0) headline = `${word(counts.final)} down, ${word(counts.toPlay).toLowerCase()} to go in Week ${week}`;
  else if (counts.toPlay > 0) headline = `Week ${week} is on deck`;
  else headline = `Week ${week} is in the books`;

  const record = mp.won + mp.lost + mp.push > 0 ? `${mp.won}-${mp.lost}${mp.push ? `-${mp.push}` : ''} so far` : null;
  const picksBits = [
    mp.inPlay ? `${plural(mp.inPlay, 'pick')} in play` : null,
    mp.toCome ? `${plural(mp.toCome, 'pick')} to come` : null,
    record,
  ].filter(Boolean);
  const dek = [
    picksBits.length ? `Maximus has ${picksBits.join(', ')}.` : 'No bet clears the bar right now.',
    counts.live > 0 && counts.toPlay > 0 ? `${word(counts.toPlay)} still to play.` : null,
    data.nextKickoff ? `Next up: ${data.nextKickoff}.` : null,
  ].filter(Boolean).join(' ');

  const numbers = [];
  const livePick = liveGames.find((g) => g.maximusPick);
  if (livePick) {
    const m = livePick.maximusPick.standing.match(/^(\d+) points?/);
    if (m) numbers.push({ value: m[1], label: `points so far in ${livePick.away} at ${livePick.home}. We hold ${livePick.maximusPick.pick}.` });
  }
  const talent = [...gamesToCome].filter((g) => g.talentEdgePoints).sort((a, b) => b.talentEdgePoints - a.talentEdgePoints)[0];
  if (talent) numbers.push({ value: `${talent.talentEdgePoints}`, label: `point talent gap, the widest left: ${talent.talentEdge.split(':')[0].replace(' against ', ' vs ')}` });
  const windy = [...gamesToCome].filter((g) => g.windMph >= 10).sort((a, b) => b.windMph - a.windMph)[0];
  if (windy) numbers.push({ value: `${windy.windMph}`, label: `mph wind forecast for ${windy.away} at ${windy.home}, ${windy.window}` });
  const upset = liveGames.find((g) => g.favoriteTrailing);
  if (upset && numbers.length < 3) numbers.push({ value: upset.closingSpread?.split(' ')[1] || '!', label: `the closing spread in ${upset.away} at ${upset.home}, where the favorite is behind` });
  if (numbers.length < 3 && data.superBowlOdds[0]) numbers.push({ value: data.superBowlOdds[0].odds, label: `${data.superBowlOdds[0].team} to win the Super Bowl, the shortest price on the board` });

  const toCome = gamesToCome.find((g) => g.maximusPick);
  const take = toCome
    ? `Still to come, ${toCome.window}: ${toCome.maximusPick.pick}${toCome.maximusPick.price ? ` ${toCome.maximusPick.price}` : ''}${toCome.maximusPick.book ? ` at ${toCome.maximusPick.book}` : ''} in ${toCome.away} at ${toCome.home}. ${toCome.maximusPick.why}`
    : gamesToCome.length ? 'Nothing left on the board clears the bar for a bet. The leans are on the picks page; treat them as leans.'
      : finals.length ? `That is Week ${week}. The record and every graded pick are on the picks page.` : '';

  return clampBrief({ headline, dek, now, next, numbers: numbers.slice(0, BRIEF_LIMITS.numbers), take, also: '', source: 'engine' });
}

/* ── Claude: the same brief, in Maximus's voice ─────────────────────── */

export function briefPrompt(data, base) {
  const system = `You are Maximus, the voice of Maximus Sports: a small genius robot who reads the betting market the way other kids read picture books. You write the NFL brief on the home page.

VOICE
- Quick, confident, a little cheeky. Short sentences. Talk to one bettor, like a sharp friend with the model open.
- One dry joke or vivid image in the whole brief at most. Never mean, never hype, never baby talk.
- Specific beats clever. A number, a matchup or a consequence in every line.
- Have a read on everything. Do not just report a number: say what it means for someone holding a ticket, and whether you would be relaxed or nervous. A line that only restates the data is a failure.
- Sentence case. No word in capitals except team abbreviations. Name a game as away at home: "NYJ at LAC".

TIME
- It is ${data.now}. Write for this minute. Games in liveGames are being played now; games in gamesToCome have not started; finals are over.
- Lead with what is live or about to kick off. A finished game is context only: never the headline, never the first item, unless nothing is live and nothing is left to play.
- Say "this afternoon", "tonight", "Monday night". Never write as if it were an earlier day.

WHAT TO USE
- ONLY the JSON data. Every team, player, number, price, record and fact must be in it. Do not add history, injuries, players or storylines from memory.
- Use the facts that make a bettor see the game differently: againstTheSpread, againstTheTotal, favoriteTrailing, maximusPick and its standing, quarterbackNews, windMph and conditions, talentEdge, unitMismatch, ratingsVsMarket, spots (they carry real records), rest, lineMove, stakes, marketWinChance.
- Our recommended bets are only the maximusPick entries. State each with its price and book exactly as given, and its reason from "why". Anything else is a lean or context: never call it a pick, a play or a bet.
- Do NOT state a live score or the clock in "now" items. The page shows the live score next to your line. Say what the score means against the spread, the total or our pick.
- NEVER mention time left, the down, field position or who has the ball, anywhere in the brief, numbers included. Readers see this for several minutes and those go stale in seconds. Saying which quarter it is (from "stage") is fine.
- marketWinChance is the betting market's number, not ours: say "the market gives". ratingsLine and ratingsVsMarket are ours.
- Prices keep their sign (+150, -110). Spreads and totals exactly as given.
- No guarantees, no "lock", no "can't lose", no profanity.

FORMAT
Reply with one JSON object and nothing else. No markdown, no code fence.
{
  "headline": "max ${BRIEF_LIMITS.headline} characters, no period, about right now",
  "dek": "one or two sentences, max ${BRIEF_LIMITS.dek} characters, setting up the next few hours",
  "now": [{ "gameId": "from liveGames", "text": "one or two sentences, max ${BRIEF_LIMITS.item} characters" }],
  "next": [{ "gameId": "from gamesToCome", "text": "one or two sentences, max ${BRIEF_LIMITS.item} characters" }],
  "numbers": [{ "value": "a number or price from the data, max ${BRIEF_LIMITS.value} characters", "label": "what it is and why it matters, max ${BRIEF_LIMITS.label} characters" }],
  "take": "Maximus's own read on the best thing left on the board, max ${BRIEF_LIMITS.take} characters. If there is a maximusPick still to come, this is about it.",
  "also": "optional: one short paragraph on the playoff picture or the Super Bowl market, max ${BRIEF_LIMITS.also} characters. Empty string if it adds nothing."
}
- "now": up to ${BRIEF_LIMITS.now} live games, most interesting first (our picks, favorites in trouble, one-score games late). Empty array if nothing is live.
- "next": up to ${BRIEF_LIMITS.next} games still to come, in kickoff order. Empty array if none are left.
- "numbers": exactly 3 when the data supports it. Each must be a different kind of fact.
- Do not start two items the same way. Do not repeat a fact across sections.`;

  const user = `DATA:\n${JSON.stringify(forModel(data))}\n\nA plain version of this brief, for reference on what matters (rewrite it, do not copy it):\n${JSON.stringify({ headline: base.headline, now: base.now, next: base.next })}\n\nWrite the brief now as one JSON object.`;
  return { system, user };
}

const clip = (t, n) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return stop > n * 0.5 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
};

function clampBrief(b) {
  return {
    headline: clip(b.headline, BRIEF_LIMITS.headline).replace(/[.]$/, ''),
    dek: clip(b.dek, BRIEF_LIMITS.dek),
    now: (b.now || []).slice(0, BRIEF_LIMITS.now).map((x) => ({ gameId: String(x.gameId), text: clip(x.text, BRIEF_LIMITS.item) })),
    next: (b.next || []).slice(0, BRIEF_LIMITS.next).map((x) => ({ gameId: String(x.gameId), text: clip(x.text, BRIEF_LIMITS.item) })),
    numbers: (b.numbers || []).slice(0, BRIEF_LIMITS.numbers).map((x) => ({ value: clip(x.value, BRIEF_LIMITS.value), label: clip(x.label, BRIEF_LIMITS.label) })),
    take: clip(b.take, BRIEF_LIMITS.take),
    also: clip(b.also, BRIEF_LIMITS.also),
    source: b.source,
  };
}

/**
 * Check a model reply against the data. Returns a clean brief, or null when
 * the reply is not usable: not JSON, missing the headline, or built around
 * games that are not on the slate.
 */
export function parseBrief(raw, data) {
  if (!raw || typeof raw !== 'string') return null;
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!obj || typeof obj.headline !== 'string' || obj.headline.trim().length < 4) return null;

  const liveIds = new Set(data.liveGames.map((g) => g.gameId));
  const nextIds = new Set(data.gamesToCome.map((g) => g.gameId));
  const items = (list, ids) => (Array.isArray(list) ? list : [])
    .filter((x) => x && typeof x.text === 'string' && x.text.trim() && ids.has(String(x.gameId)))
    .filter((x, i, all) => all.findIndex((y) => String(y.gameId) === String(x.gameId)) === i);
  const now = items(obj.now, liveIds);
  const next = items(obj.next, nextIds);
  // A brief that ignores what is live, or what is left, has missed the point.
  if (liveIds.size > 0 && now.length === 0) return null;
  if (liveIds.size === 0 && nextIds.size > 0 && next.length === 0) return null;

  const order = new Map(data.gamesToCome.map((g, i) => [g.gameId, i]));
  next.sort((a, b) => order.get(String(a.gameId)) - order.get(String(b.gameId)));
  const numbers = (Array.isArray(obj.numbers) ? obj.numbers : [])
    .filter((x) => x && String(x.value ?? '').trim() && typeof x.label === 'string' && x.label.trim());
  const fix = (t) => dropStale(fixPositiveOdds(String(t ?? '')));
  const kept = (list) => list.map((x) => ({ gameId: x.gameId, text: fix(x.text) })).filter((x) => x.text);
  const nowKept = kept(now);
  if (liveIds.size > 0 && nowKept.length === 0) return null;
  return clampBrief({
    headline: fix(obj.headline),
    dek: fix(obj.dek),
    now: nowKept,
    next: kept(next),
    numbers: numbers.map((x) => ({ value: fixPositiveOdds(String(x.value)), label: fix(x.label) })).filter((x) => x.label),
    take: fix(obj.take),
    also: fix(obj.also),
    source: 'claude',
  });
}

/** The brief as plain paragraphs, for anything that still wants text. */
export function briefToText(brief, data) {
  if (!brief) return '';
  const name = new Map([...data.liveGames, ...data.gamesToCome].map((g) => [g.gameId, `**${g.away} at ${g.home}**`]));
  const list = (items) => items.map((x) => `${name.get(x.gameId) || ''}: ${x.text}`).join(' ');
  return [
    [brief.headline ? `${brief.headline}.` : '', brief.dek].filter(Boolean).join(' '),
    brief.now.length ? list(brief.now) : '',
    brief.next.length ? list(brief.next) : '',
    brief.take,
    brief.also,
  ].filter(Boolean).join('\n\n');
}
