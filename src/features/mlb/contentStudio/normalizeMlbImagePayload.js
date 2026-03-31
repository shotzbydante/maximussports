/**
 * normalizeMlbImagePayload
 *
 * Converts MLB Content Studio dashboard state into a structured payload
 * for Gemini image generation.
 *
 * Content source of truth: MLB Home "Today's Intelligence Briefing"
 * (llmSummary from /api/mlb/chat/homeSummary).
 *
 * The briefing is a 5-paragraph AI-generated text:
 *   P1: AROUND THE LEAGUE — top headlines
 *   P2: WORLD SERIES ODDS PULSE — championship odds
 *   P3: PENNANT RACE & DIVISION WATCH — standings/races
 *   P4: SLEEPERS, INJURIES & VALUE — value plays
 *   P5: DIAMOND DISPATCH + CLOSER — remaining headlines + closer
 *
 * parseBriefingToIntel() extracts rich structured data while preserving
 * the actual source wording. Text is NEVER summarized or rewritten.
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';

const SECTION_MAP = {
  'mlb-daily':    'daily-briefing',
  'mlb-team':     'team-intel',
  'mlb-league':   'league-intel',
  'mlb-division': 'division-intel',
  'mlb-game':     'game-insights',
  'mlb-picks':    'maximus-picks',
};

// Canonical MLB team names for matchup extraction
const MLB_TEAM_NAMES = [
  'Yankees', 'Red Sox', 'Blue Jays', 'Rays', 'Orioles',
  'Guardians', 'Twins', 'White Sox', 'Royals', 'Tigers',
  'Astros', 'Rangers', 'Mariners', 'Athletics', 'Angels',
  'Braves', 'Mets', 'Phillies', 'Marlins', 'Nationals',
  'Cubs', 'Brewers', 'Cardinals', 'Pirates', 'Reds',
  'Dodgers', 'Diamondbacks', 'Padres', 'Giants', 'Rockies',
];

// Full city+team patterns for extraction
const FULL_TEAM_PATTERNS = [
  'Los Angeles Dodgers', 'New York Yankees', 'Houston Astros', 'Atlanta Braves',
  'Philadelphia Phillies', 'San Diego Padres', 'New York Mets', 'Boston Red Sox',
  'Chicago Cubs', 'San Francisco Giants', 'Cleveland Guardians', 'Baltimore Orioles',
  'Tampa Bay Rays', 'Texas Rangers', 'Minnesota Twins', 'Seattle Mariners',
  'Milwaukee Brewers', 'St. Louis Cardinals', 'Toronto Blue Jays', 'Arizona Diamondbacks',
  'Detroit Tigers', 'Kansas City Royals', 'Cincinnati Reds', 'Pittsburgh Pirates',
  'Los Angeles Angels', 'Chicago White Sox', 'Miami Marlins', 'Washington Nationals',
  'Colorado Rockies', 'Oakland Athletics',
];

function today() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

/** Strip markdown bold/italic markers, preserving the text inside. */
function stripMarkdown(text) {
  if (!text) return '';
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

/** Extract up to N sentences from a paragraph. */
function extractSentences(text, max = 2) {
  if (!text) return [];
  // Split on sentence boundaries (period/exclamation/question followed by space or end)
  const sentences = text.match(/[^.!?]*[.!?]+/g) || [text];
  return sentences.slice(0, max).map(s => s.trim()).filter(Boolean);
}

/** Extract the section label from a paragraph if present (e.g., "ODDS PULSE:"). */
function extractSectionLabel(text) {
  const match = text.match(/^([A-Z][A-Z\s&+\-:]*[A-Z])\s*[:—–-]\s*/);
  if (match) return { label: match[1].trim(), content: text.slice(match[0].length) };
  return { label: null, content: text };
}

/**
 * Extract team mentions from text using canonical MLB team names.
 * Returns unique team names found in the text.
 */
function extractTeamMentions(text) {
  if (!text) return [];
  const found = new Set();
  // Check full city+team names first
  for (const full of FULL_TEAM_PATTERNS) {
    if (text.includes(full)) {
      const short = full.split(' ').pop(); // Last word = team name
      found.add(short);
    }
  }
  // Then check short names
  for (const name of MLB_TEAM_NAMES) {
    if (text.includes(name)) found.add(name);
  }
  return [...found];
}

/**
 * Extract matchup pairs from text.
 * Looks for patterns like "Team vs Team", "Team at Team", "Team-Team".
 */
function extractMatchups(text) {
  if (!text) return [];
  const matchups = [];
  // Pattern: TeamName vs/at/@ TeamName
  const patterns = [
    /\b((?:[A-Z][a-z]+\s)*[A-Z][a-z]+)\s+(?:vs\.?|at|@|versus)\s+((?:[A-Z][a-z]+\s)*[A-Z][a-z]+)\b/g,
  ];
  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(text)) !== null && matchups.length < 4) {
      const a = m[1].trim();
      const b = m[2].trim();
      // Validate at least one is a known MLB team
      const aKnown = MLB_TEAM_NAMES.some(t => a.includes(t));
      const bKnown = MLB_TEAM_NAMES.some(t => b.includes(t));
      if (aKnown || bKnown) {
        matchups.push({ teamA: a, teamB: b });
      }
    }
  }
  return matchups;
}

/**
 * Parse the 5-paragraph briefing text into a rich structured intelBriefing.
 *
 * Extracts MUCH MORE content than the previous version:
 * - headline + subhead from P1
 * - 4-6 substantive bullets across all paragraphs
 * - matchups found anywhere in the text
 * - board pulse summary
 * - team mentions for potential logo injection
 *
 * All content is preserved verbatim — never summarized.
 */
export function parseBriefingToIntel(briefingText) {
  if (!briefingText) return null;

  const paragraphs = briefingText.split(/\n\n+/).filter(p => p.trim());
  if (paragraphs.length === 0) return null;

  const cleaned = paragraphs.map(stripMarkdown);

  // ── P1: headline + subhead ──
  const p1 = extractSectionLabel(cleaned[0]);
  const p1Sentences = extractSentences(p1.content, 3);
  const headline = p1Sentences[0] || cleaned[0].slice(0, 120);
  const subhead = p1Sentences[1] || '';

  // ── Build 4-6 rich bullets from all paragraphs ──
  // Take the most substantive sentence from each paragraph section
  const bullets = [];

  for (let i = 0; i < Math.min(cleaned.length, 5); i++) {
    const { label, content } = extractSectionLabel(cleaned[i]);
    const sentences = extractSentences(content, 2);

    if (i === 0) {
      // P1: skip headline (already extracted), take second sentence if available
      if (sentences.length > 1) {
        bullets.push(sentences[1]);
      }
    } else {
      // P2-P5: take first 1-2 sentences, prefix with section context
      for (const s of sentences.slice(0, i <= 2 ? 2 : 1)) {
        if (s.trim().length > 15) { // Skip very short fragments
          bullets.push(s);
        }
      }
    }

    if (bullets.length >= 6) break;
  }

  // ── Extract matchups from full text ──
  const keyMatchups = extractMatchups(briefingText);

  // ── Extract all team mentions for logo context ──
  const teamMentions = extractTeamMentions(briefingText);

  // ── Board pulse: a compact summary line from P2 or P3 odds/standings ──
  let boardPulse = '';
  if (cleaned.length >= 3) {
    const p2 = extractSectionLabel(cleaned[1]);
    const p2First = extractSentences(p2.content, 1)[0];
    if (p2First) boardPulse = p2First;
  }

  return {
    headline,
    subhead,
    bullets: bullets.slice(0, 6),
    keyMatchups: keyMatchups.slice(0, 3),
    teamMentions: teamMentions.slice(0, 8),
    boardPulse,
    date: today(),
    rawParagraphs: cleaned.slice(0, 5),
  };
}

/**
 * Build the normalized payload from Dashboard state.
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
  mlbChampOdds,
}) {
  const section = SECTION_MAP[activeSection] || 'daily-briefing';
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
    layoutVariant: 'headline-heavy',
  };

  switch (section) {
    case 'daily-briefing':
      return buildDailyPayload(base, intelBriefing, mlbGames, mlbPicks, mlbChampOdds);
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

function buildDailyPayload(base, intelBriefing, games, picks, champOdds) {
  const gamesCount = games?.length || 0;

  // Build Season Intelligence leaders for Gemini payload
  let seasonIntel = null;
  if (champOdds && Object.keys(champOdds).length > 0) {
    try {
      const entries = [];
      for (const [slug, data] of Object.entries(champOdds)) {
        const team = MLB_TEAMS.find(t => t.slug === slug);
        if (!team || !data) continue;
        const odds = data.bestChanceAmerican ?? data.american ?? null;
        if (odds == null) continue;
        const proj = getTeamProjection(slug);
        entries.push({
          slug, name: team.name, abbrev: team.abbrev, league: team.league, odds,
          projectedWins: proj?.projectedWins ?? null,
          signals: proj?.signals ?? [],
          strongestDriver: proj?.takeaways?.strongestDriver ?? null,
          marketStance: proj?.takeaways?.marketStance ?? null,
        });
      }
      // Sort by projected wins DESCENDING (not by odds)
      entries.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
      const al = entries.filter(e => e.league === 'AL').slice(0, 3);
      const nl = entries.filter(e => e.league === 'NL').slice(0, 3);
      if (al.length > 0 || nl.length > 0) {
        seasonIntel = {
          al, nl,
          featured: [al[0], nl[0]].filter(Boolean),
          secondary: [...al.slice(1), ...nl.slice(1)],
        };
      }
    } catch { /* non-fatal */ }
  }

  if (intelBriefing) {
    return {
      ...base,
      intelBriefing,
      headline: intelBriefing.headline,
      subhead: intelBriefing.subhead,
      bullets: intelBriefing.bullets,
      keyMatchups: intelBriefing.keyMatchups,
      boardPulse: intelBriefing.boardPulse,
      teamMentions: intelBriefing.teamMentions,
      seasonIntel,
    };
  }

  // Fallback
  const cats = picks?.categories ?? {};
  const signals = [];
  if (cats.pickEms?.length) signals.push(`${cats.pickEms.length} moneyline picks`);
  if (cats.ats?.length) signals.push(`${cats.ats.length} run line signals`);

  return {
    ...base,
    headline: `${gamesCount} Games on Today's MLB Slate`,
    subhead: signals.length > 0 ? signals.join(' | ') : 'Full model-driven slate analysis',
    bullets: signals.slice(0, 3),
    seasonIntel,
  };
}

function buildTeamPayload(base, team) {
  if (!team) return { ...base, headline: 'Select a team to generate', section: 'team-intel' };
  return {
    ...base,
    headline: `${team.name} Intel Report`,
    subhead: 'Model projections, rotation analysis, and value signals',
    teamA: { name: team.name, slug: team.slug, logoUrl: getMlbEspnLogoUrl(team.slug) },
    bullets: ['Season projection and model confidence', 'Rotation depth and bullpen analysis', 'Market positioning and value signals'],
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
    bullets: ['Division race updates and standings impact', 'Model projections and playoff probabilities', 'Notable trends and emerging value'],
  };
}

function buildDivisionPayload(base, division) {
  const div = division || 'AL East';
  return {
    ...base,
    headline: `${div} Division Report`,
    subhead: `Competitive landscape, projections, and value plays`,
    division: div,
    bullets: ['Division standings and race dynamics', 'Team-by-team model projections', 'Divisional matchup edges and trends'],
  };
}

function buildGamePayload(base, game, angle) {
  if (!game) return { ...base, headline: 'Select a game to generate', section: 'game-insights' };
  const awayName = game.awayTeam || 'Away';
  const homeName = game.homeTeam || 'Home';
  const spread = game.homeSpread ?? game.spread;
  const total = game.total;
  const signals = [];
  if (spread != null) signals.push(`Run Line: ${homeName} ${parseFloat(spread) > 0 ? '+' : ''}${spread}`);
  if (total != null) signals.push(`Total: ${total}`);
  return {
    ...base,
    headline: `${awayName} at ${homeName}`,
    subhead: angle === 'story' ? 'Key storylines and matchup dynamics' : 'Value-driven analysis and model edges',
    teamA: { name: awayName, slug: game.awaySlug || '', logoUrl: getMlbEspnLogoUrl(game.awaySlug || '') },
    teamB: { name: homeName, slug: game.homeSlug || '', logoUrl: getMlbEspnLogoUrl(game.homeSlug || '') },
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
    subhead: pickRows.length > 0 ? `${pickRows.length} qualified pick${pickRows.length !== 1 ? 's' : ''} across today's board` : 'Model is waiting for stronger signal alignment',
    keyPick: topPick,
    signals: pickRows.map(p => `${p.market}: ${p.label}`),
    ...(intelBriefing ? { intelBriefing } : {}),
  };
}
