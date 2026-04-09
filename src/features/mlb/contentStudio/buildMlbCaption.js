/**
 * buildMlbCaption — Instagram caption generator for MLB Content Studio.
 *
 * Produces social-native, editorial captions that mirror all 3 carousel slides.
 * Voice: ESPN × The Athletic × premium startup brand.
 * Data: same sources as MlbDailySlide1/2/3 — zero drift.
 *
 * Structure: identity opener → hero story → board/picks → outlook → CTA
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { buildMlbDailyHeadline } from './buildMlbDailyHeadline';

// ── Team emojis ─────────────────────────────────────────────────────────────

const TEAM_EMOJIS = {
  'Yankees': '🗽', 'Red Sox': '🧦', 'Blue Jays': '🐦', 'Rays': '⚡', 'Orioles': '🐦',
  'Guardians': '🛡️', 'Twins': '🔷', 'White Sox': '⬛', 'Royals': '👑', 'Tigers': '🐯',
  'Astros': '🚀', 'Rangers': '⭐', 'Mariners': '🧭', 'Athletics': '🐘', 'Angels': '😇',
  'Braves': '🪓', 'Mets': '🍎', 'Phillies': '🔔', 'Marlins': '🐟', 'Nationals': '🏛️',
  'Cubs': '🐻', 'Brewers': '🍺', 'Cardinals': '🐦', 'Pirates': '🏴‍☠️', 'Reds': '🔴',
  'Dodgers': '💙', 'Diamondbacks': '🐍', 'Padres': '🟤', 'Giants': '🧡', 'Rockies': '🏔️',
};

function teamEmoji(name) {
  if (!name) return '⚾';
  for (const [k, e] of Object.entries(TEAM_EMOJIS)) {
    if (name.includes(k)) return e;
  }
  return '⚾';
}

// ── Rotating brand openers ──────────────────────────────────────────────────

const OPENERS = [
  '🔥 When the stars show up… the board moves ⚾',
  '⚾🔥 The edges show up before the standings do.',
  '🔥 Early in the season, the signals are already loud ⚾',
  '⚾ When the model and the market align, you pay attention 🔥',
  '🔥 Stars. Signals. Edges. The board is live ⚾',
];

function pickOpener(seed) {
  // Deterministic-ish rotation based on day of year
  const dayOfYear = seed || Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return OPENERS[dayOfYear % OPENERS.length];
}

// ── Rotating CTAs ───────────────────────────────────────────────────────────

const CTAS = [
  'Stay locked in. More edges daily 🔥',
  'This board is forming fast. More tomorrow.',
  "We're just getting started. More intel daily ⚾",
  'The season moves fast. Stay ahead → maximussports.ai',
  'Full board + daily picks → maximussports.ai',
];

function pickCTA(seed) {
  const dayOfYear = seed || Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return CTAS[(dayOfYear + 2) % CTAS.length]; // offset from opener
}

// ── Helper: extract player/team stories from headline ───────────────────────

const PLAYER_TEAM_MAP = {
  'fernandez': { last: 'Fernandez', team: 'D-Backs', emoji: '🐍' },
  'ohtani': { last: 'Ohtani', team: 'Dodgers', emoji: '💙' },
  'judge': { last: 'Judge', team: 'Yankees', emoji: '🗽' },
  'soto': { last: 'Soto', team: 'Yankees', emoji: '🗽' },
  'betts': { last: 'Betts', team: 'Dodgers', emoji: '💙' },
  'acuna': { last: 'Acuña', team: 'Braves', emoji: '🪓' },
  'trout': { last: 'Trout', team: 'Angels', emoji: '😇' },
  'cole': { last: 'Cole', team: 'Yankees', emoji: '🗽' },
  'painter': { last: 'Painter', team: 'Phillies', emoji: '🔔' },
  'stanton': { last: 'Stanton', team: 'Yankees', emoji: '🗽' },
  'adames': { last: 'Adames', team: 'Giants', emoji: '🧡' },
  'verlander': { last: 'Verlander', team: 'Astros', emoji: '🚀' },
};

function extractHeroStories(briefingText) {
  if (!briefingText) return [];
  const lower = briefingText.toLowerCase();
  const found = [];
  for (const [key, info] of Object.entries(PLAYER_TEAM_MAP)) {
    if (lower.includes(key)) found.push(info);
  }
  return found.slice(0, 2);
}

// ── Helper: build hero summary (Slide 1) ────────────────────────────────────

/** Strip section labels like "¶1 AROUND THE LEAGUE:" from raw briefing text */
function cleanBriefingText(text) {
  if (!text) return '';
  return text.replace(/^[¶#§]\d*\s*/i, '').replace(/^[A-Z][A-Z\s&+\-:]*[A-Z]\s*[:—–-]\s*/i, '').trim();
}

function buildHeroSummary(intel) {
  const headline = intel?.headline || '';
  const rawP1 = cleanBriefingText(intel?.rawParagraphs?.[0] || '');
  const stories = extractHeroStories(headline + ' ' + rawP1);

  if (stories.length >= 2) {
    return `${stories[0].emoji} ${stories[0].team}' ${stories[0].last} breaks out in a BIG way.\n${stories[1].emoji} ${stories[1].last} sets the tone early for ${stories[1].team}.`;
  }
  if (stories.length === 1) {
    return `${stories[0].emoji} ${stories[0].team}' ${stories[0].last} makes a statement on Opening Day.`;
  }
  // Fallback: use headline directly but clean it up
  if (headline && headline.length > 20) {
    return headline;
  }
  return 'The 2026 season is already delivering.';
}

// ── Helper: build board + pennant summary (Slide 2) ─────────────────────────

function buildBoardSummary(seasonIntel) {
  const teams = getTopTeams(seasonIntel, 4);
  if (teams.length === 0) return null;

  const lines = [];
  for (const t of teams) {
    const e = teamEmoji(t.name || t.abbrev);
    lines.push(`${e} ${t.abbrev} — Projected wins: ${t.projectedWins}`);
  }
  return lines.join('\n');
}

// ── Helper: build picks summary (Slide 2) ───────────────────────────────────

function buildPicksLine(payload) {
  const cats = payload.picks?.categories || payload.mlbPicks?.categories || {};
  const all = [
    ...(cats.pickEms || []).map(p => ({ ...p, cat: 'ML' })),
    ...(cats.ats || []).map(p => ({ ...p, cat: 'ATS' })),
    ...(cats.totals || []).map(p => ({ ...p, cat: 'O/U' })),
  ];
  all.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  const labels = all.slice(0, 3).map(p => p.pick?.label || '').filter(Boolean);
  if (labels.length === 0) return null;
  return labels.join(', ');
}

// ── Helper: build outlook summary (Slide 3) ─────────────────────────────────

function buildOutlookNarrative(seasonIntel) {
  const alTeams = getTopTeams(seasonIntel, 5, 'AL');
  const nlTeams = getTopTeams(seasonIntel, 5, 'NL');

  const nlTop = nlTeams[0];
  const alTop = alTeams[0];
  const alSecond = alTeams[1];

  if (!nlTop && !alTop) return null;

  const parts = [];
  if (nlTop) {
    const e = teamEmoji(nlTop.name || nlTop.abbrev);
    parts.push(`${e} ${nlTop.abbrev} leads the NL`);
  }
  if (alTop && alSecond) {
    const e1 = teamEmoji(alTop.name || alTop.abbrev);
    const e2 = teamEmoji(alSecond.name || alSecond.abbrev);
    parts.push(`${e1} ${alTop.abbrev} and ${e2} ${alSecond.abbrev} pace the AL`);
  } else if (alTop) {
    const e = teamEmoji(alTop.name || alTop.abbrev);
    parts.push(`${e} ${alTop.abbrev} paces the AL`);
  }

  return parts.join(', while ') + '.';
}

// ── Shared: get top teams from Season Intelligence or model ─────────────────

function getTopTeams(seasonIntel, count = 4, leagueFilter = null) {
  let pool = [];

  if (seasonIntel?.al || seasonIntel?.nl) {
    pool = [...(seasonIntel.al || []), ...(seasonIntel.nl || [])];
  } else {
    for (const team of MLB_TEAMS) {
      const proj = getTeamProjection(team.slug);
      if (!proj || !proj.projectedWins) continue;
      pool.push({
        abbrev: team.abbrev, name: team.name, league: team.league,
        projectedWins: proj.projectedWins, signals: proj.signals ?? [],
      });
    }
  }

  if (leagueFilter) {
    pool = pool.filter(t => t.league === leagueFilter);
  }
  pool.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  return pool.slice(0, count);
}

// ═══════════════════════════════════════════════════════════════════════════
//  DAILY BRIEFING CAPTION — social-native, editorial, mirrors all 3 slides
// ═══════════════════════════════════════════════════════════════════════════

function dailyCaption(payload) {
  const intel = payload.intelBriefing;
  const parts = [];

  // ── 1. SIGNATURE OPENER ──
  parts.push(pickOpener());
  parts.push('');

  // ── 2. SLIDE 1: Hero storyline (dynamic from live games + briefing) ──
  const dynamicHL = buildMlbDailyHeadline({
    liveGames: payload.mlbLiveGames || [],
    briefing: payload.mlbBriefing || null,
    seasonIntel: null,
  });
  const heroSummary = dynamicHL.subhead || buildHeroSummary(intel);
  parts.push(heroSummary);
  parts.push('');

  // Transition line
  parts.push('And just like that, the 2026 board is already taking shape.');
  parts.push('');

  // ── 3. SLIDE 2: Board + Race ──
  const boardSummary = buildBoardSummary(payload.seasonIntel);
  if (boardSummary) {
    parts.push('📊 Early model signals:');
    parts.push(boardSummary);
    parts.push('');
  }

  // ── 3b. SLIDE 2: Picks ──
  const picksLine = buildPicksLine(payload);
  if (picksLine) {
    parts.push(`💰 Maximus likes ${picksLine}.`);
    parts.push('Edges are showing early.');
    parts.push('');
  }

  // ── 4. SLIDE 3: World Series Outlook ──
  const outlookLine = buildOutlookNarrative(payload.seasonIntel);
  if (outlookLine) {
    parts.push(`🏆 ${outlookLine}`);
    parts.push('');
  }

  // ── 5. CTA ──
  parts.push(pickCTA());

  // ── 6. Hashtags ──
  const hashtags = ['#MLB', '#Baseball', '#SportsBetting', '#MLBPredictions', '#MaximusPicks'];

  return { caption: parts.join('\n'), hashtags };
}

// ═══════════════════════════════════════════════════════════════════════════
//  OTHER SECTION BUILDERS (team, game, picks, generic)
// ═══════════════════════════════════════════════════════════════════════════

function teamCaption(payload) {
  const teamName = payload.teamA?.name || payload.headline || 'Team';
  const emoji = teamEmoji(teamName);
  const bullets = (payload.bullets || []).slice(0, 3);
  const lines = [`${emoji} ${teamName} Intel Report\n`, payload.subhead || 'Full model-driven breakdown', ''];
  if (bullets.length > 0) {
    lines.push('📊 Breakdown:');
    for (const b of bullets) lines.push(`• ${b}`);
    lines.push('');
  }
  lines.push('More → maximussports.ai');
  return { caption: lines.join('\n'), hashtags: ['#MLB', '#Baseball', `#${teamName.replace(/\s+/g, '')}`, '#MaximusSports', '#BaseballIntel'] };
}

function gameCaption(payload) {
  const away = payload.teamA?.name || 'Away';
  const home = payload.teamB?.name || 'Home';
  const signals = payload.signals || [];
  const lines = [`${teamEmoji(away)} ${away} at ${teamEmoji(home)} ${home}\n`, payload.subhead || 'Game preview and analysis', ''];
  if (signals.length > 0) { lines.push('📐 Market snapshot:'); for (const s of signals) lines.push(`• ${s}`); lines.push(''); }
  lines.push('More → maximussports.ai');
  return { caption: lines.join('\n'), hashtags: ['#MLB', '#Baseball', '#GamePreview', '#MaximusSports', '#MaximusPicks'] };
}

function picksCaption(payload) {
  const conf = payload.keyPick?.confidence;
  const lines = ['⚾ Today\'s MLB picks board is LIVE.\n', payload.headline || "Maximus's Picks", ''];
  if (payload.keyPick) {
    const cl = conf === 'high' ? '🟢 HIGH' : conf === 'medium' ? '🟡 MEDIUM' : '⚪ LOW';
    lines.push(`🎯 Top play: ${payload.keyPick.label} (${cl})\n`);
  }
  const signals = payload.signals || [];
  if (signals.length > 0) { lines.push('📊 Board signals:'); for (const s of signals) lines.push(`• ${s}`); lines.push(''); }
  lines.push('More → maximussports.ai');
  return { caption: lines.join('\n'), hashtags: ['#MLB', '#Baseball', '#SportsBetting', '#MaximusPicks', '#MaximusSports'] };
}

function genericCaption(payload) {
  const lines = [`⚾ ${payload.headline || 'MLB Intelligence'}\n`];
  if (payload.subhead) lines.push(payload.subhead);
  lines.push('', 'More → maximussports.ai');
  return { caption: lines.join('\n'), hashtags: ['#MLB', '#Baseball', '#MaximusSports'] };
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

export function buildMlbCaption(payload) {
  const builder = SECTION_BUILDERS[payload.section] || genericCaption;
  const result = builder(payload);
  return {
    shortCaption: result.caption,
    longCaption: result.caption + '\n\nFor entertainment only. Please bet responsibly. 21+',
    hashtags: result.hashtags,
  };
}
