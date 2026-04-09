/**
 * buildMlbDailyHeadline — Dynamic, data-driven hero headlines for MLB Daily Briefing.
 *
 * Priority: marquee results > blowouts > shutouts > streaks > standings movement > general
 * Style: punchy, 2-clause, editorial, daily-changing
 * Data: existing MLB pipelines (live games, briefing, season model)
 *
 * Returns: { heroTitle, mainHeadline, subhead }
 *   heroTitle    → Slide 1 hero text (all-caps, 2 clauses, ≤ 65 chars ideal)
 *   mainHeadline → Slide 2 header (mixed case, ~60 chars)
 *   subhead      → Slide 2 subhead (1 sentence, ≤ 95 chars)
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { parseBriefingToIntel } from './normalizeMlbImagePayload';

// ── Team display names ──────────────────────────────────────────────────

const SLUG_TO_SHORT = Object.fromEntries(
  MLB_TEAMS.map(t => [t.slug, t.abbrev])
);
const SLUG_TO_NAME = Object.fromEntries(
  MLB_TEAMS.map(t => [t.slug, t.name.split(' ').pop()])  // "Yankees", "Dodgers", etc.
);

function teamShort(slug) { return SLUG_TO_SHORT[slug] || slug?.toUpperCase() || '???'; }
function teamName(slug) { return SLUG_TO_NAME[slug] || slug || '???'; }

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

    // Is winner a top contender? (projected 88+ wins)
    const winProj = getTeamProjection(winSlug);
    const loseProj = getTeamProjection(loseSlug);
    const winProjWins = winProj?.projectedWins ?? 81;
    const loseProjWins = loseProj?.projectedWins ?? 81;
    const isContender = winProjWins >= 88;
    const isUpset = loseProjWins >= 88 && winProjWins < 84;

    stories.push({
      type: margin >= 7 ? 'blowout' : loseScore === 0 ? 'shutout' : margin === 1 ? 'walkoff' : 'result',
      winSlug, loseSlug,
      winScore, loseScore, margin,
      isContender, isUpset,
      winProjWins, loseProjWins,
    });
  }

  // Sort: blowouts & shutouts first, then upsets, then contender wins
  stories.sort((a, b) => {
    const typeOrder = { blowout: 0, shutout: 1, walkoff: 2, result: 3 };
    if (a.isUpset && !b.isUpset) return -1;
    if (!a.isUpset && b.isUpset) return 1;
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    if (a.isContender && !b.isContender) return -1;
    if (!a.isContender && b.isContender) return 1;
    return b.margin - a.margin;
  });

  return stories;
}

// ── Extract stories from briefing text ──────────────────────────────────

function extractBriefingStories(briefingText) {
  if (!briefingText) return { players: [], teams: [], hasStandings: false };

  const intel = parseBriefingToIntel(briefingText);
  const raw = (intel?.rawParagraphs || []).join(' ');
  const lower = raw.toLowerCase();

  // Player extraction
  const PLAYER_PAT = /([A-Z][a-z]+ (?:Fernandez|Ohtani|Painter|Judge|Soto|Acuna|Betts|Trout|deGrom|Cole|Verlander|Stanton|Adames|Tatis|Lindor|Alvarez|Tucker|Witt|Carroll|Rodriguez|Skenes|Yamamoto|Freeman|Harper|Arenado|Machado|Vlad|Guerrero|Volpe|Cortes|Burnes|Webb|Strider|Cease|Glasnow|Snell|Musgrove|Scherzer|Kershaw|Sale|Bieber|Nola|Fried|Wheeler|Alcantara|Gausman|Bassitt))/gi;
  const players = [];
  let m;
  while ((m = PLAYER_PAT.exec(raw)) !== null) {
    players.push(m[1]);
  }

  // Detect standings / race language
  const hasStandings = /first place|lead(s|ing) the|game(s)? (back|behind|ahead)|division lead|wild card|pennant/i.test(raw);

  // Detect streak language
  const hasStreak = /winning streak|win streak|losing streak|consecutive|in a row|straight (win|loss)/i.test(raw);

  return { players: [...new Set(players)], hasStandings, hasStreak, intel };
}

// ── Top contenders from season model ────────────────────────────────────

function getModelContenders() {
  const teams = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    teams.push({ slug: team.slug, abbrev: team.abbrev, projectedWins: proj.projectedWins, league: team.league });
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

// ── Headline template banks ─────────────────────────────────────────────

const BLOWOUT_HERO = [
  (w, l, s) => `${w} ROLLS. ${s} STATEMENT MADE.`,
  (w, l, s) => `${w} DOMINATES ${l}. THE BOARD SHIFTS.`,
  (w, l, s) => `${w} CRUISES ${s}. CONTENDERS TAKE NOTICE.`,
];

const SHUTOUT_HERO = [
  (w, l) => `${w} SHUTS OUT ${l}. PITCHING WINS.`,
  (w, l) => `BLANKED. ${w} DOMINATES ${l}.`,
];

const UPSET_HERO = [
  (w, l) => `${w} STUNS ${l}. THE BOARD REACTS.`,
  (w, l) => `UPSET ALERT. ${w} TAKES DOWN ${l}.`,
];

const CONTENDER_HERO = [
  (w) => `${w} DELIVERS. THE RACE TIGHTENS.`,
  (w) => `${w} HANDLES BUSINESS. CONTENDERS ROLL.`,
  (w, l) => `${w} TOPS ${l}. EARLY SIGNALS EMERGE.`,
];

const PLAYER_HERO = [
  (p1, p2) => `${p1} BREAKS THROUGH. ${p2} SETS THE TONE.`,
  (p1, p2) => `${p1} DELIVERS. ${p2} ANSWERS.`,
  (p1) => `${p1} MAKES A STATEMENT. THE BOARD SHIFTS.`,
  (p1) => `${p1} DELIVERS AS CONTENDERS SET THE TONE.`,
];

const STANDINGS_HERO = [
  () => 'THE RACE TIGHTENS. CONTENDERS SEPARATE.',
  () => 'DIVISION LEADS SHIFT. THE BOARD REACTS.',
  () => 'STANDINGS SHUFFLE. EARLY SEPARATION BEGINS.',
];

const GENERAL_HERO = [
  'CONTENDERS ANSWER. THE BOARD TAKES SHAPE.',
  'DEBUTS LAND. EARLY SIGNALS EMERGE.',
  'THE BOARD IS LIVE. EDGES ARE FORMING.',
  'BIG BATS. BIGGER SIGNALS. THE BOARD MOVES.',
  'RESULTS LAND. THE MODEL REACTS.',
  'THE SEASON MOVES FAST. SO DOES THE BOARD.',
];

// ── Slide 2 headline templates ──────────────────────────────────────────

const SLIDE2_HEADLINES = {
  blowout: (w, l, s) => `${w} cruises ${s} as contenders flex`,
  shutout: (w, l) => `${w} blanks ${l} — pitching leads the way`,
  upset: (w, l) => `${w} stuns ${l} in early-season upset`,
  contender: (w) => `${w} takes care of business as the board takes shape`,
  player: (p) => `${p} delivers as contenders set the tone`,
  standings: () => 'Division races heating up across both leagues',
  general: [
    'Big debuts and early signals shape the board',
    'Contenders flex as the model reacts',
    'The board takes shape — edges are forming',
    'Results land across the league — the model reacts',
  ],
};

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

  // ── Priority 1: Marquee game results (blowouts, shutouts, upsets) ──
  const topStory = gameStories[0];

  if (topStory?.type === 'blowout' && topStory.margin >= 7) {
    const w = teamName(topStory.winSlug).toUpperCase();
    const l = teamName(topStory.loseSlug).toUpperCase();
    const score = `${topStory.winScore}-${topStory.loseScore}`;
    const tmpl = BLOWOUT_HERO[doy % BLOWOUT_HERO.length];
    heroTitle = tmpl(w, l, score);
    mainHeadline = SLIDE2_HEADLINES.blowout(teamShort(topStory.winSlug), teamShort(topStory.loseSlug), score);
    subhead = buildSubheadFromGame(topStory, gameStories[1]);
  } else if (topStory?.type === 'shutout') {
    const w = teamName(topStory.winSlug).toUpperCase();
    const l = teamName(topStory.loseSlug).toUpperCase();
    const tmpl = SHUTOUT_HERO[doy % SHUTOUT_HERO.length];
    heroTitle = tmpl(w, l);
    mainHeadline = SLIDE2_HEADLINES.shutout(teamShort(topStory.winSlug), teamShort(topStory.loseSlug));
    subhead = buildSubheadFromGame(topStory, gameStories[1]);
  } else if (topStory?.isUpset) {
    const w = teamName(topStory.winSlug).toUpperCase();
    const l = teamName(topStory.loseSlug).toUpperCase();
    const tmpl = UPSET_HERO[doy % UPSET_HERO.length];
    heroTitle = tmpl(w, l);
    mainHeadline = SLIDE2_HEADLINES.upset(teamShort(topStory.winSlug), teamShort(topStory.loseSlug));
    subhead = buildSubheadFromGame(topStory, gameStories[1]);
  }

  // ── Priority 2: Contender win ──
  else if (topStory?.isContender) {
    const w = teamName(topStory.winSlug).toUpperCase();
    const l = teamName(topStory.loseSlug).toUpperCase();
    const tmpl = CONTENDER_HERO[doy % CONTENDER_HERO.length];
    heroTitle = tmpl(w, l);
    mainHeadline = SLIDE2_HEADLINES.contender(teamShort(topStory.winSlug));
    subhead = buildSubheadFromGame(topStory, gameStories[1]);
  }

  // ── Priority 3: Player-driven from briefing ──
  else if (briefingData.players.length >= 2) {
    const p1 = briefingData.players[0].split(' ').pop().toUpperCase();
    const p2 = briefingData.players[1].split(' ').pop().toUpperCase();
    const tmpl = PLAYER_HERO[doy % 2]; // first two templates take 2 players
    heroTitle = tmpl(p1, p2);
    mainHeadline = SLIDE2_HEADLINES.player(briefingData.players[0].split(' ').pop());
    subhead = buildSubheadFromBriefing(briefingData);
  } else if (briefingData.players.length === 1) {
    const p1 = briefingData.players[0].split(' ').pop().toUpperCase();
    const tmpl = PLAYER_HERO[2 + (doy % 2)]; // last two templates take 1 player
    heroTitle = tmpl(p1);
    mainHeadline = SLIDE2_HEADLINES.player(briefingData.players[0].split(' ').pop());
    subhead = buildSubheadFromBriefing(briefingData);
  }

  // ── Priority 4: Standings / race movement ──
  else if (briefingData.hasStandings) {
    const tmpl = STANDINGS_HERO[doy % STANDINGS_HERO.length];
    heroTitle = tmpl();
    mainHeadline = SLIDE2_HEADLINES.standings();
    subhead = buildSubheadFromBriefing(briefingData);
  }

  // ── Priority 5: General / seasonal rotation ──
  else {
    heroTitle = GENERAL_HERO[doy % GENERAL_HERO.length];
    const generalH = SLIDE2_HEADLINES.general;
    mainHeadline = generalH[doy % generalH.length];
    subhead = buildGeneralSubhead(contenders, doy);
  }

  // Ensure heroTitle is all-caps
  heroTitle = heroTitle.toUpperCase();

  // Truncate heroTitle if too long for the slide
  if (heroTitle.length > 70) {
    const period = heroTitle.lastIndexOf('.', 65);
    if (period > 30) heroTitle = heroTitle.slice(0, period + 1);
  }

  return { heroTitle, mainHeadline, subhead };
}

// ── Subhead builders ────────────────────────────────────────────────────

function buildSubheadFromGame(topStory, secondStory) {
  const winner = teamShort(topStory.winSlug);
  const loser = teamShort(topStory.loseSlug);

  if (secondStory) {
    const s2w = teamShort(secondStory.winSlug);
    return `${winner} wins ${topStory.winScore}-${topStory.loseScore} while ${s2w} also picks up a key victory.`;
  }
  return `${winner} wins ${topStory.winScore}-${topStory.loseScore} over ${loser} as the board reacts.`;
}

function buildSubheadFromBriefing(briefingData) {
  const intel = briefingData.intel;
  if (!intel?.rawParagraphs?.[0]) {
    return 'The board is taking shape as contenders make early statements.';
  }
  // Extract first clean sentence from briefing
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
      `${t1.abbrev} and ${t2.abbrev} lead the projected standings as edges emerge across the board.`,
      `The model favors ${t1.abbrev} and ${t2.abbrev} early — contenders separate from the pack.`,
      `${t1.abbrev} projects at ${t1.projectedWins} wins as the board takes shape.`,
    ];
    return subs[doy % subs.length];
  }
  return 'Contenders are making early statements across both leagues.';
}

export default buildMlbDailyHeadline;
