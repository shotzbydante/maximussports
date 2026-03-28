/**
 * normalizeMlbImagePayload
 *
 * Converts MLB Content Studio dashboard state into a structured,
 * section-agnostic payload for Gemini image generation.
 *
 * This is the canonical contract between frontend and the generation API.
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';

/**
 * @typedef {Object} MlbImagePayload
 * @property {'mlb'} workspace
 * @property {string} section
 * @property {'value'|'story'|null} angle
 * @property {'mlb-glassy-terminal'} stylePreset
 * @property {'4:5'} aspectRatio
 * @property {string} headline
 * @property {string} [subhead]
 * @property {{ name: string, slug: string, logoUrl?: string }} [teamA]
 * @property {{ name: string, slug: string, logoUrl?: string }} [teamB]
 * @property {'AL'|'NL'} [league]
 * @property {string} [division]
 * @property {string} [dateLabel]
 * @property {string} [recordA]
 * @property {string} [recordB]
 * @property {{ market: string, label: string, confidence?: string }} [keyPick]
 * @property {string[]} [signals]
 * @property {string[]} [bullets]
 * @property {string[]} [tags]
 */

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
 * Build the normalized payload from Dashboard state.
 *
 * @param {Object} opts
 * @param {string} opts.activeSection - e.g. 'mlb-daily'
 * @param {Object} [opts.mlbPicks]    - output from buildMlbPicks
 * @param {Object[]} [opts.mlbGames]  - raw games array
 * @param {Object[]} [opts.mlbHeadlines] - news headlines
 * @param {Object} [opts.mlbSelectedTeam]
 * @param {Object} [opts.mlbSelectedGame]
 * @param {string} [opts.mlbLeague]
 * @param {string} [opts.mlbDivision]
 * @param {string} [opts.mlbGameAngle]
 * @returns {MlbImagePayload}
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
}) {
  const section = SECTION_MAP[activeSection] || 'daily-briefing';

  const base = {
    workspace: 'mlb',
    section,
    angle: mlbGameAngle || null,
    stylePreset: 'mlb-glassy-terminal',
    aspectRatio: '4:5',
    dateLabel: today(),
    tags: ['#MLB', '#MaximusSports', '#BaseballIntel'],
  };

  switch (section) {
    case 'daily-briefing':
      return buildDailyPayload(base, mlbGames, mlbHeadlines, mlbPicks);
    case 'team-intel':
      return buildTeamPayload(base, mlbSelectedTeam);
    case 'league-intel':
      return buildLeaguePayload(base, mlbLeague);
    case 'division-intel':
      return buildDivisionPayload(base, mlbDivision);
    case 'game-insights':
      return buildGamePayload(base, mlbSelectedGame, mlbGameAngle);
    case 'maximus-picks':
      return buildPicksPayload(base, mlbPicks);
    default:
      return { ...base, headline: 'MLB Intelligence', subhead: 'Model-driven analysis' };
  }
}

function buildDailyPayload(base, games, headlines, picks) {
  const gamesCount = games?.length || 0;
  const topHeadline = headlines?.[0]?.headline || headlines?.[0]?.title || '';

  const bullets = [];
  if (topHeadline) bullets.push(topHeadline);
  if (headlines?.[1]) bullets.push(headlines[1].headline || headlines[1].title || '');
  if (gamesCount > 0) bullets.push(`${gamesCount} games on today's slate`);

  const cats = picks?.categories ?? {};
  const signals = [];
  if (cats.pickEms?.length) signals.push(`${cats.pickEms.length} moneyline picks`);
  if (cats.ats?.length) signals.push(`${cats.ats.length} run line signals`);
  if (cats.leans?.length) signals.push(`${cats.leans.length} value leans`);
  if (cats.totals?.length) signals.push(`${cats.totals.length} totals spots`);

  return {
    ...base,
    headline: topHeadline || `${gamesCount} Games on Today's MLB Slate`,
    subhead: signals.length > 0 ? signals.join(' | ') : 'Full model-driven slate analysis',
    bullets: bullets.slice(0, 3),
    signals: signals.slice(0, 4),
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

function buildPicksPayload(base, picks) {
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
  };
}
