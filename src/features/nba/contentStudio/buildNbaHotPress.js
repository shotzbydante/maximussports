/**
 * buildNbaHotPress — "Hot Off The Press" bullet builder for NBA Daily
 * Briefing. PLAYOFF-AWARE.
 *
 * Priority order (per Part 4 of the data-accuracy audit):
 *   1. Series-clinching results in the last 24-48hr
 *      → "Timberwolves beat Nuggets to win the series 4-2."
 *   2. Elimination games today
 *      → "Lakers lead Rockets 3-2 entering Game 6 tonight."
 *   3. Major upset / road steal / underdog series lead
 *   4. Today's pivot games (Game 2/3 with active series)
 *   5. Other current playoff storylines (close games, blowouts)
 *   6. Upcoming neutral games (last resort, only when other slots empty)
 *
 * STRICT EXCLUSIONS (this is the data-accuracy fix):
 *   - Stale "series tied 0-0" placeholders for matchups with NO finals
 *     AND NO upcoming game in the schedule window. Phase 4 of the data
 *     audit calls this out explicitly: don't show OKC-PlayInWinner as a
 *     "pivot game up next" when no game has been played and no game is
 *     scheduled in the window.
 *   - Completed series shown as "upcoming"
 *   - Finals older than 48hr unless they remain narrative-relevant via
 *     isClincher
 *
 * Empty array signals true no-slate; caption/autopost layers handle
 * that explicitly.
 */

import { extractGameStories, teamName, seriesTagLower, findSecondStory } from './buildNbaDailyHeadline.js';

function bulletForStory(s) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const tag = seriesTagLower(s);

  if (s.isSweep) return `${w} sweep ${l} ${score}${tag}.`;
  if (s.isGame7Win) return `${w} win Game 7 over ${l} ${score} and advance.`;
  if (s.isClinch) return `${w} close out ${l} ${score}${tag}.`;
  if (s.isElimWin) return `${w} beat ${l} ${score}${tag} — one win from closing out.`;
  if (s.isUpset) return `${w} pull the upset over ${l} ${score}${tag}.`;
  if (s.isStolenRoadWin && s.winSeriesWins >= s.loseSeriesWins) {
    return `${w} steal one on the road from ${l} ${score}${tag}.`;
  }
  if (s.type === 'blowout') return `${w} roll past ${l} ${score}${tag}.`;
  if (s.type === 'close') return `${w} edge ${l} ${score}${tag}.`;
  return `${w} beat ${l} ${score}${tag}.`;
}

/**
 * Build bullets describing CLINCHED series (priority #1).
 *
 * Reads playoffContext.completedSeries; the most-recent clincher in the
 * last 48hr is surfaced first. Each completed series renders as a single
 * bullet (we don't repeat the clinching game AND the series result).
 */
function clincherBullets(playoffContext) {
  const completed = (playoffContext?.completedSeries || [])
    .filter(s => s.isClincher && s.mostRecentGameTs)
    .sort((a, b) => (b.mostRecentGameTs || 0) - (a.mostRecentGameTs || 0));

  return completed.map(s => {
    const winnerSide = s.winnerSlug === s.topTeam?.slug ? s.topTeam : s.bottomTeam;
    const loserSide  = s.winnerSlug === s.topTeam?.slug ? s.bottomTeam : s.topTeam;
    if (!winnerSide || !loserSide) return null;
    const w = winnerSide.name || winnerSide.abbrev;
    const l = loserSide.name || loserSide.abbrev;
    const ts = s.seriesScore?.top ?? 0;
    const bs = s.seriesScore?.bottom ?? 0;
    const winsW = Math.max(ts, bs);
    const winsL = Math.min(ts, bs);
    const verb = s.isUpset ? 'eliminate' : 'beat';
    const upsetTag = s.isUpset ? ' — a major Round 1 surprise' : '';
    return {
      text: `${w} ${verb} ${l} to win the series ${winsW}-${winsL}${upsetTag}.`,
      logoSlug: winnerSide.slug || null,
      _priority: 100,
      _source: 'clincher',
    };
  }).filter(Boolean);
}

/**
 * Build bullets for elimination games scheduled TODAY (priority #2).
 */
function eliminationTodayBullets(playoffContext) {
  const elim = (playoffContext?.eliminationGames || [])
    .filter(s => s.nextGame && !s.isComplete);

  return elim.map(s => {
    const leader  = s.eliminationFor === 'top' ? s.bottomTeam : s.topTeam;
    const trailer = s.eliminationFor === 'top' ? s.topTeam : s.bottomTeam;
    if (!leader || !trailer) return null;
    const ts = s.seriesScore?.top ?? 0;
    const bs = s.seriesScore?.bottom ?? 0;
    const lead = Math.max(ts, bs);
    const trail = Math.min(ts, bs);
    const gameNum = s.nextGameNumber || (ts + bs + 1);
    return {
      text: `${leader.name || leader.abbrev} lead ${trailer.name || trailer.abbrev} ${lead}-${trail} entering Game ${gameNum} tonight — closeout chance.`,
      logoSlug: leader.slug || null,
      _priority: 90,
      _source: 'elimination',
    };
  }).filter(Boolean);
}

/**
 * Active upset / underdog-series-lead bullets (priority #3).
 */
function upsetBullets(playoffContext, excludeMatchupIds) {
  return (playoffContext?.upsetWatch || [])
    .filter(s => !s.isComplete && !excludeMatchupIds.has(s.matchupId))
    .map(s => {
      const leader = s.leader === 'top' ? s.topTeam : s.bottomTeam;
      const trailer = s.leader === 'top' ? s.bottomTeam : s.topTeam;
      if (!leader || !trailer) return null;
      return {
        text: `${leader.name || leader.abbrev} (${leader.seed}) lead ${trailer.name || trailer.abbrev} (${trailer.seed}) — ${s.seriesScore.summary}.`,
        logoSlug: leader.slug || null,
        _priority: 75,
        _source: 'upset',
      };
    })
    .filter(Boolean);
}

/**
 * Pivot-game / active-series-with-real-state bullets (priority #4-5).
 *
 * EXCLUDES isStalePlaceholder series (the "0-0 with no schedule" rows
 * that caused the user-reported bug).
 */
function activeSeriesBullets(playoffContext, excludeMatchupIds) {
  return (playoffContext?.series || [])
    .filter(s => !s.isStalePlaceholder)
    .filter(s => !s.isComplete)
    .filter(s => !excludeMatchupIds.has(s.matchupId))
    .map(s => {
      const ts = s.seriesScore?.top ?? 0;
      const bs = s.seriesScore?.bottom ?? 0;
      const a = s.topTeam;
      const b = s.bottomTeam;
      if (!a || !b) return null;
      const aName = a.name || a.abbrev;
      const bName = b.name || b.abbrev;
      const gameNum = s.nextGameNumber || (ts + bs + 1);

      let text;
      let logoSlug;
      let priority = 50;
      if (ts > bs) {
        text = `${aName} lead ${bName} ${ts}-${bs} entering Game ${gameNum}.`;
        logoSlug = a.slug;
      } else if (bs > ts) {
        text = `${bName} lead ${aName} ${bs}-${ts} entering Game ${gameNum}.`;
        logoSlug = b.slug;
      } else if (ts === bs && (ts + bs) > 0) {
        // Series tied with games played — pivot game framing
        text = `${aName} and ${bName} tied ${ts}-${bs} — Game ${gameNum} swings the series.`;
        logoSlug = a.slug;
        priority = 65;
      } else {
        // ts === bs === 0 BUT we have a scheduled next game (otherwise
        // isStalePlaceholder would be true). This is "Game 1 tonight".
        text = `${aName} and ${bName} open the series tonight.`;
        logoSlug = a.slug;
        priority = 40;
      }

      return { text, logoSlug, _priority: priority, _source: 'active_series' };
    })
    .filter(Boolean);
}

/**
 * Last-resort filler: upcoming non-playoff-tracked games today.
 */
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
        _priority: 20,
        _source: 'neutral_upcoming',
      };
    });
}

/**
 * Result-driven bullets from raw final-game stories (when story-priority
 * info is richer than the per-series rollup, e.g. blowouts/close finishes
 * that don't trip the clincher/elim filters).
 */
function gameStoryBullets(liveGames, playoffContext, excludeMatchupIds) {
  const stories = extractGameStories(liveGames, playoffContext);
  const out = [];
  const usedIds = new Set();

  function add(s) {
    if (!s || usedIds.has(s.gameId)) return;
    if (excludeMatchupIds.has(s.series?.matchupId)) return;
    out.push({
      text: bulletForStory(s),
      logoSlug: s.winSlug,
      _priority: s.priority || 50,
      _source: 'story',
    });
    usedIds.add(s.gameId);
  }

  if (stories.length === 0) return out;
  add(stories[0]);
  const second = findSecondStory(stories, stories[0]);
  if (second) add(second);
  for (const s of stories) {
    if (out.length >= 4) break;
    add(s);
  }
  return out;
}

/**
 * Main HOTP builder.
 *
 * @param {object} opts
 * @param {Array}  opts.liveGames
 * @param {object} [opts.playoffContext]
 * @returns {Array<{ text, logoSlug }>}  up to 4 bullets, priority-ranked
 */
export function buildNbaHotPress({ liveGames = [], playoffContext = null } = {}) {
  const all = [];
  const excludeMatchups = new Set();
  const excludeSlugs = new Set();

  // ── Priority 1: clinchers ──
  for (const b of clincherBullets(playoffContext)) {
    all.push(b);
    // We don't know the matchupId on the bullet (we don't carry it
    // through the bullet contract for back-compat), so use logoSlug as
    // a proxy to avoid double-billing the same team in lower priorities.
    if (b.logoSlug) excludeSlugs.add(b.logoSlug);
  }

  // ── Priority 2: elimination today ──
  for (const b of eliminationTodayBullets(playoffContext)) {
    if (b.logoSlug && excludeSlugs.has(b.logoSlug)) continue;
    all.push(b);
    if (b.logoSlug) excludeSlugs.add(b.logoSlug);
  }

  // Build matchup-id exclusion set from active-series view of the same
  // collections we've already covered, so per-series bullets don't
  // duplicate the elim/upset framing.
  const eliminatedIds = (playoffContext?.eliminationGames || []).map(s => s.matchupId);
  const upsetIds = (playoffContext?.upsetWatch || []).map(s => s.matchupId);
  for (const id of eliminatedIds) excludeMatchups.add(id);

  // ── Priority 3: upsets ──
  for (const b of upsetBullets(playoffContext, excludeMatchups)) {
    if (b.logoSlug && excludeSlugs.has(b.logoSlug)) continue;
    all.push(b);
    if (b.logoSlug) excludeSlugs.add(b.logoSlug);
  }
  for (const id of upsetIds) excludeMatchups.add(id);

  // ── Priority 4-5: active series + game stories ──
  for (const b of gameStoryBullets(liveGames, playoffContext, excludeMatchups)) {
    if (b.logoSlug && excludeSlugs.has(b.logoSlug)) continue;
    all.push(b);
    if (b.logoSlug) excludeSlugs.add(b.logoSlug);
  }
  for (const b of activeSeriesBullets(playoffContext, excludeMatchups)) {
    if (b.logoSlug && excludeSlugs.has(b.logoSlug)) continue;
    all.push(b);
    if (b.logoSlug) excludeSlugs.add(b.logoSlug);
  }

  // ── Priority 6: neutral upcoming (last resort) ──
  if (all.length < 4) {
    for (const b of neutralUpcomingBullets(liveGames, excludeSlugs)) {
      if (all.length >= 4) break;
      all.push(b);
      if (b.logoSlug) excludeSlugs.add(b.logoSlug);
    }
  }

  // Sort by priority desc, take up to 4, strip internals
  all.sort((a, b) => (b._priority || 0) - (a._priority || 0));
  return all.slice(0, 4).map(({ text, logoSlug, _source }) => ({
    text,
    logoSlug,
    source: _source,
  }));
}

export default buildNbaHotPress;
