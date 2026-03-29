/**
 * normalizeMlbImagePayload
 *
 * Converts MLB Content Studio dashboard state into a structured,
 * section-agnostic payload for Gemini image generation.
 *
 * For Daily Briefing: content is sourced EXACTLY from MLB Home's
 * "Today's Intelligence Briefing" (llmSummary from /api/mlb/chat/homeSummary).
 * Text is passed through verbatim — no summarization or rewriting.
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';

const SECTION_MAP = {
  'mlb-daily':    'daily-briefing',
  'mlb-team':     'team-intel',
  'mlb-league':   'league-intel',
  'mlb-division': 'division-intel',
  'mlb-game':     'game-insights',
  'mlb-picks':    'maximus-picks',
};

function today() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

/**
 * Strip markdown bold/italic from text for clean Gemini rendering.
 * Preserves the actual words, removes ** and * markers.
 */
function stripMarkdown(text) {
  if (!text) return '';
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

/**
 * Parse the 5-paragraph briefing text into structured intelBriefing.
 *
 * The MLB Home briefing from /api/mlb/chat/homeSummary has 5 paragraphs:
 *   P1: AROUND THE LEAGUE — headlines
 *   P2: WORLD SERIES ODDS PULSE — odds
 *   P3: PENNANT RACE & DIVISION WATCH — standings
 *   P4: SLEEPERS, INJURIES & VALUE — value plays
 *   P5: DIAMOND DISPATCH + CLOSER — remaining headlines + closer
 *
 * We extract the first paragraph as headline, convert paragraphs 2-4
 * into bullets, and extract team matchups from the text.
 */
function parseBriefingToIntel(briefingText) {
  if (!briefingText) return null;

  const paragraphs = briefingText.split(/\n\n+/).filter(p => p.trim());
  if (paragraphs.length === 0) return null;

  // Clean markdown from all paragraphs
  const cleaned = paragraphs.map(stripMarkdown);

  // First paragraph → headline (first sentence or first 120 chars)
  const firstPara = cleaned[0];
  const firstSentenceMatch = firstPara.match(/^(.+?[.!?])\s/);
  const headline = firstSentenceMatch
    ? firstSentenceMatch[1].slice(0, 120)
    : firstPara.slice(0, 120);

  // Paragraphs 2-4 → bullets (take first sentence of each, max 5 total)
  const bullets = [];
  for (let i = 0; i < Math.min(cleaned.length, 5); i++) {
    const para = cleaned[i];
    // Extract section label if present (e.g., "ODDS PULSE: ...")
    const labelMatch = para.match(/^([A-Z][A-Z\s&+\-]*[A-Z])\s*:\s*/);
    const content = labelMatch ? para.slice(labelMatch[0].length) : para;
    // Take first sentence
    const sentenceMatch = content.match(/^(.+?[.!?])\s/);
    const bullet = sentenceMatch ? sentenceMatch[1] : content.slice(0, 150);
    if (bullet.trim()) bullets.push(bullet.trim());
  }

  // Extract team matchups from text (look for "Team vs Team" or "Team at Team")
  const matchupRegex = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:vs\.?|at|@)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g;
  const keyMatchups = [];
  let match;
  const fullText = briefingText;
  while ((match = matchupRegex.exec(fullText)) !== null && keyMatchups.length < 3) {
    keyMatchups.push({ teamA: match[1], teamB: match[2] });
  }

  return {
    headline,
    bullets: bullets.slice(0, 5),
    keyMatchups,
    date: today(),
    rawParagraphs: cleaned.slice(0, 5),
  };
}

/**
 * Build the normalized payload from Dashboard state.
 *
 * @param {Object} opts
 * @param {string} opts.activeSection
 * @param {Object} [opts.mlbPicks]
 * @param {Object[]} [opts.mlbGames]
 * @param {Object[]} [opts.mlbHeadlines]
 * @param {Object} [opts.mlbSelectedTeam]
 * @param {Object} [opts.mlbSelectedGame]
 * @param {string} [opts.mlbLeague]
 * @param {string} [opts.mlbDivision]
 * @param {string} [opts.mlbGameAngle]
 * @param {string} [opts.mlbBriefing] - raw briefing text from /api/mlb/chat/homeSummary
 * @returns {Object}
 */
export function normalizeMlbImagePayload({
  activeSection,
  mlbPicks,
  mlbGames = [],
  mlbHeadlines = [],
  mlbSelectedTeam,
  mlbSelectedGame,
  mlbLeague,
  mlbDivision,
  mlbGameAngle,
  mlbBriefing,
}) {
  const section = SECTION_MAP[activeSection] || 'daily-briefing';

  // Parse briefing into structured intel (used by daily-briefing + picks)
  const intelBriefing = parseBriefingToIntel(mlbBriefing);

  const base = {
    workspace: 'mlb',
    section,
    angle: mlbGameAngle || null,
    stylePreset: 'mlb-glassy-terminal',
    aspectRatio: '4:5',
    dateLabel: today(),
    tags: ['#MLB', '#MaximusSports', '#BaseballIntel'],
    referenceImages: [],
  };

  switch (section) {
    case 'daily-briefing':
      return buildDailyPayload(base, intelBriefing, mlbGames, mlbPicks);
    case 'team-intel':
      return buildTeamPayload(base, mlbSelectedTeam);
    case 'league-intel':
      return buildLeaguePayload(base, mlbLeague);
    case 'division-intel':
      return buildDivisionPayload(base, mlbDivision);
    case 'game-insights':
      return buildGamePayload(base, mlbSelectedGame, mlbGameAngle);
    case 'maximus-picks':
      return buildPicksPayload(base, mlbPicks, intelBriefing);
    default:
      return { ...base, headline: 'MLB Intelligence', subhead: 'Model-driven analysis' };
  }
}

// Also export for caption generator
export { parseBriefingToIntel };

function buildDailyPayload(base, intelBriefing, games, picks) {
  const gamesCount = games?.length || 0;

  // If we have the real briefing, use it verbatim
  if (intelBriefing) {
    return {
      ...base,
      intelBriefing,
      headline: intelBriefing.headline,
      bullets: intelBriefing.bullets,
      keyMatchups: intelBriefing.keyMatchups,
    };
  }

  // Fallback: construct from headlines/picks if no briefing available
  const topHeadline = games?.length > 0
    ? `${gamesCount} Games on Today's MLB Slate`
    : 'MLB Intelligence Briefing';

  const cats = picks?.categories ?? {};
  const signals = [];
  if (cats.pickEms?.length) signals.push(`${cats.pickEms.length} moneyline picks`);
  if (cats.ats?.length) signals.push(`${cats.ats.length} run line signals`);

  return {
    ...base,
    headline: topHeadline,
    subhead: signals.length > 0 ? signals.join(' | ') : 'Full model-driven slate analysis',
    bullets: signals.slice(0, 3),
  };
}

function buildTeamPayload(base, team) {
  if (!team) {
    return { ...base, headline: 'Select a team to generate', section: 'team-intel' };
  }
  return {
    ...base,
    headline: `${team.name} Intel Report`,
    subhead: 'Model projections, rotation analysis, and value signals',
    teamA: { name: team.name, slug: team.slug, logoUrl: getMlbEspnLogoUrl(team.slug) },
    bullets: [
      'Season projection and model confidence',
      'Rotation depth and bullpen analysis',
      'Market positioning and value signals',
    ],
  };
}

function buildLeaguePayload(base, league) {
  const lg = league || 'AL';
  const fullName = lg === 'AL' ? 'American League' : 'National League';
  return {
    ...base,
    headline: `${fullName} Overview`,
    subhead: `Key storylines and competitive dynamics across the ${lg}`,
    league: lg,
    bullets: [
      'Division race updates and standings impact',
      'Model projections and playoff probabilities',
      'Notable trends and emerging value',
    ],
  };
}

function buildDivisionPayload(base, division) {
  const div = division || 'AL East';
  return {
    ...base,
    headline: `${div} Division Report`,
    subhead: `Competitive landscape, projections, and value plays`,
    division: div,
    bullets: [
      'Division standings and race dynamics',
      'Team-by-team model projections',
      'Divisional matchup edges and trends',
    ],
  };
}

function buildGamePayload(base, game, angle) {
  if (!game) {
    return { ...base, headline: 'Select a game to generate', section: 'game-insights' };
  }
  const awayName = game.awayTeam || 'Away';
  const homeName = game.homeTeam || 'Home';
  const awaySlug = game.awaySlug || '';
  const homeSlug = game.homeSlug || '';
  const spread = game.homeSpread ?? game.spread;
  const total = game.total;

  const signals = [];
  if (spread != null) signals.push(`Run Line: ${homeName} ${parseFloat(spread) > 0 ? '+' : ''}${spread}`);
  if (total != null) signals.push(`Total: ${total}`);

  return {
    ...base,
    headline: `${awayName} at ${homeName}`,
    subhead: angle === 'story' ? 'Key storylines and matchup dynamics' : 'Value-driven analysis and model edges',
    teamA: { name: awayName, slug: awaySlug, logoUrl: getMlbEspnLogoUrl(awaySlug) },
    teamB: { name: homeName, slug: homeSlug, logoUrl: getMlbEspnLogoUrl(homeSlug) },
    recordA: game.awayRecord || null,
    recordB: game.homeRecord || null,
    signals,
  };
}

function buildPicksPayload(base, picks, intelBriefing) {
  const cats = picks?.categories ?? {};
  const pickRows = [];

  const addPick = (cat, items) => {
    const top = items?.[0];
    if (top) pickRows.push({ market: cat, label: top.pick?.label || cat, confidence: top.confidence });
  };
  addPick('moneyline', cats.pickEms);
  addPick('runline', cats.ats);
  addPick('total', cats.totals);

  const topPick = pickRows[0] || null;

  return {
    ...base,
    headline: topPick ? `Top Play: ${topPick.label}` : "No Strong Lean Today",
    subhead: pickRows.length > 0
      ? `${pickRows.length} qualified pick${pickRows.length !== 1 ? 's' : ''} across today's board`
      : 'Model is waiting for stronger signal alignment',
    keyPick: topPick,
    signals: pickRows.map(p => `${p.market}: ${p.label}`),
    // Include briefing context if available
    ...(intelBriefing ? { intelBriefing } : {}),
  };
}
