/**
 * dailyIntelToIG.js
 *
 * READ-ONLY transformation layer: Daily Intel (Home Page) → IG Daily Briefing.
 *
 * The Home Page "Today's Intelligence Briefing" is the ONLY source of truth.
 * This module consumes its underlying data (via DailyBriefingDigest) and produces
 * an IGBriefingViewModel — a flat, slide-ready object for the hero visual and caption.
 *
 * Data mapping (explicit, no ambiguity):
 *   Intel headline          → slide headline
 *   Opening narrative (¶1)  → subheadline / deck line
 *   Key storylines (¶1–¶5)  → Today's Intel bullets
 *   Odds commentary (¶2)    → Title Leaderboard
 *   ATS insights (¶4)       → Highlight bullet
 *   Results (¶1 scores)     → Last Night section
 *   Voice line (¶5 closer)  → Caption closer
 *
 * This module NEVER modifies the original intel or digest.
 */

import { getTeamSlug } from './teamSlug.js';
import { getTeamEmoji } from './getTeamEmoji.js';

function teamEmoji(name) {
  if (!name) return '';
  const slug = getTeamSlug(name);
  try {
    const e = getTeamEmoji(slug, name);
    return e || '';
  } catch { return ''; }
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Headline generation ─────────────────────────────────────────────────────

const HEADLINE_VARIANTS = {
  actionPacked: [
    ['CHAOS ON', 'THE HARDWOOD'],
    ['ACTION-PACKED', 'NIGHT'],
    ['STATEMENT', 'WINS'],
  ],
  titleRace: [
    ['TITLE RACE', 'HEATING UP'],
    ['THE BOARD', 'IS MOVING'],
    ['ODDS', 'SHIFTING'],
  ],
  march: [
    ['MARCH', 'INTELLIGENCE'],
    ['MADNESS', 'IS HERE'],
    ['TOURNAMENT', 'WATCH'],
  ],
  default: [
    ['DAILY', 'BRIEFING'],
    ['INTEL', 'IS LIVE'],
    ['THE RUNDOWN', ''],
  ],
};

function pickHeadline(digest) {
  const seed = new Date().toISOString().slice(0, 10);
  const idx = hashStr(seed);

  if (digest.lastNightHighlights?.length >= 3) {
    const pool = HEADLINE_VARIANTS.actionPacked;
    return pool[idx % pool.length];
  }
  if (digest.titleRace?.length >= 3) {
    const pool = HEADLINE_VARIANTS.titleRace;
    return pool[idx % pool.length];
  }
  if (new Date().getMonth() === 2) {
    const pool = HEADLINE_VARIANTS.march;
    return pool[idx % pool.length];
  }
  const pool = HEADLINE_VARIANTS.default;
  return pool[idx % pool.length];
}

// ── Subheadline — first punchy line from the intel ──────────────────────────

function pickSubheadline(digest) {
  return (
    digest.recapLeadLine ||
    digest.titleMarketLead ||
    digest.leadNarrative?.slice(0, 120) ||
    'Your morning college basketball intelligence report.'
  );
}

// ── Intel bullets — editorial cross-section ─────────────────────────────────

function buildIntelBullets(digest) {
  const bullets = [];

  if (digest.titleRace?.length > 0) {
    const leader = digest.titleRace[0];
    const e = teamEmoji(leader.team);
    if (leader.team && leader.americanOdds) {
      bullets.push({
        icon: e || '🏆',
        text: `${leader.team} sits atop the title board at ${leader.americanOdds}`,
        section: 'odds',
      });
    }
  }

  if (digest.gamesToWatch?.length > 0) {
    const game = digest.gamesToWatch[0];
    const spreadNote = game.spread ? ` (${game.spread})` : '';
    bullets.push({
      icon: '🎯',
      text: `Radar game: ${game.matchup}${spreadNote}`,
      section: 'games',
    });
  }

  if (digest.newsIntel?.length > 0) {
    const news = digest.newsIntel[0];
    bullets.push({
      icon: '📰',
      text: news.headline,
      section: 'news',
    });
  }

  if (digest.atsEdges?.length > 0 && bullets.length < 4) {
    const top = digest.atsEdges[0];
    const e = teamEmoji(top.team);
    const wl = top.wl ? ` (${top.wl})` : '';
    bullets.push({
      icon: e || '📊',
      text: `${top.team} covering at ${top.atsRate}%${wl} ATS`,
      section: 'ats',
    });
  }

  if (bullets.length < 3 && digest.maximusSays?.length > 0) {
    for (const b of digest.maximusSays) {
      if (bullets.length >= 4) break;
      if (!bullets.some(x => x.text === b)) {
        bullets.push({ icon: '🏀', text: b, section: 'editorial' });
      }
    }
  }

  return bullets.slice(0, 4);
}

// ── Title Board — rank, team, slug, odds ────────────────────────────────────

function buildTitleBoard(digest) {
  return (digest.titleRace ?? []).slice(0, 5).map((t, i) => ({
    rank: i + 1,
    name: t.team,
    odds: t.americanOdds,
    slug: getTeamSlug(t.team),
    impliedProb: t.impliedProbability,
  }));
}

// ── Result classification + editorial verb ──────────────────────────────────

function classifyResult(highlight) {
  if (!highlight) return 'default';
  const scores = (highlight.score || '').split('-').map(Number);
  const margin = scores.length === 2 ? Math.abs(scores[0] - scores[1]) : null;
  const line = (highlight.summaryLine || '').toLowerCase();
  if (line.includes('upset') || line.includes('stunned')) return 'upset';
  if (margin != null && margin >= 15) return 'blowout';
  if (line.includes('cover') || line.includes('ats')) return 'cover';
  return 'default';
}

function pickVerb(margin, kind, seed) {
  if (kind === 'upset') return 'stunned';
  if (margin == null) return 'beat';
  if (margin >= 25) return 'demolished';
  if (margin >= 15) return 'rolled past';
  if (margin >= 8) return 'took care of';
  if (margin >= 4) return 'held off';
  return 'edged';
}

function buildResultLine(highlight) {
  if (!highlight?.teamA) return null;
  const { teamA, teamB, score } = highlight;
  const scores = score ? score.split('-').map(Number) : [];
  const margin = scores.length === 2 ? Math.abs(scores[0] - scores[1]) : null;
  const kind = classifyResult(highlight);
  const eA = teamEmoji(teamA);
  const verb = pickVerb(margin, kind, teamA + (teamB || ''));

  if (teamB && score) return { emoji: eA, text: `${teamA} ${verb} ${teamB}, ${score}`, kind };
  if (score) return { emoji: eA, text: `${teamA} wins ${score}`, kind };
  return { emoji: eA, text: teamA, kind };
}

// ── Recent results ──────────────────────────────────────────────────────────

function buildRecentResults(digest) {
  const results = (digest.lastNightHighlights ?? [])
    .slice(0, 3)
    .map(buildResultLine)
    .filter(Boolean);

  if (results.length < 2 && digest.atsEdges?.length > 0) {
    const top = digest.atsEdges[0];
    const e = teamEmoji(top.team);
    const wl = top.wl ? ` ${top.wl}` : '';
    results.push({
      emoji: e || '📊',
      text: `${top.team} stays hot ATS — covering at ${top.atsRate}%${wl}`,
      kind: 'ats',
    });
  }

  return results.slice(0, 3);
}

// ── Caption view model ──────────────────────────────────────────────────────

function buildCaptionVM(digest) {
  const hookLines = [];
  const bodyLines = [];

  const highlights = digest.lastNightHighlights ?? [];
  if (highlights.length >= 2) {
    hookLines.push('College hoops delivered last night. Here\u2019s the intel. \uD83D\uDD25');
    for (const h of highlights.slice(0, 3)) {
      const rl = buildResultLine(h);
      if (rl) bodyLines.push(`${rl.emoji ? rl.emoji + ' ' : ''}${rl.text}`);
    }
  } else if (digest.recapLeadLine) {
    hookLines.push(digest.recapLeadLine.slice(0, 120));
  } else {
    hookLines.push('Daily Briefing: the title race is heating up. \uD83C\uDFC0');
  }

  if (digest.titleRace?.length >= 2) {
    const top2 = digest.titleRace.slice(0, 2);
    bodyLines.push(`Title board: ${top2.map(t => `${t.team} (${t.americanOdds})`).join(', ')}.`);
  }

  if (digest.atsEdges?.length > 0) {
    const top = digest.atsEdges[0];
    const e = teamEmoji(top.team);
    bodyLines.push(`${e ? e + ' ' : ''}${top.team} cashing ATS at ${top.atsRate}%.`);
  }

  if (digest.gamesToWatch?.length > 0) {
    const game = digest.gamesToWatch[0];
    bodyLines.push(`On the radar: ${game.matchup}${game.spread ? ` (${game.spread})` : ''}.`);
  }

  const closer = digest.voiceLine || '';

  return { hookLines, bodyLines, closer };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} IGBriefingViewModel
 * @property {string[]} headline        - 1–2 line headline array (e.g. ["TITLE RACE", "HEATING UP"])
 * @property {string}   subheadline     - Deck line from intel opening
 * @property {Array<{icon:string, text:string, section:string}>} intelBullets
 * @property {Array<{rank:number, name:string, odds:string, slug:string, impliedProb:number}>} titleBoard
 * @property {Array<{emoji:string, text:string, kind:string}>} recentResults
 * @property {{hookLines:string[], bodyLines:string[], closer:string}} captionVM
 * @property {boolean}  hasChatContent
 */

/**
 * Transform a DailyBriefingDigest into a flat, slide-ready IGBriefingViewModel.
 *
 * This is a PURE READ-ONLY transformation. It never mutates the digest.
 *
 * @param {import('./chatbotDigest').DailyBriefingDigest} digest
 * @returns {IGBriefingViewModel}
 */
export function transformDigestToIG(digest) {
  if (!digest?.hasChatContent) {
    return {
      headline: ['DAILY', 'BRIEFING'],
      subheadline: 'Your morning intelligence report is live.',
      intelBullets: [{ icon: '🏀', text: 'Full briefing loading — check back shortly', section: 'loading' }],
      titleBoard: [],
      recentResults: [],
      captionVM: { hookLines: ['Daily Briefing is loading.'], bodyLines: [], closer: '' },
      hasChatContent: false,
    };
  }

  const headlineParts = pickHeadline(digest);

  return {
    headline: headlineParts.filter(Boolean),
    subheadline: pickSubheadline(digest),
    intelBullets: buildIntelBullets(digest),
    titleBoard: buildTitleBoard(digest),
    recentResults: buildRecentResults(digest),
    captionVM: buildCaptionVM(digest),
    hasChatContent: true,
  };
}
