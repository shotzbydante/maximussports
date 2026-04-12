/**
 * buildMlbDailyHeadline — Dynamic, data-driven hero headlines for MLB Daily Briefing.
 *
 * Priority: marquee results > blowouts > shutouts > upsets > contender wins > player stories > standings > general
 * Style: punchy, 2-clause, editorial, daily-changing
 * Data: existing MLB pipelines (live games, briefing, season model)
 *
 * Returns: { heroTitle, mainHeadline, subhead }
 *   heroTitle    → Slide 1 hero text (all-caps, 2 clauses, ≤ 65 chars ideal)
 *   mainHeadline → Slide 2 header (mixed case, ~70 chars)
 *   subhead      → Slide 2 subhead (1 sentence, ≤ 95 chars)
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams.js';
import { getTeamProjection } from '../../../data/mlb/seasonModel.js';
import { buildLeagueWhyItMatters } from '../../../data/mlb/whyItMatters.js';
import { parseBriefingToIntel } from './normalizeMlbImagePayload.js';

// ── Team metadata maps ──────────────────────────────────────────────────

const TEAM_META = Object.fromEntries(
  MLB_TEAMS.map(t => [t.slug, { name: t.name.split(' ').pop(), abbrev: t.abbrev, division: t.division, league: t.league }])
);

/** Full team nickname for editorial use — "Rockies", "Yankees", etc. */
function teamName(slug) { return TEAM_META[slug]?.name || slug || '???'; }

/** Short division label — "NL West", "AL East" */
function teamDiv(slug) { return TEAM_META[slug]?.division || ''; }

/** League — "AL" or "NL" */
function teamLeague(slug) { return TEAM_META[slug]?.league || ''; }

/** Abbreviation — only for subheads, never hero headlines */
function teamAbbrev(slug) { return TEAM_META[slug]?.abbrev || slug?.toUpperCase() || '???'; }

// ── Verb agreement for plural team names ────────────────────────────────
// All MLB team nicknames are grammatically plural except "Red Sox" and "White Sox"
// (which are also plural in usage). So ALL teams use plural verbs:
//   "Rockies cruise", "Yankees roll", "Red Sox dominate"

const PLURAL_VERBS = {
  cruise: 'cruise',   roll: 'roll',   dominate: 'dominate',
  blank: 'blank',     rout: 'rout',   stun: 'stun',
  top: 'top',         handle: 'handle', deliver: 'deliver',
  shut: 'shut',       take: 'take',   answer: 'answer',
  keep: 'keep',       hold: 'hold',   crush: 'crush',
  sweep: 'sweep',     drop: 'drop',   edge: 'edge',
};

// ── Extract stories from live/final games ───────────────────────────────

function extractGameStories(liveGames) {
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

    // Division / race context
    const winDiv = teamDiv(winSlug);
    const loseDiv = teamDiv(loseSlug);
    const isDivisionRival = winDiv && winDiv === loseDiv;

    stories.push({
      type: loseScore === 0 ? 'shutout' : margin >= 7 ? 'blowout' : margin === 1 ? 'close' : 'result',
      winSlug, loseSlug,
      winScore, loseScore, margin,
      isContender, isUpset, isDivisionRival,
      winProjWins, loseProjWins,
      winDiv, loseDiv,
    });
  }

  // Sort: upsets first, then shutouts, blowouts, contender wins, others
  stories.sort((a, b) => {
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
  // Prefer a contender from a different division, or any contender
  for (const s of stories.slice(1)) {
    if (s.isContender && s.winDiv !== topStory.winDiv) return s;
  }
  for (const s of stories.slice(1)) {
    if (s.isContender) return s;
  }
  // Any other notable result
  return stories[1];
}

// ── Extract stories from briefing text ──────────────────────────────────

function extractBriefingStories(briefingText) {
  if (!briefingText) return { players: [], hasStandings: false, hasStreak: false, intel: null };

  const intel = parseBriefingToIntel(briefingText);
  const raw = (intel?.rawParagraphs || []).join(' ');

  // Player extraction
  const PLAYER_PAT = /([A-Z][a-z]+ (?:Fernandez|Ohtani|Painter|Judge|Soto|Acuna|Betts|Trout|deGrom|Cole|Verlander|Stanton|Adames|Tatis|Lindor|Alvarez|Tucker|Witt|Carroll|Rodriguez|Skenes|Yamamoto|Freeman|Harper|Arenado|Machado|Vlad|Guerrero|Volpe|Cortes|Burnes|Webb|Strider|Cease|Glasnow|Snell|Musgrove|Scherzer|Kershaw|Sale|Bieber|Nola|Fried|Wheeler|Alcantara|Gausman|Bassitt))/gi;
  const players = [];
  let m;
  while ((m = PLAYER_PAT.exec(raw)) !== null) {
    players.push(m[1]);
  }

  const hasStandings = /first place|lead(s|ing) the|game(s)? (back|behind|ahead)|division lead|wild card|pennant/i.test(raw);
  const hasStreak = /winning streak|win streak|losing streak|consecutive|in a row|straight (win|loss)/i.test(raw);

  return { players: [...new Set(players)], hasStandings, hasStreak, intel };
}

// ── Top contenders from season model ────────────────────────────────────

function getModelContenders() {
  const teams = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    teams.push({ slug: team.slug, abbrev: team.abbrev, projectedWins: proj.projectedWins, league: team.league, division: team.division });
  }
  teams.sort((a, b) => b.projectedWins - a.projectedWins);
  return teams;
}

// ── Day-of-year for deterministic rotation ──────────────────────────────

function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

// ── Division short label for headlines ──────────────────────────────────

function divShortLabel(div) {
  if (!div) return '';
  // "NL West" → "NL WEST", "AL East" → "AL EAST"
  return div.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════
//  HERO TITLE TEMPLATES (Slide 1 — all-caps, punchy, emotional)
//
//  All verbs are plural-safe: "ROCKIES CRUISE", not "ROCKIES CRUISES"
// ═══════════════════════════════════════════════════════════════════════

function heroBlowout(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const score = `${top.winScore}-${top.loseScore}`;
  const divLabel = divShortLabel(top.winDiv);

  const templates = [
    () => second
      ? `${w} ROLL ${score}. ${teamName(second.winSlug).toUpperCase()} KEEP PACE.`
      : `${w} ROLL ${score} OVER ${l}. ${divLabel} PRESSURE BUILDS.`,
    () => second
      ? `${w} CRUISE PAST ${l}. ${teamName(second.winSlug).toUpperCase()} ANSWER.`
      : `${w} CRUISE ${score}. THE ${divLabel} RACE TIGHTENS.`,
    () => `${w} ROUT ${l} ${score}. THE BOARD SHIFTS.`,
  ];
  return templates[doy % templates.length]();
}

function heroShutout(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const templates = [
    () => second
      ? `${w} BLANK ${l}. ${teamName(second.winSlug).toUpperCase()} HOLD THE LINE.`
      : `${w} SHUT OUT ${l}. PITCHING DOMINATES.`,
    () => `${w} BLANK ${l}. THE ${divShortLabel(top.winDiv)} GAP NARROWS.`,
  ];
  return templates[doy % templates.length]();
}

function heroUpset(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const templates = [
    () => `${w} STUN ${l}. THE ${divShortLabel(top.loseDiv)} RACE SHIFTS.`,
    () => second
      ? `${w} UPSET ${l}. ${teamName(second.winSlug).toUpperCase()} TAKE ADVANTAGE.`
      : `${w} TAKE DOWN ${l}. THE BOARD REACTS.`,
  ];
  return templates[doy % templates.length]();
}

function heroContender(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const score = `${top.winScore}-${top.loseScore}`;

  const templates = [
    () => second
      ? `${w} TOP ${l}. ${teamName(second.winSlug).toUpperCase()} KEEP PACE.`
      : `${w} HANDLE ${l} ${score}. THE RACE TIGHTENS.`,
    () => second
      ? `${w} WIN ${score}. ${teamName(second.winSlug).toUpperCase()} ANSWER.`
      : `${w} CRUISE PAST ${l}. EARLY GAPS FORM.`,
    () => top.isDivisionRival
      ? `${w} TOP ${l} IN ${divShortLabel(top.winDiv)} CLASH.`
      : `${w} ROLL PAST ${l}. THE BOARD MOVES.`,
  ];
  return templates[doy % templates.length]();
}

function heroResult(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const score = `${top.winScore}-${top.loseScore}`;
  const templates = [
    () => second
      ? `${w} WIN ${score}. ${teamName(second.winSlug).toUpperCase()} ALSO DELIVER.`
      : `${w} EDGE ${l} ${score}. THE BOARD REACTS.`,
    () => `${w} TOP ${l}. THE ${divShortLabel(top.winDiv)} PICTURE SHIFTS.`,
  ];
  return templates[doy % templates.length]();
}

// ═══════════════════════════════════════════════════════════════════════
//  SLIDE 2 HEADLINE TEMPLATES (mixed case, more descriptive, informative)
//
//  Uses full team names, references opponent + standings context
// ═══════════════════════════════════════════════════════════════════════

function slide2Blowout(top, second, doy) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const score = `${top.winScore}-${top.loseScore}`;
  const templates = [
    () => second
      ? `${w} cruise ${score} over ${l} while ${teamName(second.winSlug)} keep pace`
      : `${w} roll ${score} past ${l} as ${divShortLabel(top.winDiv)} pressure builds`,
    () => second
      ? `${w} rout ${l} ${score}, ${teamName(second.winSlug)} respond in ${divShortLabel(second.winDiv)}`
      : `${w} dominate ${l} ${score} — early ${divShortLabel(top.winDiv)} separation`,
  ];
  return templates[doy % templates.length]();
}

function slide2Shutout(top, second, doy) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  return second
    ? `${w} blank ${l} as ${teamName(second.winSlug)} also pick up a win`
    : `${w} shut out ${l} — pitching dominates across the board`;
}

function slide2Upset(top, second, doy) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  return second
    ? `${w} stun ${l} while ${teamName(second.winSlug)} take advantage`
    : `${w} pull the upset over ${l} as the ${divShortLabel(top.loseDiv)} race shifts`;
}

function slide2Contender(top, second, doy) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const score = `${top.winScore}-${top.loseScore}`;
  const templates = [
    () => second
      ? `${w} top ${l} ${score} while ${teamName(second.winSlug)} keep pace`
      : `${w} handle ${l} ${score} as ${divShortLabel(top.winDiv)} takes shape`,
    () => second
      ? `${w} win ${score}, ${teamName(second.winSlug)} answer — early gaps form`
      : `${w} cruise past ${l} ${score} — the board tightens`,
  ];
  return templates[doy % templates.length]();
}

function slide2Result(top, second, doy) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const score = `${top.winScore}-${top.loseScore}`;
  return second
    ? `${w} edge ${l} ${score} while ${teamName(second.winSlug)} also deliver`
    : `${w} top ${l} ${score} — the ${divShortLabel(top.winDiv)} picture shifts`;
}

// ═══════════════════════════════════════════════════════════════════════
//  FALLBACK TEMPLATES (briefing-driven or general)
// ═══════════════════════════════════════════════════════════════════════

const PLAYER_HERO_TEMPLATES = [
  (p1, p2) => `${p1} BREAKS THROUGH. ${p2} SETS THE TONE.`,
  (p1, p2) => `${p1} DELIVERS. ${p2} ANSWERS.`,
  (p1) => `${p1} MAKES A STATEMENT. THE BOARD SHIFTS.`,
  (p1) => `${p1} DELIVERS. CONTENDERS SET THE TONE.`,
];

const STANDINGS_HERO_TEMPLATES = [
  'THE RACE TIGHTENS. CONTENDERS SEPARATE.',
  'DIVISION LEADS SHIFT. THE BOARD REACTS.',
  'STANDINGS SHUFFLE. EARLY SEPARATION BEGINS.',
];

const GENERAL_HERO_TEMPLATES = [
  'THE BOARD TAKES SHAPE. EARLY GAPS FORM.',
  'RESULTS LAND. THE MODEL REACTS.',
  'BIG BATS. BIGGER SIGNALS. THE BOARD MOVES.',
  'THE SEASON MOVES FAST. SO DOES THE BOARD.',
  'EARLY SIGNALS EMERGE. THE RACE IS ON.',
  'CONTENDERS ANSWER. THE PICTURE SHARPENS.',
];

const GENERAL_SLIDE2 = [
  'Results land across the league as the model reacts',
  'Early signals emerge — the board takes shape',
  'The race is on as contenders separate from the pack',
  'Big results across both leagues shift the board',
];

// ═══════════════════════════════════════════════════════════════════════
//  MAIN BUILDER
// ═══════════════════════════════════════════════════════════════════════

export function buildMlbDailyHeadline({ liveGames, briefing, seasonIntel } = {}) {
  const doy = dayOfYear();
  const gameStories = extractGameStories(liveGames);
  const briefingData = extractBriefingStories(briefing);
  const contenders = getModelContenders();

  let heroTitle = '';
  let mainHeadline = '';
  let subhead = '';

  const topStory = gameStories[0];
  const secondStory = topStory ? findSecondStory(gameStories, topStory) : null;

  // ── Priority 1: Upset ──
  if (topStory?.isUpset) {
    heroTitle = heroUpset(topStory, secondStory, doy);
    mainHeadline = slide2Upset(topStory, secondStory, doy);
    subhead = buildSubheadFromGame(topStory, secondStory);
  }
  // ── Priority 2: Shutout ──
  else if (topStory?.type === 'shutout') {
    heroTitle = heroShutout(topStory, secondStory, doy);
    mainHeadline = slide2Shutout(topStory, secondStory, doy);
    subhead = buildSubheadFromGame(topStory, secondStory);
  }
  // ── Priority 3: Blowout (7+ run margin) ──
  else if (topStory?.type === 'blowout') {
    heroTitle = heroBlowout(topStory, secondStory, doy);
    mainHeadline = slide2Blowout(topStory, secondStory, doy);
    subhead = buildSubheadFromGame(topStory, secondStory);
  }
  // ── Priority 4: Contender win ──
  else if (topStory?.isContender) {
    heroTitle = heroContender(topStory, secondStory, doy);
    mainHeadline = slide2Contender(topStory, secondStory, doy);
    subhead = buildSubheadFromGame(topStory, secondStory);
  }
  // ── Priority 5: Any final game result ──
  else if (topStory) {
    heroTitle = heroResult(topStory, secondStory, doy);
    mainHeadline = slide2Result(topStory, secondStory, doy);
    subhead = buildSubheadFromGame(topStory, secondStory);
  }
  // ── Priority 6: Player-driven from briefing ──
  else if (briefingData.players.length >= 2) {
    const p1 = briefingData.players[0].split(' ').pop().toUpperCase();
    const p2 = briefingData.players[1].split(' ').pop().toUpperCase();
    heroTitle = PLAYER_HERO_TEMPLATES[doy % 2](p1, p2);
    mainHeadline = `${briefingData.players[0].split(' ').pop()} delivers as ${briefingData.players[1].split(' ').pop()} answers`;
    subhead = buildSubheadFromBriefing(briefingData);
  } else if (briefingData.players.length === 1) {
    const p1 = briefingData.players[0].split(' ').pop().toUpperCase();
    heroTitle = PLAYER_HERO_TEMPLATES[2 + (doy % 2)](p1);
    mainHeadline = `${briefingData.players[0].split(' ').pop()} delivers — the board takes shape`;
    subhead = buildSubheadFromBriefing(briefingData);
  }
  // ── Priority 7: Standings movement from briefing ──
  else if (briefingData.hasStandings) {
    heroTitle = STANDINGS_HERO_TEMPLATES[doy % STANDINGS_HERO_TEMPLATES.length];
    mainHeadline = 'Division races heat up across both leagues';
    subhead = buildSubheadFromBriefing(briefingData);
  }
  // ── Priority 8: General rotation ──
  else {
    heroTitle = GENERAL_HERO_TEMPLATES[doy % GENERAL_HERO_TEMPLATES.length];
    mainHeadline = GENERAL_SLIDE2[doy % GENERAL_SLIDE2.length];
    subhead = buildGeneralSubhead(contenders, doy);
  }

  // Ensure heroTitle is all-caps
  heroTitle = heroTitle.toUpperCase();

  // Safety: truncate if too long for the slide
  if (heroTitle.length > 70) {
    const period = heroTitle.lastIndexOf('.', 65);
    if (period > 25) heroTitle = heroTitle.slice(0, period + 1);
  }

  return { heroTitle, mainHeadline, subhead };
}

// ── Subhead builders ────────────────────────────────────────────────────

function buildSubheadFromGame(topStory, secondStory) {
  const winner = teamName(topStory.winSlug);
  const loser = teamName(topStory.loseSlug);
  const score = `${topStory.winScore}-${topStory.loseScore}`;

  if (secondStory) {
    const s2w = teamName(secondStory.winSlug);
    const s2l = teamName(secondStory.loseSlug);
    return `${winner} win ${score} over ${loser} while ${s2w} top ${s2l}.`;
  }
  const div = teamDiv(topStory.winSlug);
  if (div) {
    return `${winner} win ${score} over ${loser} as the ${div} race takes shape.`;
  }
  return `${winner} win ${score} over ${loser} as the board reacts.`;
}

function buildSubheadFromBriefing(briefingData) {
  const intel = briefingData.intel;
  if (!intel?.rawParagraphs?.[0]) {
    return 'The board is taking shape as contenders make early statements.';
  }
  let raw = intel.rawParagraphs[0];
  raw = raw.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
  raw = raw.replace(/^[¶#§]\d*\s*/i, '').replace(/^[A-Z][A-Z\s&+\-:]*[A-Z]\s*[:—–-]\s*/i, '').trim();
  const sents = (raw.match(/[^.!?]*[.!?]+/g) || []).map(s => s.trim()).filter(s => s.length > 15 && s.length <= 95);
  return sents[0] || 'The board is taking shape as contenders make early statements.';
}

function buildGeneralSubhead(contenders, doy) {
  if (contenders.length >= 2) {
    const t1 = contenders[0];
    const t2 = contenders[1];
    const subs = [
      `${teamName(t1.slug)} and ${teamName(t2.slug)} lead the projected standings as edges emerge.`,
      `The model favors ${teamName(t1.slug)} and ${teamName(t2.slug)} early — the pack separates.`,
      `${teamName(t1.slug)} project at ${t1.projectedWins} wins as the board takes shape.`,
    ];
    return subs[doy % subs.length];
  }
  return 'Contenders are making early statements across both leagues.';
}

// ═══════════════════════════════════════════════════════════════════════
//  HOT OFF THE PRESS — dynamic bullet builder for Slide 2
//
//  Generates 4 editorial bullets from structured game results.
//  Aligned with the headline engine: same data, same team names,
//  same priority logic. Bullets feel like a real newsroom recap.
// ═══════════════════════════════════════════════════════════════════════

// ── Bullet template banks (by story type) ───────────────────────────────

function bulletBlowout(s, doy) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const templates = [
    `${w} cruise past ${l} ${score} as their lineup fires on all cylinders.`,
    `${w} roll over ${l} ${score} — a statement win that sends a message early.`,
    `${w} rout ${l} ${score} behind a complete effort on both sides of the ball.`,
  ];
  return templates[doy % templates.length];
}

function bulletShutout(s, doy) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-0`;
  const templates = [
    `${w} shut out ${l} ${score} behind dominant pitching that silenced the lineup.`,
    `${w} blank ${l} ${score} as their pitching staff continues to set the tone early.`,
    `${w} hold ${l} scoreless in a ${score} gem — a sharp effort on the mound.`,
  ];
  return templates[doy % templates.length];
}

function bulletUpset(s, doy) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const templates = [
    `${w} stun ${l} ${score} behind a sharp pitching effort in an early-season upset.`,
    `${w} pull off the upset, topping ${l} ${score} to shake up the early standings.`,
    `Upset alert: ${w} take down ${l} ${score} as the underdog prevails.`,
  ];
  return templates[doy % templates.length];
}

function bulletContender(s, doy) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  const div = teamDiv(s.winSlug);
  const templates = [
    `${w} handle ${l} ${score} to stay on track in the ${div || 'division'} race.`,
    `${w} top ${l} ${score} in a strong outing that keeps their momentum rolling.`,
    `${w} take care of business, beating ${l} ${score} and holding their position.`,
    `${w} edge ${l} ${score} as the ${div || 'division'} race continues to tighten.`,
  ];
  return templates[doy % templates.length];
}

function bulletResult(s, doy) {
  const w = teamName(s.winSlug);
  const l = teamName(s.loseSlug);
  const score = `${s.winScore}-${s.loseScore}`;
  if (s.margin === 1) {
    const templates = [
      `${w} edge ${l} ${score} in a nail-biter that went down to the wire.`,
      `${w} hold on to beat ${l} ${score} in a tightly contested affair.`,
    ];
    return templates[doy % templates.length];
  }
  const templates = [
    `${w} beat ${l} ${score} as they look to build early-season momentum.`,
    `${w} top ${l} ${score} in a solid all-around performance.`,
    `${w} win ${score} over ${l} and continue to stack results.`,
  ];
  return templates[doy % templates.length];
}

function bulletForStory(story, doy) {
  if (story.isUpset) return bulletUpset(story, doy);
  switch (story.type) {
    case 'shutout': return bulletShutout(story, doy);
    case 'blowout': return bulletBlowout(story, doy);
    default: return story.isContender ? bulletContender(story, doy) : bulletResult(story, doy);
  }
}

// ── Division / standings context bullet ─────────────────────────────────

function bulletDivisionContext(stories, doy, allStandings) {
  // If we have standings, use the league-wide "why it matters" signal
  const leagueSignal = buildLeagueWhyItMatters(stories, allStandings);
  if (leagueSignal?.long) {
    return leagueSignal.long;
  }

  // Fallback: count contender wins by division
  const divWins = {};
  for (const s of stories) {
    if (s.isContender && s.winDiv) {
      divWins[s.winDiv] = (divWins[s.winDiv] || 0) + 1;
    }
  }
  const divEntries = Object.entries(divWins).sort((a, b) => b[1] - a[1]);

  if (divEntries.length >= 2) {
    const templates = [
      `Pressure builds across both leagues as ${divEntries[0][0]} and ${divEntries[1][0]} contenders trade wins and division races tighten.`,
      `${divEntries[0][0]} and ${divEntries[1][0]} contenders both pick up key wins — early separation is underway.`,
    ];
    return templates[doy % templates.length];
  }
  if (divEntries.length === 1) {
    const div = divEntries[0][0];
    const count = divEntries[0][1];
    if (count >= 2) return `Multiple ${div} contenders win tonight, adding urgency to a tightening division race.`;
    return `The ${div} picture shifts as contenders jockey for early positioning.`;
  }

  const totalFinals = stories.length;
  if (totalFinals >= 6) {
    return `A full slate across the league with ${totalFinals} games in the books — the standings continue to shuffle.`;
  }
  return 'Pressure builds across both leagues as contenders trade wins and division races tighten.';
}

// ── Volume / notable-count bullet ───────────────────────────────────────

function bulletVolume(stories, usedSlugs, doy) {
  // Find the next best story NOT already used
  for (const s of stories) {
    if (usedSlugs.has(s.winSlug)) continue;
    return bulletForStory(s, doy + 1); // offset doy for template variation
  }
  // If all stories used, generate a summary bullet
  const contenderWins = stories.filter(s => s.isContender).length;
  if (contenderWins >= 3) return `${contenderWins} projected contenders pick up wins across the league.`;
  if (stories.length >= 4) return `${stories.length} games finalize across the league as the board adjusts.`;
  return 'Results across the league continue to shape early standings.';
}

// ── Main HOTP builder ───────────────────────────────────────────────────

/**
 * Build "Hot Off The Press" bullets from structured game results.
 *
 * @param {Object} opts
 * @param {Array} opts.liveGames - games from /api/mlb/live/games (includes finals)
 * @param {string} [opts.briefing] - AI briefing text (fallback only)
 * @param {Object} [opts.allStandings] - { [slug]: { rank, gb, l10, streak, wins, losses, division } }
 * @returns {{ text: string, logoSlug: string|null }[]} - 4 bullet objects
 */
export function buildMlbHotPress({ liveGames, briefing, allStandings } = {}) {
  const doy = dayOfYear();
  const stories = extractGameStories(liveGames);

  // ── If we have game results, build from structured data ──
  if (stories.length >= 1) {
    const bullets = [];
    const usedSlugs = new Set();

    // Bullet 1: Top story
    const top = stories[0];
    bullets.push({ text: bulletForStory(top, doy), logoSlug: top.winSlug });
    usedSlugs.add(top.winSlug);

    // Bullet 2: Second key result (from different division if possible)
    const second = findSecondStory(stories, top);
    if (second && !usedSlugs.has(second.winSlug)) {
      bullets.push({ text: bulletForStory(second, doy + 1), logoSlug: second.winSlug });
      usedSlugs.add(second.winSlug);
    } else if (stories.length >= 2) {
      const alt = stories[1];
      bullets.push({ text: bulletForStory(alt, doy + 1), logoSlug: alt.winSlug });
      usedSlugs.add(alt.winSlug);
    }

    // Bullet 3: Division / standings context — powered by whyItMatters
    if (stories.length >= 2) {
      bullets.push({ text: bulletDivisionContext(stories, doy, allStandings), logoSlug: null });
    }

    // Bullet 4: Additional game or volume summary
    if (stories.length >= 3) {
      bullets.push({ text: bulletVolume(stories, usedSlugs, doy), logoSlug: null });
    }

    // Pad to 4 if needed
    while (bullets.length < 4) {
      bullets.push({ text: bulletVolume(stories, usedSlugs, doy + bullets.length), logoSlug: null });
    }

    return bullets.slice(0, 4);
  }

  // ── Fallback: parse briefing text if no game results ──
  if (briefing) {
    const briefingData = extractBriefingStories(briefing);
    const intel = briefingData.intel;
    if (intel?.rawParagraphs?.[0]) {
      let raw = intel.rawParagraphs[0];
      // Clean up
      raw = raw.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
      raw = raw.replace(/^[¶#§]\d*\s*/i, '').replace(/^[A-Z][A-Z\s&+\-:]*[A-Z]\s*[:—–-]\s*/i, '').trim();
      const sents = (raw.match(/[^.!?]*[.!?]+/g) || [])
        .map(s => s.trim())
        .filter(s => s.length > 15 && s.length <= 95)
        // Filter out generic filler
        .filter(s => !/^(As we dive|In a thrilling|As teams jockey|As the season)/i.test(s));
      if (sents.length >= 2) {
        return sents.slice(0, 4).map(text => ({ text, logoSlug: null }));
      }
    }
  }

  // ── Last resort: model-driven general bullets ──
  const contenders = getModelContenders();
  const t1 = contenders[0];
  const t2 = contenders[1];
  const t3 = contenders[2];
  return [
    { text: t1 ? `${teamName(t1.slug)} project at ${t1.projectedWins} wins to lead the ${t1.league}.` : 'League-wide results continue to shape early standings.', logoSlug: t1?.slug || null },
    { text: t2 ? `${teamName(t2.slug)} sit at ${t2.projectedWins} projected wins as contenders emerge.` : 'Contenders separate from the pack across both leagues.', logoSlug: t2?.slug || null },
    { text: t3 ? `${teamName(t3.slug)} round out the top tier at ${t3.projectedWins} projected wins.` : 'Early model signals point to a competitive season ahead.', logoSlug: t3?.slug || null },
    { text: 'Early edges are forming — the board reacts daily.', logoSlug: null },
  ];
}

export default buildMlbDailyHeadline;
