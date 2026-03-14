/**
 * Team Digest data assembler.
 *
 * Builds the full data payload needed to render a Team Digest email
 * for one or more selected teams. Uses the same data pipelines as
 * the app's team page where possible.
 *
 * Exports:
 *  - buildSingleTeamDigest(slug, sharedData) — per-team digest data
 *  - assembleTeamDigestPayload(teamSlugs, sharedData) — multi-team array
 */

import { findTeamGame } from './teamSchedule.js';
import { dedupeNewsItems } from './newsDedupe.js';

/**
 * Filter and rank news items relevant to a given team.
 * Matches against team name words, slug segments, and common abbreviations.
 *
 * @param {{ name: string, slug: string }} team
 * @param {Array} allNews
 * @param {number} [max=5]
 * @returns {Array}
 */
export function filterTeamNews(team, allNews, max = 5) {
  if (!Array.isArray(allNews) || allNews.length === 0) return [];

  const name  = (team.name  || '').toLowerCase();
  const slug  = (team.slug  || '').toLowerCase();

  // Build a set of matching tokens
  const tokens = new Set();
  for (const word of name.split(/\s+/)) {
    if (word.length >= 3) tokens.add(word);
  }
  for (const part of slug.split('-')) {
    if (part.length >= 3) tokens.add(part);
  }

  const tokenArr = Array.from(tokens);

  const matched = allNews.filter(item => {
    const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
    return tokenArr.some(t => text.includes(t));
  });

  return matched.slice(0, max);
}

/**
 * Get AP ranking for a team from the rankings array.
 *
 * @param {{ name: string }} team
 * @param {Array} rankingsTop25
 * @returns {number|null}
 */
export function getTeamRank(team, rankingsTop25) {
  if (!Array.isArray(rankingsTop25) || !team) return null;
  const firstName = (team.name || '').split(' ')[0].toLowerCase();
  const match = rankingsTop25.find(r => {
    const rName = (r.teamName || r.name || '').toLowerCase();
    return rName.includes(firstName);
  });
  return match ? (match.rank ?? (rankingsTop25.indexOf(match) + 1)) : null;
}

/**
 * Get ATS info for a team from the ATS leaders data.
 *
 * @param {{ name: string }} team
 * @param {{ best: Array, worst: Array }} atsLeaders
 * @returns {{ pct: number|null, record: string|null, trend: 'hot'|'cold'|'neutral' } | null}
 */
export function getTeamAts(team, atsLeaders) {
  if (!team || !atsLeaders) return null;
  const firstName = (team.name || '').split(' ')[0].toLowerCase();

  const allAts = [...(atsLeaders.best || []), ...(atsLeaders.worst || [])];
  const match = allAts.find(a => {
    const aName = (a.name || a.team || '').toLowerCase();
    return aName.includes(firstName);
  });

  if (!match) return null;

  const inBest  = (atsLeaders.best  || []).includes(match);
  const inWorst = (atsLeaders.worst || []).includes(match);
  const trend   = inBest ? 'hot' : inWorst ? 'cold' : 'neutral';

  return {
    pct:    match.pct != null ? Math.round(match.pct * 100) : null,
    record: match.atsRecord || (match.atsW != null ? `${match.atsW}-${match.atsL}` : null),
    trend,
  };
}

/**
 * Build the digest data object for a single team.
 *
 * @param {{ name: string, slug: string, tier?: string }} team
 * @param {object} sharedData
 * @param {Array}  sharedData.scoresToday
 * @param {Array}  sharedData.rankingsTop25
 * @param {{ best: Array, worst: Array }} sharedData.atsLeaders
 * @param {Array}  sharedData.headlines
 * @param {Array}  [sharedData.videos]        — YouTube videos (pre-fetched, optional)
 * @param {object} [sharedData.teamSummaries] — keyed by slug, optional KV-fetched summaries
 * @returns {object} single team digest data
 */
export function buildSingleTeamDigest(team, sharedData = {}) {
  const {
    scoresToday    = [],
    rankingsTop25  = [],
    atsLeaders     = { best: [], worst: [] },
    headlines      = [],
    videos         = [],
    teamSummaries  = {},
  } = sharedData;

  const game      = findTeamGame(team, scoresToday);
  const rank      = getTeamRank(team, rankingsTop25);
  const ats       = getTeamAts(team, atsLeaders);
  const teamNews  = filterTeamNews(team, headlines, 5);
  const teamUrl   = `https://maximussports.ai/teams/${team.slug}`;
  const aiSummary = teamSummaries[team.slug] || null;

  // Filter videos to team-relevant content
  const teamNameWords = (team.name || '').toLowerCase().split(/\s+/).filter(w => w.length >= 4);
  const teamVideos = videos.filter(v => {
    const text = ((v.title || '') + ' ' + (v.channel || '') + ' ' + (v.snippet?.title || '')).toLowerCase();
    return teamNameWords.some(w => text.includes(w));
  }).slice(0, 4);

  // Generate a Maximus Insight blurb from available data
  let maximusInsight = aiSummary || null;
  if (!maximusInsight) {
    const parts = [];
    if (game) {
      const isHome = (game.homeTeam || '').toLowerCase().includes((team.name || '').split(' ')[0].toLowerCase());
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      const status = (game.gameStatus || '').toLowerCase();
      if (status === 'final' || status === 'completed') {
        const homeScore = game.homeScore ?? game.homeTeamScore ?? '';
        const awayScore = game.awayScore ?? game.awayTeamScore ?? '';
        if (homeScore && awayScore) {
          const teamScore = isHome ? homeScore : awayScore;
          const oppScore = isHome ? awayScore : homeScore;
          const won = Number(teamScore) > Number(oppScore);
          parts.push(`${team.name.split(' ')[0]} ${won ? 'defeated' : 'fell to'} ${opponent || 'opponent'} ${teamScore}\u2013${oppScore}.`);
        }
      } else if (opponent) {
        parts.push(`Next up: ${team.name.split(' ')[0]} vs ${opponent}.`);
      }
    }
    if (ats) {
      if (ats.trend === 'hot' && ats.pct != null) {
        parts.push(`Covering at a ${ats.pct}% rate${ats.record ? ` (${ats.record} ATS)` : ''} \u2014 one of the hottest ATS trends right now.`);
      } else if (ats.trend === 'cold' && ats.pct != null) {
        parts.push(`Just ${ats.pct}% ATS cover rate${ats.record ? ` (${ats.record})` : ''} \u2014 fading sharps are watching.`);
      } else if (ats.record) {
        parts.push(`Season ATS record: ${ats.record}.`);
      }
    }
    if (rank) {
      parts.push(`Ranked #${rank} in the AP poll.`);
    }
    if (parts.length > 0) {
      maximusInsight = parts.join(' ');
    }
  }

  return {
    team,
    game,
    rank,
    ats,
    teamNews,
    teamVideos,
    teamUrl,
    aiSummary,
    maximusInsight,
  };
}

/**
 * Assemble the full Team Digest payload for multiple teams.
 * Used by the email runner and preview endpoint.
 *
 * @param {string[]} teamSlugs    - slugs for selected teams
 * @param {object}   sharedData   - same shape as buildSingleTeamDigest sharedData
 * @param {Function} getTeamBySlug - lookup function from data/teams.js
 * @returns {Array} array of single-team digest objects
 */
export function assembleTeamDigestPayload(teamSlugs, sharedData, getTeamBySlug) {
  if (!Array.isArray(teamSlugs) || teamSlugs.length === 0) return [];

  return teamSlugs
    .map(slug => {
      const teamData = getTeamBySlug(slug);
      if (!teamData) return null;
      const team = { name: teamData.name, slug: teamData.slug, tier: teamData.oddsTier || null };
      return buildSingleTeamDigest(team, sharedData);
    })
    .filter(Boolean);
}

/** Max teams in one digest before we truncate and add a "see more" note */
export const TEAM_DIGEST_MAX_TEAMS = 4;
