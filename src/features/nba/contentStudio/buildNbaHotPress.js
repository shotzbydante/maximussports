/**
 * buildNbaHotPress — "Hot Off The Press" bullet builder for NBA Daily
 * Briefing. PLAYOFF-AWARE.
 *
 * Series importance scoring (Phase B audit Part 3):
 *   isClincher          120
 *   isComplete          100   (recent series wrap)
 *   isGameSeven          95
 *   isElimination        90   (next game can end the series)
 *   isCloseoutGame       85   (leader has 3, but not necessarily today)
 *   isUpset              75
 *   isSwingGame          65   (1-1 / 2-2 with active next game)
 *   has recent final     50
 *   has next game        30
 *
 * The score is computed per series candidate and used to RANK rather
 * than the previous priority constants. Bullets are then formatted
 * with playoff-aware narrative templates (audit Part 4):
 *   Clincher  : "Timberwolves eliminate Nuggets 4-2 — a major Round 1 surprise."
 *   Closeout  : "Lakers lead Rockets 3-2 entering Game 6 — L.A. can close the series tonight."
 *   Game 7    : "Celtics and 76ers are tied 3-3 — Game 7 decides the series."
 *   Swing     : "Cavaliers and Raptors are tied 1-1 — Game 3 swings the series."
 *   Upset     : "Hawks lead Knicks 2-1 — the lower seed has flipped home-court pressure."
 *
 * Strict exclusions:
 *   - isStalePlaceholder series (no game signal in window)
 *   - completed series older than 48hr (the clincher narrative ages out)
 *   - 0-0 placeholder bullets unless Game 1 is genuinely upcoming
 */

import { extractGameStories, teamName, seriesTagLower, findSecondStory } from './buildNbaDailyHeadline.js';
import { NBA_TEAMS } from '../../../sports/nba/teams.js';

const MAX_BULLETS = 4;
const CLINCHER_FRESHNESS_MS = 48 * 60 * 60 * 1000;

function nameOf(slug) {
  if (!slug) return '???';
  const t = NBA_TEAMS.find(t => t.slug === slug);
  if (!t) return slug.toUpperCase();
  if (/Trail Blazers$/i.test(t.name)) return 'Trail Blazers';
  return t.name.split(' ').slice(-1)[0];
}

/** Score a series for HOTP ranking — Phase B audit Part 3 spec. */
function scoreSeriesEvent(s) {
  if (!s || s.isStalePlaceholder) return 0;
  let score = 0;
  if (s.isClincher) score += 120;
  if (s.isComplete) score += 100;
  if (s.isGameSeven) score += 95;
  if (s.isElimination) score += 90;
  if (s.isCloseoutGame) score += 85;
  if (s.isUpset) score += 75;
  if (s.isSwingGame) score += 65;
  if (s.mostRecentGame) score += 50;
  if (s.nextGame) score += 30;
  return score;
}

// ── Narrative templates ─────────────────────────────────────────────

function clincherText(s) {
  const winner = s.winnerSlug === s.topTeam?.slug ? s.topTeam : s.bottomTeam;
  const loser = s.winnerSlug === s.topTeam?.slug ? s.bottomTeam : s.topTeam;
  if (!winner || !loser) return null;
  const winnerName = winner.name || winner.abbrev;
  const loserName = loser.name || loser.abbrev;
  const winsW = Math.max(s.seriesScore?.top ?? 0, s.seriesScore?.bottom ?? 0);
  const winsL = Math.min(s.seriesScore?.top ?? 0, s.seriesScore?.bottom ?? 0);
  const verb = s.isUpset ? 'eliminate' : 'beat';
  const tag = s.isUpset ? ' — a major Round 1 surprise.' : '.';
  return `${winnerName} ${verb} ${loserName} ${winsW}-${winsL}${tag}`;
}

function gameSevenText(s) {
  const a = s.topTeam?.abbrev || s.topTeam?.slug?.toUpperCase();
  const b = s.bottomTeam?.abbrev || s.bottomTeam?.slug?.toUpperCase();
  if (!a || !b) return null;
  const aName = nameOf(s.topTeam?.slug);
  const bName = nameOf(s.bottomTeam?.slug);
  return `${aName} and ${bName} are tied ${s.seriesScore.top}-${s.seriesScore.bottom} — Game 7 decides the series.`;
}

function closeoutText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leader = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailer = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leader || !trailer) return null;
  const leaderName = nameOf(leader.slug);
  const trailerName = nameOf(trailer.slug);
  const lead = Math.max(ts, bs);
  const trail = Math.min(ts, bs);
  const gameNum = s.nextGameNumber || (ts + bs + 1);
  // City-style short name e.g. "L.A." for the closeout phrasing
  const leaderCity = teamCity(leader.slug) || leaderName;
  return `${leaderName} lead ${trailerName} ${lead}-${trail} entering Game ${gameNum} — ${leaderCity} can close the series tonight.`;
}

function eliminationText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leader = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailer = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leader || !trailer) return null;
  const leaderName = nameOf(leader.slug);
  const trailerName = nameOf(trailer.slug);
  const gameNum = s.nextGameNumber || (ts + bs + 1);
  return `${leaderName} lead ${trailerName} ${Math.max(ts, bs)}-${Math.min(ts, bs)} entering Game ${gameNum} — closeout chance.`;
}

function swingText(s) {
  const a = nameOf(s.topTeam?.slug);
  const b = nameOf(s.bottomTeam?.slug);
  const tied = s.seriesScore?.top ?? 0;
  const gameNum = s.nextGameNumber || (tied * 2 + 1);
  return `${a} and ${b} are tied ${tied}-${tied} — Game ${gameNum} swings the series.`;
}

function upsetText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leader = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailer = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leader || !trailer) return null;
  const leaderName = nameOf(leader.slug);
  const trailerName = nameOf(trailer.slug);
  const lead = Math.max(ts, bs);
  const trail = Math.min(ts, bs);
  return `${leaderName} lead ${trailerName} ${lead}-${trail} — the lower seed has flipped home-court pressure.`;
}

function activeSeriesText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const a = nameOf(s.topTeam?.slug);
  const b = nameOf(s.bottomTeam?.slug);
  const gameNum = s.nextGameNumber || (ts + bs + 1);

  if (ts > bs) return `${a} lead ${b} ${ts}-${bs} entering Game ${gameNum}.`;
  if (bs > ts) return `${b} lead ${a} ${bs}-${ts} entering Game ${gameNum}.`;
  if ((ts + bs) === 0 && s.nextGame) return `${a} and ${b} open the series tonight.`;
  return null;
}

function teamCity(slug) {
  if (!slug) return null;
  const t = NBA_TEAMS.find(t => t.slug === slug);
  if (!t) return null;
  // Conventional city short tag for closeout copy
  const cityMap = {
    lal: 'L.A.', lac: 'L.A.', gsw: 'Golden State', sf: 'Bay Area',
    bos: 'Boston', nyk: 'New York', bkn: 'Brooklyn', phi: 'Philly',
    mia: 'Miami', orl: 'Orlando', atl: 'Atlanta', cha: 'Charlotte',
    det: 'Detroit', cle: 'Cleveland', mil: 'Milwaukee', chi: 'Chicago', ind: 'Indiana',
    tor: 'Toronto', was: 'D.C.',
    okc: 'OKC', hou: 'Houston', sas: 'San Antonio', dal: 'Dallas', mem: 'Memphis', nop: 'New Orleans',
    den: 'Denver', min: 'Minnesota', uta: 'Utah', por: 'Portland', sac: 'Sacramento',
    phx: 'Phoenix',
  };
  return cityMap[slug] || null;
}

// ── Bullet builder by event type ────────────────────────────────────

function bulletForSeries(s, score) {
  const isFreshClincher = s.isClincher && s.mostRecentGameTs &&
    (Date.now() - s.mostRecentGameTs) <= CLINCHER_FRESHNESS_MS;

  let text = null;
  let _source = 'series';

  if (isFreshClincher) {
    text = clincherText(s);
    _source = 'clincher';
  } else if (s.isGameSeven) {
    text = gameSevenText(s);
    _source = 'game7';
  } else if (s.isCloseoutGame && s.isElimination && s.nextGame) {
    text = closeoutText(s);
    _source = 'closeout';
  } else if (s.isElimination && s.nextGame) {
    text = eliminationText(s);
    _source = 'elimination';
  } else if (s.isUpset && !s.isComplete) {
    text = upsetText(s);
    _source = 'upset';
  } else if (s.isSwingGame) {
    text = swingText(s);
    _source = 'swing';
  } else if (!s.isComplete) {
    text = activeSeriesText(s);
    _source = 'active_series';
  } else if (s.isComplete) {
    // Past clincher (>48hr) — surface as "team awaits next opponent"
    const winner = s.winnerSlug === s.topTeam?.slug ? s.topTeam : s.bottomTeam;
    if (winner) {
      text = `${nameOf(winner.slug)} await their next opponent.`;
      _source = 'awaiting';
    }
  }

  if (!text) return null;
  return {
    text,
    logoSlug: pickLogoSlug(s, _source),
    source: _source,
    _score: score,
  };
}

function pickLogoSlug(s, source) {
  if (source === 'clincher') return s.winnerSlug;
  if (source === 'awaiting') return s.winnerSlug;
  if (source === 'closeout' || source === 'elimination') {
    const ts = s.seriesScore?.top ?? 0;
    const bs = s.seriesScore?.bottom ?? 0;
    return ts >= bs ? s.topTeam?.slug : s.bottomTeam?.slug;
  }
  if (source === 'upset') {
    const ts = s.seriesScore?.top ?? 0;
    const bs = s.seriesScore?.bottom ?? 0;
    return ts >= bs ? s.topTeam?.slug : s.bottomTeam?.slug;
  }
  return s.topTeam?.slug || s.bottomTeam?.slug;
}

// ── Game-story bullets (close/blowout/individual finals) ────────────

function bulletForGameStory(story) {
  const w = teamName(story.winSlug);
  const l = teamName(story.loseSlug);
  const score = `${story.winScore}-${story.loseScore}`;
  const tag = seriesTagLower(story);
  if (story.isSweep) return `${w} sweep ${l} ${score}${tag}.`;
  if (story.isGame7Win) return `${w} win Game 7 over ${l} ${score} and advance.`;
  if (story.isClinch) return `${w} close out ${l} ${score}${tag}.`;
  if (story.isElimWin) return `${w} beat ${l} ${score}${tag} — one win from closing out.`;
  if (story.isUpset) return `${w} pull the upset over ${l} ${score}${tag}.`;
  if (story.isStolenRoadWin && story.winSeriesWins >= story.loseSeriesWins) {
    return `${w} steal one on the road from ${l} ${score}${tag}.`;
  }
  if (story.type === 'blowout') return `${w} roll past ${l} ${score}${tag}.`;
  if (story.type === 'close') return `${w} edge ${l} ${score}${tag}.`;
  return `${w} beat ${l} ${score}${tag}.`;
}

// ── Last-resort filler ──────────────────────────────────────────────

function neutralUpcomingBullets(liveGames, excludeSlugs) {
  return (liveGames || [])
    .filter(g => g?.status === 'upcoming' && !g?.gameState?.isFinal && !g?.gameState?.isLive)
    .filter(g => {
      const a = g?.teams?.away?.slug;
      const h = g?.teams?.home?.slug;
      return a && h && !excludeSlugs.has(a) && !excludeSlugs.has(h);
    })
    .map(g => {
      const home = g.teams.home;
      const away = g.teams.away;
      return {
        text: `${home.name || home.abbrev} host ${away.name || away.abbrev} tonight.`,
        logoSlug: home.slug || null,
        source: 'neutral_upcoming',
        _score: 20,
      };
    });
}

/**
 * Main HOTP builder.
 *
 * @param {object} opts
 * @param {Array}  opts.liveGames
 * @param {object} [opts.playoffContext]
 * @returns {Array<{ text, logoSlug, source }>}  up to 4 bullets, score-ranked
 */
export function buildNbaHotPress({ liveGames = [], playoffContext = null } = {}) {
  const candidates = [];
  const excludeSlugs = new Set();

  // ── Series-driven candidates (every active non-stale series gets scored) ──
  const seriesList = (playoffContext?.series || []).filter(s => !s.isStalePlaceholder);
  for (const s of seriesList) {
    const score = scoreSeriesEvent(s);
    if (score === 0) continue;
    // For completed series older than 48hr, suppress unless really fresh
    const isStale = s.isComplete && s.mostRecentGameTs &&
      (Date.now() - s.mostRecentGameTs) > CLINCHER_FRESHNESS_MS;
    if (isStale) continue;
    const bullet = bulletForSeries(s, score);
    if (bullet) candidates.push(bullet);
  }

  // ── Game-story candidates (individual final-game narratives) ──
  // These complement series-level bullets when there's a notably close
  // or blowout result that the series rollup doesn't surface.
  const stories = extractGameStories(liveGames, playoffContext);
  const usedGameIds = new Set();
  for (const story of stories) {
    if (usedGameIds.has(story.gameId)) continue;
    usedGameIds.add(story.gameId);
    candidates.push({
      text: bulletForGameStory(story),
      logoSlug: story.winSlug,
      source: 'game_story',
      _score: story.priority || 40,
    });
  }

  // ── Neutral upcoming filler (only if we're starved) ──
  if (candidates.length < MAX_BULLETS) {
    const filler = neutralUpcomingBullets(liveGames, excludeSlugs);
    candidates.push(...filler);
  }

  // ── Rank, dedupe by team slug, take top N ──
  candidates.sort((a, b) => (b._score || 0) - (a._score || 0));

  const final = [];
  const used = new Set();
  for (const c of candidates) {
    if (final.length >= MAX_BULLETS) break;
    // Don't repeat the same team across consecutive HOTP slots
    if (c.logoSlug && used.has(c.logoSlug)) continue;
    final.push({ text: c.text, logoSlug: c.logoSlug, source: c.source });
    if (c.logoSlug) used.add(c.logoSlug);
  }

  return final;
}

export default buildNbaHotPress;
export { scoreSeriesEvent };
