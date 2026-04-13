/**
 * buildMlbDailyHeadline — Daily, result-driven hero headlines for MLB Daily Briefing.
 *
 * Priority hierarchy (strictly enforced):
 *   1. Yesterday's game results with standings implications
 *   2. Division race movement / GB changes
 *   3. Momentum / streaks
 *   4. Contender framing (only when backed by results)
 *   5. Projection/model framing (ONLY if zero games available)
 *
 * Returns: { heroTitle, mainHeadline, subhead }
 *   heroTitle    → Slide 1 hero text (all-caps, 2 clauses, ≤ 65 chars ideal)
 *   mainHeadline → Slide 2 header (mixed case, ~70 chars)
 *   subhead      → Slide 2 subhead (1 sentence, ≤ 95 chars)
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { buildGameWhyItMatters, buildLeagueWhyItMatters } from '../../../data/mlb/whyItMatters';
import { parseBriefingToIntel } from './normalizeMlbImagePayload';

// ── Team metadata maps ──────────────────────────────────────────────────

// Resolve editorial team nickname — handles multi-word nicknames correctly.
// "Chicago White Sox" → "White Sox", "Boston Red Sox" → "Red Sox",
// "Tampa Bay Rays" → "Rays", "New York Yankees" → "Yankees"
function resolveNickname(fullName) {
  if (!fullName) return '???';
  // Multi-word nicknames that must stay together
  if (/White Sox$/i.test(fullName)) return 'White Sox';
  if (/Red Sox$/i.test(fullName)) return 'Red Sox';
  if (/Blue Jays$/i.test(fullName)) return 'Blue Jays';
  return fullName.split(' ').pop();
}

const TEAM_META = Object.fromEntries(
  MLB_TEAMS.map(t => [t.slug, { name: resolveNickname(t.name), abbrev: t.abbrev, division: t.division, league: t.league }])
);

function teamName(slug) { return TEAM_META[slug]?.name || slug || '???'; }
function teamDiv(slug) { return TEAM_META[slug]?.division || ''; }
function teamAbbrev(slug) { return TEAM_META[slug]?.abbrev || slug?.toUpperCase() || '???'; }

function divShortLabel(div) {
  if (!div) return '';
  return div.toUpperCase();
}

// ── Day-of-year for deterministic rotation ──────────────────────────────

function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

// ── Extract stories from live/final games ───────────────────────────────

function extractGameStories(liveGames, allStandings) {
  if (!Array.isArray(liveGames) || liveGames.length === 0) return [];

  const finals = liveGames.filter(g =>
    g.gameState?.isFinal || g.status === 'final'
  );

  if (finals.length === 0) return [];

  const stories = [];

  for (const g of finals) {
    const away = g.teams?.away || {};
    const home = g.teams?.home || {};
    const awayScore = away.score ?? 0;
    const homeScore = home.score ?? 0;
    const winner = awayScore > homeScore ? away : home;
    const loser = awayScore > homeScore ? home : away;
    const winScore = Math.max(awayScore, homeScore);
    const loseScore = Math.min(awayScore, homeScore);
    const margin = winScore - loseScore;

    const winSlug = winner.slug;
    const loseSlug = loser.slug;

    if (!winSlug) continue;

    const winProj = getTeamProjection(winSlug);
    const loseProj = getTeamProjection(loseSlug);
    const winProjWins = winProj?.projectedWins ?? 81;
    const loseProjWins = loseProj?.projectedWins ?? 81;
    const isContender = winProjWins >= 88;
    const isUpset = loseProjWins >= 88 && winProjWins < 84;

    const winDiv = teamDiv(winSlug);
    const loseDiv = teamDiv(loseSlug);
    const isDivisionRival = winDiv && winDiv === loseDiv;

    // Enrich with standings
    const winStanding = allStandings?.[winSlug];
    const loseStanding = allStandings?.[loseSlug];

    const story = {
      type: loseScore === 0 ? 'shutout' : margin >= 7 ? 'blowout' : margin === 1 ? 'close' : 'result',
      winSlug, loseSlug,
      winScore, loseScore, margin,
      isContender, isUpset, isDivisionRival,
      winProjWins, loseProjWins,
      winDiv, loseDiv,
      winStanding, loseStanding,
    };

    // Get "why it matters" signal from the narrative engine
    story.signal = buildGameWhyItMatters(story, allStandings);

    stories.push(story);
  }

  // Sort: highest-priority signal first, then upsets, shutouts, blowouts, contenders
  stories.sort((a, b) => {
    const aPri = a.signal?.priority ?? 0;
    const bPri = b.signal?.priority ?? 0;
    if (aPri !== bPri) return bPri - aPri;
    if (a.isUpset && !b.isUpset) return -1;
    if (!a.isUpset && b.isUpset) return 1;
    const typeOrder = { shutout: 0, blowout: 1, close: 2, result: 3 };
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    if (a.isContender && !b.isContender) return -1;
    if (!a.isContender && b.isContender) return 1;
    return b.margin - a.margin;
  });

  return stories;
}

// ── Find a meaningful second story ──────────────────────────────────────

function findSecondStory(stories, topStory) {
  if (stories.length < 2) return null;
  for (const s of stories.slice(1)) {
    if (s.signal?.priority >= 70 && s.winDiv !== topStory.winDiv) return s;
  }
  for (const s of stories.slice(1)) {
    if (s.isContender && s.winDiv !== topStory.winDiv) return s;
  }
  for (const s of stories.slice(1)) {
    if (s.isContender) return s;
  }
  return stories[1];
}

// ── Standings context helpers ───────────────────────────────────────────

function gbTag(story) {
  const st = story.winStanding;
  if (!st) return '';
  if (st.rank === 1) return `, EXTENDING ${divShortLabel(story.winDiv)} LEAD`;
  const gb = st.gb;
  if (gb != null && gb <= 3) return `, NOW ${gb === 0 ? 'TIED FOR 1ST' : `${gb} GB`} IN ${divShortLabel(story.winDiv)}`;
  return '';
}

function gbTagLower(story) {
  const st = story.winStanding;
  if (!st) return '';
  if (st.rank === 1) return `, extending their grip on the ${teamDiv(story.winSlug)}`;
  const gb = st.gb;
  if (gb != null && gb <= 5) return `, staying ${gb === 0 ? 'tied for 1st' : `within ${gb} GB`} in the ${teamDiv(story.winSlug)}`;
  return '';
}

function streakTag(story) {
  const st = story.winStanding;
  if (!st?.streak) return '';
  const m = st.streak.match(/^W(\d+)$/);
  if (m && parseInt(m[1]) >= 3) return ` — NOW W${m[1]}`;
  return '';
}

function streakTagLower(story) {
  const st = story.winStanding;
  if (!st?.streak) return '';
  const m = st.streak.match(/^W(\d+)$/);
  if (m && parseInt(m[1]) >= 3) return ` — now ${m[1]} straight wins`;
  return '';
}

function loserContext(story) {
  const st = story.loseStanding;
  if (!st?.streak) return '';
  const m = st.streak.match(/^L(\d+)$/);
  if (m && parseInt(m[1]) >= 3) return ` (${teamName(story.loseSlug)} now L${m[1]})`;
  return '';
}

// ═══════════════════════════════════════════════════════════════════════
//  HERO TITLE TEMPLATES (Slide 1 — all-caps, punchy, result-driven)
// ═══════════════════════════════════════════════════════════════════════

function heroBlowout(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const score = `${top.winScore}-${top.loseScore}`;
  const gb = gbTag(top);
  const streak = streakTag(top);

  const templates = [
    () => second
      ? `${w} ROLL ${score}${gb}. ${teamName(second.winSlug).toUpperCase()} KEEP PACE.`
      : `${w} ROLL ${score} OVER ${l}${gb}.`,
    () => `${w} CRUISE ${score}${streak}. ${divShortLabel(top.winDiv)} TAKES NOTICE.`,
  ];
  return templates[doy % templates.length]();
}

function heroShutout(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const gb = gbTag(top);
  const streak = streakTag(top);

  const templates = [
    () => second
      ? `${w} BLANK ${l}${gb}. ${teamName(second.winSlug).toUpperCase()} ALSO WIN.`
      : `${w} SHUT OUT ${l}${gb}.`,
    () => `${w} BLANK ${l}${streak}. PITCHING DOMINATES.`,
  ];
  return templates[doy % templates.length]();
}

function heroUpset(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const loser = loserContext(top);

  const templates = [
    () => `${w} STUN ${l}${loser}. ${divShortLabel(top.loseDiv)} RACE SHIFTS.`,
    () => second
      ? `${w} UPSET ${l}. ${teamName(second.winSlug).toUpperCase()} CAPITALIZE.`
      : `${w} TAKE DOWN ${l}. ${divShortLabel(top.loseDiv)} DOOR OPENS.`,
  ];
  return templates[doy % templates.length]();
}

function heroContender(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const score = `${top.winScore}-${top.loseScore}`;
  const gb = gbTag(top);
  const streak = streakTag(top);

  const templates = [
    () => second
      ? `${w} WIN ${score}${gb}. ${teamName(second.winSlug).toUpperCase()} KEEP PACE.`
      : `${w} TOP ${l} ${score}${gb}.`,
    () => `${w} HANDLE ${l}${streak}. ${divShortLabel(top.winDiv)} LEAD HOLDS.`,
    () => top.isDivisionRival
      ? `${w} TOP ${l} IN ${divShortLabel(top.winDiv)} CLASH${gb}.`
      : `${w} WIN ${score}${gb}. THE RACE CONTINUES.`,
  ];
  return templates[doy % templates.length]();
}

function heroResult(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const score = `${top.winScore}-${top.loseScore}`;
  const gb = gbTag(top);

  const templates = [
    () => second
      ? `${w} WIN ${score}. ${teamName(second.winSlug).toUpperCase()} ALSO DELIVER${gbTag(second)}.`
      : `${w} EDGE ${l} ${score}${gb}.`,
    () => `${w} TOP ${l} ${score}. ${divShortLabel(top.winDiv)} PICTURE SHIFTS.`,
  ];
  return templates[doy % templates.length]();
}

// ═══════════════════════════════════════════════════════════════════════
//  SLIDE 2 HEADLINE TEMPLATES (mixed case, result + standings context)
// ═══════════════════════════════════════════════════════════════════════

function slide2Blowout(top, second) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const score = `${top.winScore}-${top.loseScore}`;
  const gb = gbTagLower(top);

  return second
    ? `${w} cruise ${score} over ${l}${gb} while ${teamName(second.winSlug)} also win`
    : `${w} roll ${score} past ${l}${gb}`;
}

function slide2Shutout(top, second) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const gb = gbTagLower(top);

  return second
    ? `${w} blank ${l}${gb} as ${teamName(second.winSlug)} pick up a win`
    : `${w} shut out ${l}${gb}`;
}

function slide2Upset(top, second) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const streak = streakTagLower(top);

  return second
    ? `${w} stun ${l}${streak} while ${teamName(second.winSlug)} capitalize`
    : `${w} pull the upset over ${l} as the ${teamDiv(top.loseSlug)} race shifts`;
}

function slide2Contender(top, second) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const score = `${top.winScore}-${top.loseScore}`;
  const gb = gbTagLower(top);

  return second
    ? `${w} top ${l} ${score}${gb} while ${teamName(second.winSlug)} keep pace`
    : `${w} handle ${l} ${score}${gb}`;
}

function slide2Result(top, second) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const score = `${top.winScore}-${top.loseScore}`;
  const gb = gbTagLower(top);

  return second
    ? `${w} edge ${l} ${score}${gb} while ${teamName(second.winSlug)} also deliver`
    : `${w} top ${l} ${score}${gb}`;
}

// ═══════════════════════════════════════════════════════════════════════
//  SUBHEAD BUILDERS — always result + standings driven
// ═══════════════════════════════════════════════════════════════════════

function buildSubheadFromGame(topStory, secondStory) {
  // Use the "why it matters" signal when it's strong
  if (topStory.signal?.priority >= 75 && topStory.signal.long) {
    return topStory.signal.long;
  }

  const winner = teamName(topStory.winSlug);
  const loser = teamName(topStory.loseSlug);
  const score = `${topStory.winScore}-${topStory.loseScore}`;
  const gb = gbTagLower(topStory);

  if (secondStory) {
    const s2w = teamName(secondStory.winSlug);
    const s2l = teamName(secondStory.loseSlug);
    const s2gb = gbTagLower(secondStory);
    return `${winner} win ${score} over ${loser}${gb} while ${s2w} top ${s2l}${s2gb}.`;
  }
  return `${winner} win ${score} over ${loser}${gb}.`;
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN BUILDER
// ═══════════════════════════════════════════════════════════════════════

export function buildMlbDailyHeadline({ liveGames, briefing, seasonIntel, allStandings } = {}) {
  const doy = dayOfYear();
  const gameStories = extractGameStories(liveGames, allStandings);

  let heroTitle = '';
  let mainHeadline = '';
  let subhead = '';

  const topStory = gameStories[0];
  const secondStory = topStory ? findSecondStory(gameStories, topStory) : null;

  // ── Priority 1-5: ALWAYS prefer game results when available ──
  if (topStory?.isUpset) {
    heroTitle = heroUpset(topStory, secondStory, doy);
    mainHeadline = slide2Upset(topStory, secondStory);
    subhead = buildSubheadFromGame(topStory, secondStory);
  } else if (topStory?.type === 'shutout') {
    heroTitle = heroShutout(topStory, secondStory, doy);
    mainHeadline = slide2Shutout(topStory, secondStory);
    subhead = buildSubheadFromGame(topStory, secondStory);
  } else if (topStory?.type === 'blowout') {
    heroTitle = heroBlowout(topStory, secondStory, doy);
    mainHeadline = slide2Blowout(topStory, secondStory);
    subhead = buildSubheadFromGame(topStory, secondStory);
  } else if (topStory?.isContender) {
    heroTitle = heroContender(topStory, secondStory, doy);
    mainHeadline = slide2Contender(topStory, secondStory);
    subhead = buildSubheadFromGame(topStory, secondStory);
  } else if (topStory) {
    heroTitle = heroResult(topStory, secondStory, doy);
    mainHeadline = slide2Result(topStory, secondStory);
    subhead = buildSubheadFromGame(topStory, secondStory);
  }
  // ── Priority 6: Briefing-derived content (no game results) ──
  else if (briefing) {
    const intel = parseBriefingToIntel(briefing);
    const raw = (intel?.rawParagraphs || []).join(' ');
    const sents = (raw.match(/[^.!?]*[.!?]+/g) || [])
      .map(s => s.trim().replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim())
      .filter(s => s.length > 15 && s.length <= 95)
      .filter(s => !/^(As we dive|In a thrilling|As teams jockey|As the season)/i.test(s));

    heroTitle = sents[0]?.toUpperCase()?.replace(/[.!]$/, '') || 'RESULTS LAND ACROSS THE LEAGUE';
    mainHeadline = sents[0] || 'Results across both leagues shape the early standings picture';
    subhead = sents[1] || 'Games finalized across both leagues with standings implications.';
  }
  // ── Priority 7: Absolute last resort — no games, no briefing ──
  else {
    heroTitle = 'GAMES AHEAD. THE RACE CONTINUES.';
    mainHeadline = 'A full slate ahead across both leagues';
    subhead = 'Today\'s results will shape the division races as the season continues.';
  }

  // Ensure heroTitle is all-caps
  heroTitle = heroTitle.toUpperCase();

  // Safety: truncate if too long for the slide
  if (heroTitle.length > 75) {
    const period = heroTitle.lastIndexOf('.', 70);
    if (period > 25) heroTitle = heroTitle.slice(0, period + 1);
  }

  return { heroTitle, mainHeadline, subhead };
}

// ═══════════════════════════════════════════════════════════════════════
//  HOT OFF THE PRESS — result-driven bullet builder
//
//  Every bullet references an actual game result with standings context.
//  Projections NEVER appear when game results are available.
// ═══════════════════════════════════════════════════════════════════════

function bulletBlowout(s) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const gb = gbTagLower(s);
  const streak = streakTagLower(s);
  return `${w} cruise past ${l} ${score}${gb}${streak}.`;
}

function bulletShutout(s) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-0`;
  const gb = gbTagLower(s);
  const streak = streakTagLower(s);
  return `${w} shut out ${l} ${score}${gb}${streak}.`;
}

function bulletUpset(s) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const lc = loserContext(s);
  return `${w} stun ${l} ${score}${lc} — the ${teamDiv(s.loseSlug)} race shifts.`;
}

function bulletContender(s) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const gb = gbTagLower(s);
  const streak = streakTagLower(s);

  // Use the signal's short text if it's strong and specific
  if (s.signal?.priority >= 70 && s.signal.short) {
    return `${w} top ${l} ${score} — ${s.signal.short.charAt(0).toLowerCase() + s.signal.short.slice(1)}.`;
  }
  return `${w} handle ${l} ${score}${gb}${streak}.`;
}

function bulletResult(s) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const gb = gbTagLower(s);

  if (s.margin === 1) {
    return `${w} edge ${l} ${score} in a tight one${gb}.`;
  }
  return `${w} beat ${l} ${score}${gb}.`;
}

function bulletForStory(story) {
  if (story.isUpset) return bulletUpset(story);
  switch (story.type) {
    case 'shutout': return bulletShutout(story);
    case 'blowout': return bulletBlowout(story);
    default: return story.isContender ? bulletContender(story) : bulletResult(story);
  }
}

// ── Main HOTP builder ───────────────────────────────────────────────────

/**
 * Build "Hot Off The Press" bullets from structured game results.
 * Every bullet is result-driven when games exist. No projection fallback
 * unless zero final games are available.
 */
export function buildMlbHotPress({ liveGames, briefing, allStandings } = {}) {
  const stories = extractGameStories(liveGames, allStandings);

  // ── If we have game results, build ALL bullets from results ──
  if (stories.length >= 1) {
    const bullets = [];
    // Track BOTH winner and loser slugs to avoid any game appearing twice
    const usedGameTeams = new Set();

    function markUsed(story) {
      usedGameTeams.add(story.winSlug);
      usedGameTeams.add(story.loseSlug);
    }
    function isUnused(story) {
      return !usedGameTeams.has(story.winSlug) && !usedGameTeams.has(story.loseSlug);
    }

    // Bullet 1: Top story (highest signal priority)
    const top = stories[0];
    bullets.push({ text: bulletForStory(top), logoSlug: top.winSlug });
    markUsed(top);

    // Bullet 2: Second key result — must be a DIFFERENT game
    const second = findSecondStory(stories, top);
    if (second && isUnused(second)) {
      bullets.push({ text: bulletForStory(second), logoSlug: second.winSlug });
      markUsed(second);
    } else {
      // Find any unused story
      for (const s of stories.slice(1)) {
        if (isUnused(s)) {
          bullets.push({ text: bulletForStory(s), logoSlug: s.winSlug });
          markUsed(s);
          break;
        }
      }
    }

    // Bullet 3+: Fill with distinct games, never repeating a game
    for (const s of stories) {
      if (bullets.length >= 4) break;
      if (!isUnused(s)) continue;
      bullets.push({ text: bulletForStory(s), logoSlug: s.winSlug });
      markUsed(s);
    }

    // Pad with league-wide synthesis if we ran out of distinct games
    if (bullets.length < 4) {
      const leagueSignal = buildLeagueWhyItMatters(stories, allStandings);
      if (leagueSignal?.long) {
        bullets.push({ text: leagueSignal.long, logoSlug: null });
      }
    }
    while (bullets.length < 4) {
      const contenderWins = stories.filter(s => s.isContender).length;
      if (contenderWins >= 2) {
        bullets.push({ text: `${contenderWins} contenders pick up wins as the standings shuffle across both leagues.`, logoSlug: null });
      } else {
        bullets.push({ text: `${stories.length} games finalize with standings implications across both leagues.`, logoSlug: null });
      }
    }

    return bullets.slice(0, 4);
  }

  // ── Fallback: parse briefing text if no game results ──
  if (briefing) {
    const intel = parseBriefingToIntel(briefing);
    if (intel?.rawParagraphs?.[0]) {
      let raw = intel.rawParagraphs[0];
      raw = raw.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
      raw = raw.replace(/^[¶#§]\d*\s*/i, '').replace(/^[A-Z][A-Z\s&+\-:]*[A-Z]\s*[:—–-]\s*/i, '').trim();
      const sents = (raw.match(/[^.!?]*[.!?]+/g) || [])
        .map(s => s.trim())
        .filter(s => s.length > 15 && s.length <= 95)
        .filter(s => !/^(As we dive|In a thrilling|As teams jockey|As the season)/i.test(s));
      if (sents.length >= 2) {
        return sents.slice(0, 4).map(text => ({ text, logoSlug: null }));
      }
    }
  }

  // ── Absolute last resort — no games, no briefing ──
  return [
    { text: 'A full slate ahead with division-race implications across both leagues.', logoSlug: null },
    { text: 'Today\'s results will shape the standings picture as the season heats up.', logoSlug: null },
    { text: 'Contenders look to make their move in today\'s action.', logoSlug: null },
    { text: 'Follow along as the races take shape across both leagues.', logoSlug: null },
  ];
}

export default buildMlbDailyHeadline;
