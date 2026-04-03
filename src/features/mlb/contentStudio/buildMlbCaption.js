/**
 * buildMlbCaption
 *
 * Generates Instagram captions for MLB Content Studio posts.
 * Captions mirror the actual 3-slide carousel content:
 *   Slide 1: Hero hook (headline, teams)
 *   Slide 2: Intel briefing (Hot Off The Press, Pennant Race, Maximus Picks)
 *   Slide 3: World Series Outlook (AL/NL projections)
 *
 * Data is pulled from the SAME sources as the slides — no drift.
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';

// ── Team emoji map ──────────────────────────────────────────────────────────

const TEAM_EMOJIS = {
  'Yankees': '🗽', 'Red Sox': '🧦', 'Blue Jays': '🐦', 'Rays': '⚡', 'Orioles': '🐦',
  'Guardians': '🛡️', 'Twins': '🔷', 'White Sox': '⬛', 'Royals': '👑', 'Tigers': '🐯',
  'Astros': '🚀', 'Rangers': '⭐', 'Mariners': '🧭', 'Athletics': '🐘', 'Angels': '😇',
  'Braves': '🪓', 'Mets': '🍎', 'Phillies': '🔔', 'Marlins': '🐟', 'Nationals': '🏛️',
  'Cubs': '🐻', 'Brewers': '🍺', 'Cardinals': '🐦', 'Pirates': '🏴‍☠️', 'Reds': '🔴',
  'Dodgers': '🔵', 'Diamondbacks': '🐍', 'Padres': '🟤', 'Giants': '🧡', 'Rockies': '🏔️',
};

function getTeamEmoji(teamName) {
  if (!teamName) return '⚾';
  for (const [key, emoji] of Object.entries(TEAM_EMOJIS)) {
    if (teamName.includes(key)) return emoji;
  }
  return '⚾';
}

// ── Caption builders per section ────────────────────────────────────────────

/**
 * Daily briefing caption — mirrors all 3 slides of the carousel.
 * Uses same data sources as MlbDailySlide1/2/3.
 */
function dailyCaption(payload) {
  const intel = payload.intelBriefing;
  const lines = [];

  // ── HOOK ──
  lines.push('⚾🔥 Today\'s MLB Daily Briefing is LIVE.\n');

  // ── SLIDE 1: Hero headline ──
  const headline = intel?.headline || payload.headline || 'MLB Daily Briefing';
  lines.push(headline);
  lines.push('');

  // ── SLIDE 2: Hot Off The Press (key news bullets) ──
  const bullets = (intel?.bullets || payload.bullets || []).slice(0, 4);
  if (bullets.length > 0) {
    lines.push('📰 Hot Off The Press:');
    for (const b of bullets) {
      lines.push(`• ${b}`);
    }
    lines.push('');
  }

  // ── SLIDE 2: Pennant Race (top projected teams from Season Intelligence) ──
  const topTeams = buildTopProjectedTeams(payload.seasonIntel);
  if (topTeams.length > 0) {
    lines.push('🏆 Pennant Race — Top Projected Teams:');
    for (const t of topTeams) {
      const emoji = getTeamEmoji(t.name);
      lines.push(`${emoji} ${t.abbrev}: ${t.projectedWins}W projected${t.signal ? ` — ${t.signal}` : ''}`);
    }
    lines.push('');
  }

  // ── SLIDE 2: Maximus's Picks (from actual picks board) ──
  const picks = buildPicksSummary(payload);
  if (picks.length > 0) {
    lines.push('🎯 Maximus\'s Picks:');
    for (const p of picks) {
      lines.push(`• ${p}`);
    }
    lines.push('');
  }

  // ── SLIDE 3: World Series Outlook (AL/NL leaders) ──
  const outlook = buildOutlookSummary(payload.seasonIntel);
  if (outlook) {
    lines.push('📊 World Series Outlook:');
    lines.push(outlook);
    lines.push('');
  }

  // ── CTA ──
  lines.push('Full intel + picks → maximussports.ai');

  // ── Hashtags (max 5) ──
  const hashtags = ['#MLB', '#Baseball', '#MaximusSports', '#MaximusPicks', '#BaseballIntel'];

  return { caption: lines.join('\n'), hashtags };
}

/**
 * Build top 4 projected teams from Season Intelligence data.
 * Same source as Slide 2 Pennant Race + Slide 3 board.
 */
function buildTopProjectedTeams(seasonIntel) {
  // If seasonIntel has al/nl arrays (from normalizeMlbImagePayload)
  if (seasonIntel?.al || seasonIntel?.nl) {
    const all = [...(seasonIntel.al || []), ...(seasonIntel.nl || [])];
    all.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
    return all.slice(0, 4).map(t => ({
      abbrev: t.abbrev,
      name: t.abbrev, // abbreviated for emoji lookup
      projectedWins: t.projectedWins,
      signal: t.signals?.[0] || null,
    }));
  }

  // Fallback: compute from Season Model directly
  const entries = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    entries.push({
      abbrev: team.abbrev,
      name: team.name,
      projectedWins: proj.projectedWins,
      signal: proj.signals?.[0] || null,
    });
  }
  entries.sort((a, b) => b.projectedWins - a.projectedWins);
  return entries.slice(0, 4);
}

/**
 * Build picks summary from actual picks data.
 * Same source as Slide 2 Maximus's Picks.
 */
function buildPicksSummary(payload) {
  const picks = [];
  const cats = payload.picks?.categories || payload.mlbPicks?.categories || {};
  const all = [
    ...(cats.pickEms || []).map(p => ({ ...p, cat: "Pick 'Em" })),
    ...(cats.ats || []).map(p => ({ ...p, cat: 'ATS' })),
    ...(cats.totals || []).map(p => ({ ...p, cat: 'O/U' })),
  ];
  all.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  for (const p of all.slice(0, 3)) {
    const label = p.pick?.label || '';
    const cat = p.cat || '';
    if (label) picks.push(`${cat}: ${label}`);
  }
  return picks;
}

/**
 * Build World Series Outlook summary line.
 * Same source as Slide 3 league board.
 */
function buildOutlookSummary(seasonIntel) {
  if (!seasonIntel?.al?.length && !seasonIntel?.nl?.length) {
    // Fallback from model
    const entries = [];
    for (const team of MLB_TEAMS) {
      const proj = getTeamProjection(team.slug);
      if (!proj || !proj.projectedWins) continue;
      entries.push({ abbrev: team.abbrev, projectedWins: proj.projectedWins, league: team.league });
    }
    entries.sort((a, b) => b.projectedWins - a.projectedWins);
    const alTop = entries.find(e => e.league === 'AL');
    const nlTop = entries.find(e => e.league === 'NL');
    if (alTop && nlTop) {
      return `AL: ${alTop.abbrev} (${alTop.projectedWins}W) | NL: ${nlTop.abbrev} (${nlTop.projectedWins}W)`;
    }
    return null;
  }

  const alTop = seasonIntel.al?.[0];
  const nlTop = seasonIntel.nl?.[0];
  const parts = [];
  if (alTop) parts.push(`AL: ${alTop.abbrev} (${alTop.projectedWins}W)`);
  if (nlTop) parts.push(`NL: ${nlTop.abbrev} (${nlTop.projectedWins}W)`);
  return parts.join(' | ') || null;
}

// ── Other section builders (unchanged) ──────────────────────────────────────

function teamCaption(payload) {
  const teamName = payload.teamA?.name || payload.headline || 'Team';
  const emoji = getTeamEmoji(teamName);
  const bullets = (payload.bullets || []).slice(0, 3);
  const lines = [];
  lines.push(`${emoji} ${teamName} Intel Report\n`);
  lines.push(payload.subhead || 'Full model-driven breakdown');
  lines.push('');
  if (bullets.length > 0) {
    lines.push('📊 Breakdown:');
    for (const b of bullets) lines.push(`• ${b}`);
    lines.push('');
  }
  lines.push('More → maximussports.ai');
  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', `#${teamName.replace(/\s+/g, '')}`, '#MaximusSports', '#BaseballIntel'],
  };
}

function gameCaption(payload) {
  const away = payload.teamA?.name || 'Away';
  const home = payload.teamB?.name || 'Home';
  const eA = getTeamEmoji(away);
  const eH = getTeamEmoji(home);
  const signals = payload.signals || [];
  const lines = [];
  lines.push(`${eA} ${away} at ${eH} ${home}\n`);
  lines.push(payload.subhead || 'Game preview and analysis');
  lines.push('');
  if (signals.length > 0) {
    lines.push('📐 Market snapshot:');
    for (const s of signals) lines.push(`• ${s}`);
    lines.push('');
  }
  lines.push('More → maximussports.ai');
  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', '#GamePreview', '#MaximusSports', '#MaximusPicks'],
  };
}

function picksCaption(payload) {
  const signals = payload.signals || [];
  const conf = payload.keyPick?.confidence;
  const lines = [];
  lines.push('⚾ Today\'s MLB picks board is LIVE.\n');
  lines.push(payload.headline || "Maximus's Picks");
  lines.push('');
  if (payload.keyPick) {
    const confLabel = conf === 'high' ? '🟢 HIGH' : conf === 'medium' ? '🟡 MEDIUM' : '⚪ LOW';
    lines.push(`🎯 Top play: ${payload.keyPick.label} (${confLabel})`);
    lines.push('');
  }
  if (signals.length > 0) {
    lines.push('📊 Board signals:');
    for (const s of signals) lines.push(`• ${s}`);
    lines.push('');
  }
  lines.push('More → maximussports.ai');
  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', '#SportsBetting', '#MaximusPicks', '#MaximusSports'],
  };
}

function genericCaption(payload) {
  const lines = [];
  lines.push(`⚾ ${payload.headline || 'MLB Intelligence'}\n`);
  if (payload.subhead) lines.push(payload.subhead);
  lines.push('');
  lines.push('More → maximussports.ai');
  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', '#MaximusSports'],
  };
}

// ── Main export ─────────────────────────────────────────────────────────────

const SECTION_BUILDERS = {
  'daily-briefing': dailyCaption,
  'team-intel': teamCaption,
  'league-intel': genericCaption,
  'division-intel': genericCaption,
  'game-insights': gameCaption,
  'maximus-picks': picksCaption,
};

/**
 * Build an MLB Instagram caption from a normalized payload.
 * @param {Object} payload - normalized MLB image payload
 * @returns {{ shortCaption: string, longCaption: string, hashtags: string[] }}
 */
export function buildMlbCaption(payload) {
  const builder = SECTION_BUILDERS[payload.section] || genericCaption;
  const result = builder(payload);
  return {
    shortCaption: result.caption,
    longCaption: result.caption + '\n\nFor entertainment only. Please bet responsibly. 21+',
    hashtags: result.hashtags,
  };
}
