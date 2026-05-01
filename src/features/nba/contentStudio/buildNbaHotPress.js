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

// ── Narrative templates — ESPN alert + Vegas edge voice ────────────
//
// Voice rules (audit Part 1):
//   - Always include series score when available
//   - Always include why-it-matters (closeout / elimination / upset /
//     market pressure / title-path)
//   - Punchy, ≤ ~135 chars, breaking-alert tone
//   - Lead with a charged emoji (🚨 / 🔥 / ⚔️ / 📈 / 👀) so the bullet
//     reads like a notification, not a paragraph
//   - Reference the betting board / market when the moment is genuinely
//     market-moving (clincher of an upset, Game 7, closeout)

function clincherText(s) {
  const winner = s.winnerSlug === s.topTeam?.slug ? s.topTeam : s.bottomTeam;
  const loser = s.winnerSlug === s.topTeam?.slug ? s.bottomTeam : s.topTeam;
  if (!winner || !loser) return null;
  const winnerName = nameOf(winner.slug);
  const loserName = nameOf(loser.slug);
  const winsW = Math.max(s.seriesScore?.top ?? 0, s.seriesScore?.bottom ?? 0);
  const winsL = Math.min(s.seriesScore?.top ?? 0, s.seriesScore?.bottom ?? 0);
  const conf = s.conference === 'Western' ? 'West' : s.conference === 'Eastern' ? 'East' : null;

  if (s.isUpset && winsL <= 1) {
    // Sweep or 4-1 upset — strongest market reaction
    return `🚨 ${winnerName} finish ${loserName} ${winsW}–${winsL} — ${conf ? `${conf} bracket flips` : 'bracket flips'} and a major upset ticket cashes.`;
  }
  if (s.isUpset) {
    return `🚨 ${winnerName} finish ${loserName} ${winsW}–${winsL} — ${conf ? `${conf} bracket reshuffles` : 'bracket reshuffles'} and the upset reprices the title path.`;
  }
  if (winsL === 0) {
    return `🚨 ${winnerName} sweep ${loserName} ${winsW}–${winsL} — sitting on rest and momentum while the rest of the bracket grinds.`;
  }
  return `🚨 ${winnerName} eliminate ${loserName} ${winsW}–${winsL} — series is over and ${winnerName} await the next round.`;
}

function gameSevenText(s) {
  if (!s.topTeam || !s.bottomTeam) return null;
  const aName = nameOf(s.topTeam?.slug);
  const bName = nameOf(s.bottomTeam?.slug);
  return `⚔️ ${aName}–${bName} goes the distance — Game 7 decides the series and the market's next title-path shakeup.`;
}

function closeoutText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leaderTeam = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailerTeam = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leaderTeam || !trailerTeam) return null;
  const leaderName = nameOf(leaderTeam.slug);
  const trailerName = nameOf(trailerTeam.slug);
  const lead = Math.max(ts, bs);
  const trail = Math.min(ts, bs);
  const gameNum = s.nextGameNumber || (ts + bs + 1);
  const leaderCity = teamCity(leaderTeam.slug) || leaderName;
  return `🔥 ${leaderName} lead ${trailerName} ${lead}–${trail} entering Game ${gameNum} — ${leaderCity} gets the first closeout shot, with ${trailerName}'s season on the line.`;
}

function eliminationText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leaderTeam = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailerTeam = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leaderTeam || !trailerTeam) return null;
  const leaderName = nameOf(leaderTeam.slug);
  const trailerName = nameOf(trailerTeam.slug);
  const gameNum = s.nextGameNumber || (ts + bs + 1);
  return `🔥 ${trailerName} face elimination — ${leaderName} lead ${Math.max(ts, bs)}–${Math.min(ts, bs)} entering Game ${gameNum}, market tightening on the favorite.`;
}

function swingText(s) {
  if (!s.topTeam || !s.bottomTeam) return null;
  const a = nameOf(s.topTeam?.slug);
  const b = nameOf(s.bottomTeam?.slug);
  const tied = s.seriesScore?.top ?? 0;
  const gameNum = s.nextGameNumber || (tied * 2 + 1);
  return `📈 ${a}–${b} hits Game ${gameNum} tied ${tied}–${tied} — winner grabs series control and pricing leverage.`;
}

function upsetText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leaderTeam = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailerTeam = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leaderTeam || !trailerTeam) return null;
  const leaderName = nameOf(leaderTeam.slug);
  const trailerName = nameOf(trailerTeam.slug);
  const lead = Math.max(ts, bs);
  const trail = Math.min(ts, bs);
  return `👀 ${trailerName} are in trouble — ${leaderName} lead ${lead}–${trail} and have flipped home-court pressure.`;
}

function activeSeriesText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const a = nameOf(s.topTeam?.slug);
  const b = nameOf(s.bottomTeam?.slug);
  const gameNum = s.nextGameNumber || (ts + bs + 1);

  if (ts > bs) return `📊 ${a} lead ${b} ${ts}–${bs} entering Game ${gameNum} — series control on the line.`;
  if (bs > ts) return `📊 ${b} lead ${a} ${bs}–${ts} entering Game ${gameNum} — series control on the line.`;
  if ((ts + bs) === 0 && s.nextGame) return `📊 ${a}–${b} tip Game 1 tonight — Round 1 begins.`;
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

/**
 * Single-entry helper that returns the strongest available narrative
 * string for a given series. Audit Part 1 explicitly requested this so
 * other surfaces (caption, email, autopost diagnostics) emit identical
 * voice without needing to re-implement the priority chain.
 */
export function buildNbaHotpNarrative(series) {
  if (!series || series.isStalePlaceholder) return null;
  const isFreshClincher = series.isClincher && series.mostRecentGameTs &&
    (Date.now() - series.mostRecentGameTs) <= CLINCHER_FRESHNESS_MS;
  if (isFreshClincher) return clincherText(series);
  if (series.isGameSeven) return gameSevenText(series);
  if (series.isCloseoutGame && series.isElimination && series.nextGame) return closeoutText(series);
  if (series.isElimination && series.nextGame) return eliminationText(series);
  if (series.isUpset && !series.isComplete) return upsetText(series);
  if (series.isSwingGame) return swingText(series);
  if (!series.isComplete) return activeSeriesText(series);
  return null;
}

export default buildNbaHotPress;
export { scoreSeriesEvent };
