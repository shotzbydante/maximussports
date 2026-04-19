/**
 * buildMlbEditorialSummary — single canonical narrative source for ALL
 * MLB surfaces. Replaces the LLM-driven home summary endpoint and powers
 * every email (mlb_briefing / mlb_team_digest / global_briefing) so
 * narrative copy never drifts between surfaces.
 *
 * INPUTS (all optional — engine degrades gracefully when data is missing):
 *   {
 *     standings:        { [slug]: { wins, losses, gb, l10, streak, rank, division } },
 *     championshipOdds: { [slug]: { bestChanceAmerican, american } },
 *     headlines:        Array<{ title, source, link }>,
 *     leaders:          { categories: { homeRuns: { leaders[], teamBest{} }, ... } },
 *     liveGames:        Array<{ homeTeam, awayTeam, homeScore, awayScore, status, ... }>,
 *     picks:            { categories: { pickEms[], ats[], leans[], totals[] } },
 *   }
 *
 * OUTPUTS (all 4 emails + MLB Home consume these):
 *   {
 *     headline:           string,   // sharp daily headline (40+ chars)
 *     subhead:            string,   // contextual subhead
 *     keyStorylines:      string[], // 2-4 sharpest team narratives
 *     whyItMatters:       string,   // synthesized division-level implication (60+ chars)
 *     bigPicture:         string,   // league hierarchy summary
 *     narrativeParagraph: string,   // 5-section paragraph string compatible
 *                                   // with email parser (split on \n\n)
 *   }
 *
 * VALIDATION (throws — never silently ship weak editorial):
 *   [MLB_EDITORIAL_TOO_WEAK]      — headline missing or < 40 chars
 *   [MLB_EDITORIAL_NO_STORYLINES] — keyStorylines empty
 *   [MLB_EDITORIAL_WEAK_CONTEXT]  — whyItMatters < 60 chars or no spaces
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams.js';
import { classifyTeamTier } from '../buildTeamIntelBriefing.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function shortName(fullName) {
  if (!fullName) return '';
  if (/White Sox$/i.test(fullName)) return 'White Sox';
  if (/Red Sox$/i.test(fullName)) return 'Red Sox';
  if (/Blue Jays$/i.test(fullName)) return 'Blue Jays';
  return fullName.split(' ').pop();
}

function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

function formatOdds(american) {
  if (american == null) return '';
  if (typeof american === 'number') {
    return american > 0 ? `+${american}` : String(american);
  }
  return String(american);
}

/** Build a normalized array of teams with merged standings/odds/division data. */
function buildTeamRollup({ standings = {}, championshipOdds = {} }) {
  return MLB_TEAMS.map(t => {
    const st = standings[t.slug] || null;
    const odds = championshipOdds[t.slug] || null;
    const wins = st?.wins ?? null;
    const losses = st?.losses ?? null;
    const gp = (wins != null && losses != null) ? wins + losses : null;
    const winPct = (gp && gp > 0) ? (wins / gp) : null;
    return {
      slug: t.slug,
      name: t.name,
      shortName: shortName(t.name),
      abbrev: t.abbrev,
      division: t.division,
      league: t.league,
      wins, losses,
      record: st?.record || (wins != null && losses != null ? `${wins}-${losses}` : null),
      gb: st?.gb ?? null,
      rank: st?.rank ?? null,
      l10: st?.l10 || null,
      streak: st?.streak || null,
      gp, winPct,
      bestOdds: odds?.bestChanceAmerican ?? odds?.american ?? null,
    };
  });
}

/** Group teams by division, sorted by rank (1 = leader). Teams without
 *  standings data are EXCLUDED from divisions so the sort never places
 *  a no-data team at position [1] and surfaces a div line with no GB. */
function groupByDivision(teams) {
  const divisions = {};
  for (const t of teams) {
    if (!t.division) continue;
    // Require at least record OR rank — teams without any standings data
    // would otherwise pollute the division ordering with null comparisons.
    if (!t.record && t.rank == null && t.winPct == null) continue;
    if (!divisions[t.division]) divisions[t.division] = [];
    divisions[t.division].push(t);
  }
  for (const div of Object.keys(divisions)) {
    divisions[div].sort((a, b) => {
      // Rank wins; fall back to winPct; finally name
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      if (a.winPct != null && b.winPct != null) return b.winPct - a.winPct;
      if (a.winPct != null) return -1;
      if (b.winPct != null) return 1;
      return a.name.localeCompare(b.name);
    });
  }
  return divisions;
}

// ─── Storyline Extraction (Part 2) ────────────────────────────────────────

/**
 * Identify 2-4 strongest cross-team storylines from the rollup.
 *
 * Priority surfaces:
 *   1. Contenders creating real separation (1st place, ≥3 GB ahead)
 *   2. Tightening division races (3+ teams within 4 GB)
 *   3. Falling teams under real pressure (5th place, ≥6 GB)
 *   4. Hot streak detection (5+ wins in a row)
 *   5. Cold streak detection (5+ losses in a row)
 */
export function extractTopStorylines(rollup) {
  const storylines = [];
  const divisions = groupByDivision(rollup);

  // 1. Division separators — leader ahead by 3+ GB
  for (const [div, teams] of Object.entries(divisions)) {
    if (teams.length < 2) continue;
    const leader = teams[0];
    const second = teams[1];
    if (leader.rank === 1 && leader.gb === 0 && second.gb != null && second.gb >= 3) {
      storylines.push({
        priority: 100,
        kind: 'separator',
        slug: leader.slug,
        text: `${leader.shortName} are creating real separation in the ${div}, ${second.gb} games ahead of the chasers.`,
      });
    }
  }

  // 2. Tightening races — 3+ teams within 4 GB at the top
  for (const [div, teams] of Object.entries(divisions)) {
    if (teams.length < 3) continue;
    const within4 = teams.filter(t => (t.gb ?? 99) <= 4);
    if (within4.length >= 3) {
      const names = within4.slice(0, 3).map(t => t.shortName).join(', ');
      storylines.push({
        priority: 90,
        kind: 'tightening',
        text: `The ${div} is tightening, with ${within4.length} teams within striking distance — ${names} are all in the mix and every series puts pressure on the standings.`,
      });
    }
  }

  // 3. Hot streaks (5+ wins) — surface most impressive
  const hotTeams = rollup
    .filter(t => {
      if (!t.streak) return false;
      const isWin = String(t.streak).toUpperCase().startsWith('W');
      const n = parseInt(String(t.streak).replace(/[^\d]/g, '')) || 0;
      return isWin && n >= 5;
    })
    .sort((a, b) => {
      const aN = parseInt(String(a.streak).replace(/[^\d]/g, '')) || 0;
      const bN = parseInt(String(b.streak).replace(/[^\d]/g, '')) || 0;
      return bN - aN;
    });
  for (const t of hotTeams.slice(0, 1)) {
    const n = parseInt(String(t.streak).replace(/[^\d]/g, '')) || 0;
    storylines.push({
      priority: 85,
      kind: 'hot_streak',
      slug: t.slug,
      text: `${t.shortName} are surging on a ${n}-game win streak — the kind of stretch that resets the tone of a season.`,
    });
  }

  // 4. Falling teams under pressure — 5th place ≥ 6 GB
  for (const [div, teams] of Object.entries(divisions)) {
    if (teams.length < 5) continue;
    const cellar = teams[teams.length - 1];
    if (cellar.gb != null && cellar.gb >= 8) {
      storylines.push({
        priority: 70,
        kind: 'falling',
        slug: cellar.slug,
        text: `${cellar.shortName} are sitting ${cellar.gb} games back in the ${div} — the runway to contention is shortening fast.`,
      });
    }
  }

  // 5. Cold streaks (5+ losses) — surface worst
  const coldTeams = rollup
    .filter(t => {
      if (!t.streak) return false;
      const isLoss = String(t.streak).toUpperCase().startsWith('L');
      const n = parseInt(String(t.streak).replace(/[^\d]/g, '')) || 0;
      return isLoss && n >= 5;
    })
    .sort((a, b) => {
      const aN = parseInt(String(a.streak).replace(/[^\d]/g, '')) || 0;
      const bN = parseInt(String(b.streak).replace(/[^\d]/g, '')) || 0;
      return bN - aN;
    });
  for (const t of coldTeams.slice(0, 1)) {
    const n = parseInt(String(t.streak).replace(/[^\d]/g, '')) || 0;
    storylines.push({
      priority: 65,
      kind: 'cold_streak',
      slug: t.slug,
      text: `${t.shortName} have dropped ${n} in a row — a skid like this puts real pressure on the standings position they had built.`,
    });
  }

  // Dedupe by slug if same team surfaces twice
  const seenSlugs = new Set();
  const deduped = [];
  for (const s of storylines.sort((a, b) => b.priority - a.priority)) {
    if (s.slug && seenSlugs.has(s.slug)) continue;
    if (s.slug) seenSlugs.add(s.slug);
    deduped.push(s);
    if (deduped.length >= 4) break;
  }
  // Generic fallback so the editorial layer never produces zero storylines
  // (early season, sparse standings, missing odds, etc.). Validation
  // requires ≥1 — this guarantees a publishable result even in edge cases.
  if (deduped.length === 0) {
    deduped.push({
      priority: 10,
      kind: 'generic',
      text: `The early stretch keeps shaping the league's playoff picture, with division leaders and chasers still trying to establish their tier.`,
    });
  }
  return deduped;
}

// ─── Why It Matters (Part 3) ──────────────────────────────────────────────

/**
 * Synthesize a single division-level "why it matters" sentence. Must
 * mention at least one consequence (puts/limits/forces/keeps/creates).
 */
export function buildWhyItMatters(rollup, divisions) {
  // Find the most consequential division dynamic
  const dynamics = [];
  for (const [div, teams] of Object.entries(divisions)) {
    if (teams.length < 2) continue;
    const leader = teams[0];
    const second = teams[1];

    // Tightening race
    const within3 = teams.filter(t => (t.gb ?? 99) <= 3);
    if (within3.length >= 3) {
      dynamics.push({
        priority: 100,
        text: `The ${div} is tightening, with ${within3.length} teams within striking distance — which puts pressure on every series and limits room for error across the top of the standings.`,
      });
    } else if (leader.gb === 0 && second.gb != null && second.gb >= 4) {
      dynamics.push({
        priority: 90,
        text: `${leader.shortName} are pulling away in the ${div}, building a ${second.gb}-game cushion that puts real pressure on the chasers and limits the realistic playoff window for the rest of the division.`,
      });
    } else if (leader.gb === 0 && second.gb != null && second.gb <= 1) {
      dynamics.push({
        priority: 85,
        text: `${leader.shortName} and ${second.shortName} are deadlocked atop the ${div}, with every head-to-head matchup carrying real standings weight that puts the rest of the field in the wild-card conversation.`,
      });
    }
  }

  if (dynamics.length === 0) {
    // Fallback: hot/cold streak driven
    const hot = rollup.find(t => t.streak && /^W\d/.test(String(t.streak)) && parseInt(String(t.streak).slice(1)) >= 5);
    const cold = rollup.find(t => t.streak && /^L\d/.test(String(t.streak)) && parseInt(String(t.streak).slice(1)) >= 5);
    if (hot) {
      return `${hot.shortName}'s recent surge keeps shifting the league hierarchy and puts pressure on the contenders chasing them in the ${hot.division}.`;
    }
    if (cold) {
      return `${cold.shortName}'s skid keeps costing them ground and forces a sharper response before the deficit becomes the defining storyline of their season.`;
    }
    return `The early stretch keeps shaping the league's playoff picture, with division leaders putting pressure on every contender to stack consistent series wins.`;
  }

  dynamics.sort((a, b) => b.priority - a.priority);
  return dynamics[0].text;
}

// ─── Big Picture (Part 4) ─────────────────────────────────────────────────

/**
 * League hierarchy summary — one sentence on contenders vs fringe vs
 * volatility, derived from championship odds and division standings.
 */
export function buildBigPicture(rollup, divisions) {
  // Top teams by best odds
  const byOdds = [...rollup]
    .filter(t => t.bestOdds != null)
    .sort((a, b) => {
      // Lower (more negative) odds = stronger favorite
      const aN = typeof a.bestOdds === 'number' ? a.bestOdds : parseFloat(String(a.bestOdds).replace('+', ''));
      const bN = typeof b.bestOdds === 'number' ? b.bestOdds : parseFloat(String(b.bestOdds).replace('+', ''));
      return aN - bN;
    });

  const topFavorite = byOdds[0] || null;
  const alLeaders = Object.entries(divisions)
    .filter(([div]) => div.startsWith('AL'))
    .map(([, teams]) => teams[0])
    .filter(Boolean);
  const nlLeaders = Object.entries(divisions)
    .filter(([div]) => div.startsWith('NL'))
    .map(([, teams]) => teams[0])
    .filter(Boolean);

  // Identify the dominant league by leader strength
  const alStrong = alLeaders.filter(t => t.gb === 0 && t.winPct != null && t.winPct >= 0.580).length;
  const nlStrong = nlLeaders.filter(t => t.gb === 0 && t.winPct != null && t.winPct >= 0.580).length;

  if (topFavorite && nlStrong > alStrong) {
    return `${topFavorite.shortName} continue to set the pace with the strongest championship odds, while the AL remains more fluid with multiple teams still in contention for the league's top seed.`;
  }
  if (topFavorite && alStrong > nlStrong) {
    return `${topFavorite.shortName} sit at the top of the championship odds, while the NL stays bunched with multiple division races still being decided week to week.`;
  }
  if (topFavorite) {
    return `${topFavorite.shortName} hold the strongest championship odds, but both leagues remain fluid enough that the next month of play will reshape the contender tier.`;
  }
  return `Both leagues remain wide open, with multiple division races bunched closely enough that the next month of play will define the contender tier.`;
}

// ─── Headline + Subhead ───────────────────────────────────────────────────

function buildHeadline(storylines, rollup) {
  // All headline branches must produce ≥ 40 chars (validateEditorial gate).
  const top = storylines[0];
  if (top) {
    if (top.kind === 'separator') {
      const sn = top.text.split(' are')[0];
      return `${sn} pull away in the division as the chasers run out of room`;
    }
    if (top.kind === 'tightening') {
      const m = top.text.match(/^The (\w[\w ]*?) is/);
      const div = m ? m[1] : 'A division';
      return `${div} race tightens at the top with multiple teams in striking distance`;
    }
    if (top.kind === 'hot_streak') {
      const m = top.text.match(/^(\w[\w ]*?) are surging/);
      const sn = m ? m[1] : 'A contender';
      return `${sn} on a tear with no signs of slowing down across the recent stretch`;
    }
    if (top.kind === 'falling') {
      const m = top.text.match(/^(\w[\w ]*?) are sitting/);
      const sn = m ? m[1] : 'A former contender';
      return `${sn} fading fast as their division continues to separate at the top`;
    }
    if (top.kind === 'cold_streak') {
      const m = top.text.match(/^(\w[\w ]*?) have dropped/);
      const sn = m ? m[1] : 'A struggling team';
      return `${sn} searching for answers in a brutal stretch of consecutive losses`;
    }
    if (top.kind === 'generic') {
      return `Today's MLB slate keeps shaping the league's playoff picture across both leagues`;
    }
  }
  // Fallback — generic but specific to today's slate
  const teamCount = rollup.length;
  return `Today's MLB slate puts ${teamCount} teams' standings position in real play`;
}

function buildSubhead(storylines, rollup, divisions) {
  const top = storylines[0];
  if (top) return top.text;
  // Fallback — derive from division dynamics
  for (const [div, teams] of Object.entries(divisions)) {
    if (teams.length < 2) continue;
    const leader = teams[0];
    if (leader.record) {
      return `${leader.shortName} (${leader.record}) lead the ${div} as the league's daily storylines keep developing.`;
    }
  }
  return 'The league is in motion as contenders, fringe teams, and rebuilders sort themselves out.';
}

// ─── Narrative Paragraph Composition ──────────────────────────────────────

/**
 * Assemble the 5-section paragraph string consumed by the email parser
 * (mlbBriefing.js parseNarrativeToSections splits on \n\n). Each section
 * is editorial prose 60-100 words built from the structured editorial
 * outputs above. Section order matches the email template's expectations:
 *   1. AROUND THE LEAGUE
 *   2. WORLD SERIES ODDS PULSE
 *   3. PENNANT RACE & DIVISION WATCH
 *   4. SLEEPERS, INJURIES & VALUE
 *   5. DIAMOND DISPATCH
 */
function composeNarrativeParagraph({ storylines, whyItMatters, bigPicture, rollup, divisions, headlines, leaders }) {
  // P1 — AROUND THE LEAGUE: lead with top storyline + supporting headlines
  const p1Parts = [];
  if (storylines[0]) p1Parts.push(storylines[0].text);
  if (storylines[1]) p1Parts.push(storylines[1].text);
  if (storylines[2]) p1Parts.push(storylines[2].text);
  if (p1Parts.length === 0) {
    p1Parts.push(`Today's slate keeps shaping the league's playoff picture as contenders try to stack series wins and fringe teams put pressure on the standings.`);
  }
  const p1 = `AROUND THE LEAGUE: ${p1Parts.join(' ')}`;

  // P2 — WORLD SERIES ODDS PULSE: built from championship odds
  const p2 = `WORLD SERIES ODDS PULSE: ${bigPicture}`;

  // P3 — PENNANT RACE & DIVISION WATCH: per-division snapshot
  const divLines = [];
  for (const [div, teams] of Object.entries(divisions)) {
    if (teams.length < 2) continue;
    const leader = teams[0];
    const second = teams[1];
    if (leader.record && second.gb != null) {
      const gbText = second.gb === 0 ? 'tied for the lead' : `${second.gb} ${second.gb === 1 ? 'game' : 'games'} back`;
      divLines.push(`${leader.shortName} (${leader.record}) lead the ${div} with ${second.shortName} ${gbText}`);
    } else if (leader.record) {
      divLines.push(`${leader.shortName} (${leader.record}) lead the ${div}`);
    }
    if (divLines.length >= 3) break;
  }
  const p3 = divLines.length > 0
    ? `PENNANT RACE & DIVISION WATCH: ${divLines.join('; ')}. ${whyItMatters}`
    : `PENNANT RACE & DIVISION WATCH: ${whyItMatters}`;

  // P4 — SLEEPERS, INJURIES & VALUE: leaders + value-driven framing
  const leaderHooks = [];
  if (leaders?.categories) {
    const cats = leaders.categories;
    const hr = cats.homeRuns?.leaders?.[0];
    const wins = cats.wins?.leaders?.[0];
    if (hr?.name) leaderHooks.push(`${hr.name} continues to lead the league in home runs (${hr.display || hr.value})`);
    if (wins?.name) leaderHooks.push(`${wins.name} keeps stacking wins (${wins.display || wins.value} on the season)`);
  }
  const p4Body = leaderHooks.length > 0
    ? `${leaderHooks.join(' and ')} — the kind of individual production that keeps shifting the championship odds.`
    : `Individual production around the league keeps shifting the championship odds and forcing the contender tier to stay sharp.`;
  const p4 = `SLEEPERS, INJURIES & VALUE: ${p4Body}`;

  // P5 — DIAMOND DISPATCH (closer): wrap with forward-looking framing
  const closer = `Tonight's slate keeps shaping the league's pecking order, and the next series for every contender puts the standings firmly in play.`;
  const p5 = `DIAMOND DISPATCH: ${closer}`;

  return [p1, p2, p3, p4, p5].join('\n\n');
}

// ─── Validation (Part 9) ──────────────────────────────────────────────────

function validateEditorial({ headline, keyStorylines, whyItMatters }) {
  if (!headline || headline.length < 40) {
    throw new Error(`[MLB_EDITORIAL_TOO_WEAK] Headline missing or too short (${headline?.length || 0} chars): "${headline}"`);
  }
  if (!keyStorylines || keyStorylines.length === 0) {
    throw new Error(`[MLB_EDITORIAL_NO_STORYLINES] No storylines extracted from the editorial inputs`);
  }
  if (!whyItMatters || whyItMatters.length < 60 || !whyItMatters.includes(' ')) {
    throw new Error(`[MLB_EDITORIAL_WEAK_CONTEXT] Why-it-matters missing or too short (${whyItMatters?.length || 0} chars): "${whyItMatters}"`);
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────

export function buildMlbEditorialSummary(input = {}) {
  const {
    standings = {},
    championshipOdds = {},
    headlines = [],
    leaders = null,
    liveGames = [],
    picks = null,
  } = input;

  void liveGames; void picks; // accepted for API stability — future-use signal

  // 1. Build normalized team rollup
  const rollup = buildTeamRollup({ standings, championshipOdds });
  const divisions = groupByDivision(rollup);

  // 2. Extract structured editorial layers
  const storylinesObjs = extractTopStorylines(rollup);
  const keyStorylines = storylinesObjs.map(s => s.text);
  const whyItMatters = buildWhyItMatters(rollup, divisions);
  const bigPicture = buildBigPicture(rollup, divisions);

  // 3. Compose headline + subhead
  const headline = buildHeadline(storylinesObjs, rollup);
  const subhead = buildSubhead(storylinesObjs, rollup, divisions);

  // 4. Compose 5-section narrative paragraph (email-parser-compatible)
  const narrativeParagraph = composeNarrativeParagraph({
    storylines: storylinesObjs,
    whyItMatters,
    bigPicture,
    rollup,
    divisions,
    headlines,
    leaders,
  });

  // 5. Validate (throws on weak output — never silently ship)
  validateEditorial({ headline, keyStorylines, whyItMatters });

  return {
    headline,
    subhead,
    keyStorylines,
    whyItMatters,
    bigPicture,
    narrativeParagraph,
  };
}

// Re-export classifyTeamTier for cross-surface use
export { classifyTeamTier };
