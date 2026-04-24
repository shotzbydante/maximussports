/**
 * buildNbaHotPress — "Hot Off The Press" bullet builder for the NBA Daily
 * Briefing Slide 2. PLAYOFF-AWARE.
 *
 * Every bullet:
 *   - references a real completed game (winner + loser + score)
 *   - includes playoff implication (series score, elimination pressure,
 *     clinch, upset)
 *   - NEVER uses generic regular-season phrasing
 *
 * Fallback hierarchy:
 *   1. Result-driven bullets from today's playoff finals
 *   2. Upcoming-slate bullets framed as "tonight's elimination game" /
 *      "series tied at 2 — pivot game tonight" (still concrete, still
 *      playoff-specific)
 *   3. Nothing — returns an empty array. The caption builder rejects zero
 *      bullets in playoff mode, which signals "true no-slate" to the
 *      autopost (same pattern as MLB's no-slate handling).
 */

import { extractGameStories, teamName, seriesTagLower, findSecondStory } from './buildNbaDailyHeadline.js';

function bulletForStory(s) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const tag = seriesTagLower(s);

  if (s.isSweep) {
    return `${w} sweep ${l} ${score}${tag}.`;
  }
  if (s.isGame7Win) {
    return `${w} win Game 7 over ${l} ${score} and advance.`;
  }
  if (s.isClinch) {
    return `${w} close out ${l} ${score}${tag}.`;
  }
  if (s.isElimWin) {
    return `${w} beat ${l} ${score}${tag} — one win from closing out.`;
  }
  if (s.isUpset) {
    return `${w} pull the upset over ${l} ${score}${tag}.`;
  }
  if (s.isStolenRoadWin && s.winSeriesWins >= s.loseSeriesWins) {
    return `${w} steal one on the road from ${l} ${score}${tag}.`;
  }
  if (s.type === 'blowout') {
    return `${w} roll past ${l} ${score}${tag}.`;
  }
  if (s.type === 'close') {
    return `${w} edge ${l} ${score}${tag}.`;
  }
  return `${w} beat ${l} ${score}${tag}.`;
}

function upcomingBullets(liveGames, playoffContext, maxBullets = 4) {
  const bullets = [];
  const upcoming = (liveGames || []).filter(g =>
    g?.status === 'upcoming' && !g?.gameState?.isFinal && !g?.gameState?.isLive
  );

  // Prioritize today's elimination games first
  const elim = playoffContext?.eliminationGames || [];
  for (const s of elim) {
    if (bullets.length >= maxBullets) break;
    const leader  = s.eliminationFor === 'top' ? s.bottomTeam : s.topTeam;
    const trailer = s.eliminationFor === 'top' ? s.topTeam : s.bottomTeam;
    if (!leader || !trailer) continue;
    bullets.push({
      text: `${leader.name || leader.abbrev} try to close out ${trailer.name || trailer.abbrev} — ${s.seriesScore.summary}.`,
      logoSlug: leader.slug || null,
    });
  }

  // Then active upset watches
  const upsets = playoffContext?.upsetWatch || [];
  for (const s of upsets) {
    if (bullets.length >= maxBullets) break;
    const leader = s.leader === 'top' ? s.topTeam : s.bottomTeam;
    const trailer = s.leader === 'top' ? s.bottomTeam : s.topTeam;
    if (!leader || !trailer) continue;
    bullets.push({
      text: `${leader.name || leader.abbrev} (${leader.seed}) lead ${trailer.name || trailer.abbrev} (${trailer.seed}) — ${s.seriesScore.summary}.`,
      logoSlug: leader.slug || null,
    });
  }

  // Then surface every other active series with its current score
  for (const s of (playoffContext?.series || [])) {
    if (bullets.length >= maxBullets) break;
    if (elim.some(e => e.matchupId === s.matchupId)) continue;
    if (upsets.some(u => u.matchupId === s.matchupId)) continue;
    const lead = s.leader === 'top' ? s.topTeam : s.leader === 'bottom' ? s.bottomTeam : null;
    if (!lead) {
      const a = s.topTeam, b = s.bottomTeam;
      if (!a || !b) continue;
      bullets.push({
        text: `${a.name || a.abbrev} vs ${b.name || b.abbrev} — ${s.seriesScore.summary}, pivot game up next.`,
        logoSlug: a.slug || null,
      });
    } else {
      const trailing = s.leader === 'top' ? s.bottomTeam : s.topTeam;
      bullets.push({
        text: `${lead.name || lead.abbrev} lead ${trailing?.name || trailing?.abbrev} — ${s.seriesScore.summary}.`,
        logoSlug: lead.slug || null,
      });
    }
  }

  // If we still have room, include upcoming games not tied to a tracked series
  if (bullets.length < maxBullets) {
    for (const g of upcoming) {
      if (bullets.length >= maxBullets) break;
      const away = g?.teams?.away;
      const home = g?.teams?.home;
      if (!away?.slug || !home?.slug) continue;
      bullets.push({
        text: `${home.name || home.abbrev} host ${away.name || away.abbrev} tonight — the road to the title continues.`,
        logoSlug: home.slug,
      });
    }
  }

  return bullets.slice(0, maxBullets);
}

/**
 * Main HOTP builder.
 *
 * @returns {Array<{ text, logoSlug }>}
 *   Up to 4 bullets. Empty array indicates a true no-slate / no-playoff
 *   scenario the caption/autopost layer should handle explicitly.
 */
export function buildNbaHotPress({ liveGames = [], playoffContext = null } = {}) {
  const stories = extractGameStories(liveGames, playoffContext);

  // ── Path 1: result-driven bullets ──
  if (stories.length >= 1) {
    const bullets = [];
    const usedGameIds = new Set();

    function addStory(s) {
      if (usedGameIds.has(s.gameId)) return false;
      bullets.push({ text: bulletForStory(s), logoSlug: s.winSlug });
      usedGameIds.add(s.gameId);
      return true;
    }

    const top = stories[0];
    addStory(top);

    const second = findSecondStory(stories, top);
    if (second) addStory(second);

    for (const s of stories) {
      if (bullets.length >= 4) break;
      addStory(s);
    }

    // Pad with playoff-frame upcoming bullets if we ran out of distinct finals
    if (bullets.length < 4) {
      const padding = upcomingBullets(liveGames, playoffContext, 4 - bullets.length);
      for (const b of padding) {
        if (bullets.length >= 4) break;
        bullets.push(b);
      }
    }

    return bullets.slice(0, 4);
  }

  // ── Path 2: upcoming-slate bullets (still playoff-framed) ──
  return upcomingBullets(liveGames, playoffContext, 4);
}

export default buildNbaHotPress;
