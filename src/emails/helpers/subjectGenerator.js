/**
 * Dynamic subject line generator for all Maximus email products.
 *
 * Requirements:
 * - Every subject contains at least one emoji
 * - Subjects are dynamic, data-driven, never static
 * - Same template never repeats on consecutive days (date-based rotation)
 * - Tone: premium sports editorial, not spammy
 */

import { getTournamentPhase } from '../../utils/tournamentHelpers.js';

const PHASE_LABELS = {
  pre_tournament: 'Selection Sunday',
  first_round: 'Round of 64',
  sweet_sixteen: 'Sweet 16',
  final_four: 'Final Four',
};

/**
 * Deterministic rotation index based on date + salt.
 * Ensures different template each day without persistence.
 */
function dayRotation(salt = '') {
  const d = new Date();
  const dayNum = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  let hash = 0;
  for (let i = 0; i < salt.length; i++) hash = (hash * 31 + salt.charCodeAt(i)) | 0;
  return Math.abs(dayNum + hash);
}

function pick(arr, salt = '') {
  return arr[dayRotation(salt) % arr.length];
}

/* ═══════════════════════════════════════════════════════════════
   DAILY BRIEFING SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function dailyBriefingSubject({ displayName, modelSignals = [], atsLeaders = {} } = {}) {
  const name = displayName ? displayName.split(' ')[0] : null;
  const phase = getTournamentPhase();
  const roundLabel = PHASE_LABELS[phase] || null;
  const topPick = modelSignals[0];
  const topAts = (atsLeaders.best || [])[0];
  const templates = [];

  // Tournament-aware templates
  if (roundLabel) {
    templates.push(`🏀 ${roundLabel} intel: your daily edge is ready`);
    templates.push(`🔥 March Madness briefing: today's model reads`);
    templates.push(`📊 ${roundLabel} watch: picks, trends, and edges`);
    if (topPick?.matchup) templates.push(`💰 ${roundLabel}: Maximus has a take on ${topPick.matchup}`);
    if (topAts) templates.push(`📈 ${roundLabel}: ${topAts.name || topAts.team} is on fire ATS`);
  }

  // Data-driven templates
  if (topPick?.matchup) templates.push(`🎯 Today's top play: ${topPick.matchup}`);
  if (topAts) templates.push(`🔥 ${topAts.name || topAts.team} is covering everything right now`);

  // Fallback templates
  templates.push(`🏀 Daily NCAA Men's Basketball Briefing`);
  templates.push(`📊 Your daily hoops edge is ready`);
  templates.push(`🎯 Model signals are live — here's your briefing`);

  const subject = pick(templates, 'daily');
  return name ? `${name}, ${subject.charAt(0).toLowerCase() === subject.charAt(0) ? subject : subject}` : subject;
}

/* ═══════════════════════════════════════════════════════════════
   PINNED TEAM ALERTS SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function pinnedTeamsSubject({ displayName, pinnedTeams = [] } = {}) {
  const name = displayName ? displayName.split(' ')[0] : null;
  const first = pinnedTeams[0];
  const teamName = first?.name?.split(' ').pop() || first?.name || null;

  const templates = [];
  if (teamName && pinnedTeams.length === 1) {
    templates.push(`🚨 ${first.name} alert: what you need to know`);
    templates.push(`🔥 ${teamName} update: latest intel inside`);
    templates.push(`📈 ${first.name}: here's what's changed`);
  } else if (teamName && pinnedTeams.length > 1) {
    templates.push(`🚨 ${teamName} + ${pinnedTeams.length - 1} more: team alerts`);
    templates.push(`🏀 Your teams: ${teamName} leads today's updates`);
    templates.push(`📊 ${pinnedTeams.length} team updates you need to see`);
  }
  templates.push(`🚨 Your team alerts are ready`);

  const subject = pick(templates, 'pinned');
  return name ? `${name}, ${subject.replace(/^[^\w]*/, '')}` : subject;
}

/* ═══════════════════════════════════════════════════════════════
   ODDS & ATS INTEL SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function oddsIntelSubject({ displayName, atsLeaders = {} } = {}) {
  const name = displayName ? displayName.split(' ')[0] : null;
  const top = (atsLeaders.best || [])[0];
  const bottom = (atsLeaders.worst || [])[0];

  const templates = [];
  if (top) {
    templates.push(`💰 ATS edge: ${top.name || top.team} is covering everything`);
    templates.push(`📊 Sharp money update: where the value lives today`);
    templates.push(`🔥 The market hasn't caught up to ${top.name || top.team}`);
  }
  if (bottom) {
    templates.push(`⚠️ One team to fade today — and where the edge is`);
  }
  templates.push(`💰 Today's ATS edges and line intel`);
  templates.push(`📊 Odds intel: where Maximus sees value`);
  templates.push(`🎯 Market watch: spreads, totals, and edge signals`);

  const subject = pick(templates, 'odds');
  return name ? `${name}, ${subject.replace(/^[^\w]*/, '')}` : subject;
}

/* ═══════════════════════════════════════════════════════════════
   BREAKING NEWS SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function breakingNewsSubject({ displayName, headlines = [] } = {}) {
  const name = displayName ? displayName.split(' ')[0] : null;
  const top = headlines[0];

  const templates = [];
  if (top?.title) {
    const short = (top.title.length > 45) ? top.title.slice(0, 45) + '…' : top.title;
    templates.push(`🚨 ${short}`);
    templates.push(`📰 Top story: ${short}`);
  }
  templates.push(`🚨 What just changed in March Madness`);
  templates.push(`📰 The stories that matter right now`);
  templates.push(`⚡ Breaking: new intel that moves the needle`);

  const subject = pick(templates, 'news');
  return name ? `${name}, ${subject.replace(/^[^\w]*/, '')}` : subject;
}

/* ═══════════════════════════════════════════════════════════════
   MLB DAILY BRIEFING SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function mlbBriefingSubject({ displayName, headlines = [], narrativeParagraph = '' } = {}) {
  /**
   * Extract punchy team-name hooks from headlines.
   * Looks for MLB team names mentioned and creates short editorial hooks.
   */
  const MLB_TEAM_HOOKS = [
    'Yankees', 'Dodgers', 'Mets', 'Red Sox', 'Braves', 'Astros', 'Phillies',
    'Padres', 'Cubs', 'Cardinals', 'Giants', 'Rangers', 'Orioles', 'Twins',
    'Mariners', 'Guardians', 'Tigers', 'Rays', 'Blue Jays', 'Brewers',
    'Diamondbacks', 'Reds', 'Royals', 'Angels', 'Marlins', 'Pirates',
    'Rockies', 'Nationals', 'White Sox', 'Athletics',
  ];

  function extractTeamMentions(text) {
    if (!text) return [];
    return MLB_TEAM_HOOKS.filter(team => text.toLowerCase().includes(team.toLowerCase()));
  }

  function shorten(title, max = 35) {
    if (!title) return null;
    if (title.length <= max) return title;
    const cut = title.lastIndexOf(' ', max);
    return title.slice(0, cut > 10 ? cut : max) + '\u2026';
  }

  // Extract teams from top headlines to build topical hooks
  const allTeams = headlines.slice(0, 6).flatMap(h => extractTeamMentions(h.title));
  const uniqueTeams = [...new Set(allTeams)].slice(0, 3);

  const hook1 = shorten(headlines[0]?.title);
  const hook2 = shorten(headlines[1]?.title, 28);

  const templates = [];

  // Team-driven topical subjects (highest priority)
  if (uniqueTeams.length >= 3) {
    templates.push(`\u26BE MLB Daily Briefing: ${uniqueTeams[0]} Spotlight, ${uniqueTeams[1]} Heat, ${uniqueTeams[2]} Watch`);
    templates.push(`\u26BE MLB Daily Briefing: ${uniqueTeams.join(', ')} Lead Today\u2019s Intel`);
  }
  if (uniqueTeams.length >= 2) {
    templates.push(`\u26BE MLB Daily Briefing: ${uniqueTeams[0]} & ${uniqueTeams[1]} Headlines, Division Heat`);
    templates.push(`\u26BE MLB Daily Briefing: ${uniqueTeams[0]} Watch, ${uniqueTeams[1]} Momentum`);
  }
  if (uniqueTeams.length >= 1) {
    templates.push(`\u26BE MLB Daily Briefing: ${uniqueTeams[0]} in Focus, Early Value Signals`);
  }

  // Headline-driven subjects
  if (hook1 && hook2) {
    templates.push(`\u26BE MLB Daily Briefing: ${hook1}`);
  } else if (hook1) {
    templates.push(`\u26BE MLB Daily Briefing: ${hook1}`);
  }

  // Date-contextual fallbacks
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  templates.push(`\u26BE MLB Daily Briefing: ${dayOfWeek}\u2019s Biggest Storylines`);
  templates.push(`\u26BE MLB Daily Briefing: Today\u2019s Division Watch & Value Edges`);

  return pick(templates, 'mlb_briefing');
}

/* ═══════════════════════════════════════════════════════════════
   MLB PICKS SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function mlbPicksSubject({ picksBoard } = {}) {
  const cats = picksBoard?.categories || {};
  const total = (cats.pickEms?.length || 0) + (cats.ats?.length || 0) + (cats.leans?.length || 0) + (cats.totals?.length || 0);
  const highCount = [...(cats.pickEms || []), ...(cats.ats || []), ...(cats.leans || []), ...(cats.totals || [])].filter(p => p.confidence === 'high').length;

  const templates = [];

  if (total > 0 && highCount > 0) {
    templates.push(`\u{1F9E0}\u26BE Your Daily Maximus\u2019s Picks Digest \u2014 ${total} Edges, ${highCount} High Conviction`);
    templates.push(`\u{1F9E0}\u26BE Your Daily Maximus\u2019s Picks Digest \u2014 ${total} Model-Backed MLB Edges`);
  }
  if (total > 0) {
    templates.push(`\u{1F9E0}\u26BE Your Daily Maximus\u2019s Picks Digest \u2014 ${total} Picks on the Board`);
  }

  templates.push(`\u{1F9E0}\u26BE Your Daily Maximus\u2019s Picks Digest`);

  return pick(templates, 'mlb_picks');
}

/* ═══════════════════════════════════════════════════════════════
   MLB TEAM DIGEST SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function mlbTeamDigestSubject({ displayName, teamDigests = [] } = {}) {
  // Use short mascot names for compact subjects
  const names = teamDigests.map(d => d.team?.name?.split(' ').pop()).filter(Boolean);

  if (names.length === 1) {
    return `\u26BE Your Daily MLB Team Digest \u2014 ${teamDigests[0].team.name}`;
  }
  if (names.length === 2) {
    return `\u26BE Your Daily MLB Team Digest \u2014 ${names[0]} + ${names[1]}`;
  }
  if (names.length > 2) {
    return `\u26BE Your Daily MLB Team Digest \u2014 ${names[0]}, ${names[1]} + ${names.length - 2} more`;
  }
  return `\u26BE Your Daily MLB Team Digest`;
}

/* ═══════════════════════════════════════════════════════════════
   TEAM DIGEST SUBJECTS (NCAAM)
   ═══════════════════════════════════════════════════════════════ */

export function teamDigestSubject({ displayName, teamDigests = [] } = {}) {
  const name = displayName ? displayName.split(' ')[0] : null;
  const first = teamDigests[0];
  const teamName = first?.team?.name || null;
  const mascot = teamName?.split(' ').pop() || null;

  const templates = [];
  if (teamName && teamDigests.length === 1) {
    templates.push(`🏀 ${teamName} intel: full digest inside`);
    templates.push(`📊 ${mascot} deep dive: form, ATS, and outlook`);
    templates.push(`🔥 Everything you need to know about ${teamName}`);
  } else if (teamName && teamDigests.length > 1) {
    templates.push(`🏀 ${mascot} + ${teamDigests.length - 1} more: full team digests`);
    templates.push(`📊 ${teamDigests.length} team digests ready`);
  }
  templates.push(`🏀 Your team digest is ready`);

  const subject = pick(templates, 'teamDigest');
  return name ? `${name}, ${subject.replace(/^[^\w]*/, '')}` : subject;
}
