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

export function mlbBriefingSubject({ displayName, headlines = [] } = {}) {
  const top1 = headlines[0]?.title;
  const top2 = headlines[1]?.title;

  // Extract short hooks from headlines
  function shorten(title, max = 30) {
    if (!title) return null;
    if (title.length <= max) return title;
    const cut = title.lastIndexOf(' ', max);
    return title.slice(0, cut > 10 ? cut : max);
  }

  const hook1 = shorten(top1);
  const hook2 = shorten(top2, 25);

  const templates = [];

  if (hook1 && hook2) {
    templates.push(`\u26BE MLB Daily Briefing: ${hook1}, ${hook2}`);
    templates.push(`\u26BE MLB Daily Briefing: ${hook1} \u{1F525}`);
  }
  if (hook1) {
    templates.push(`\u26BE MLB Daily Briefing: ${hook1}`);
    templates.push(`\u26BE ${hook1} \u2014 and more from around the league`);
  }

  templates.push(`\u26BE MLB Daily Briefing: The stories that move the needle`);
  templates.push(`\u26BE MLB Daily Briefing: What you need to know today`);
  templates.push(`\u26BE MLB Daily Briefing: Headlines, intel, and edges`);

  return pick(templates, 'mlb_briefing');
}

/* ═══════════════════════════════════════════════════════════════
   MLB PICKS SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function mlbPicksSubject({ displayName, atsLeaders = {}, scoresToday = [], oddsGames = [] } = {}) {
  const best = atsLeaders.best || [];
  const gameCount = oddsGames.length || scoresToday.length || 0;
  const topTeam = best[0];

  const templates = [];

  if (gameCount > 0) {
    templates.push(`\u26BE Maximus Picks: ${gameCount} High-Conviction Plays \u{1F4B0}`);
    templates.push(`\u26BE Maximus Picks: Today\u2019s edges across ${gameCount} games`);
  }
  if (topTeam) {
    templates.push(`\u26BE Maximus Picks: ${topTeam.name || topTeam.team} is covering everything \u{1F4B0}`);
    templates.push(`\u26BE ATS edge alert: ${topTeam.name || topTeam.team} leads today\u2019s board`);
  }

  templates.push(`\u26BE Maximus Picks: Model-driven MLB edges \u{1F4B0}`);
  templates.push(`\u26BE Maximus Picks: Where the value lives today`);
  templates.push(`\u26BE MLB ATS intel and today\u2019s sharpest edges`);

  return pick(templates, 'mlb_picks');
}

/* ═══════════════════════════════════════════════════════════════
   MLB TEAM DIGEST SUBJECTS
   ═══════════════════════════════════════════════════════════════ */

export function mlbTeamDigestSubject({ displayName, teamDigests = [] } = {}) {
  const first = teamDigests[0];
  const teamName = first?.team?.name || null;

  const templates = [];
  if (teamName && teamDigests.length === 1) {
    templates.push(`\u26BE Your Teams Today: ${teamName} full intel`);
    templates.push(`\u26BE ${teamName}: digest, trends, and outlook`);
  } else if (teamName && teamDigests.length > 1) {
    templates.push(`\u26BE Your Teams Today: ${teamName} + ${teamDigests.length - 1} more`);
    templates.push(`\u26BE ${teamDigests.length} team digests ready \u2014 full MLB intel`);
  }
  templates.push(`\u26BE Your Teams Today: MLB team digest is ready`);

  return pick(templates, 'mlb_team_digest');
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
