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
import { buildMlbDailyHeadline, buildMlbHotPress } from './buildMlbDailyHeadline';
import { buildMlbTeamIntelBriefing, extractTeamContext } from '../../../data/mlb/buildTeamIntelBriefing';
import { buildLeagueWhyItMatters } from '../../../data/mlb/whyItMatters';

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

// ── Day-of-year seed ────────────────────────────────────────────────────────

function dayOfYear() {
  return Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
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
  const doy = dayOfYear();
  const parts = [];

  // ── Pull the same data the slides use ──
  const dynamicHL = buildMlbDailyHeadline({
    liveGames: payload.mlbLiveGames || [],
    briefing: payload.mlbBriefing || null,
    seasonIntel: null,
  });
  const hotPress = buildMlbHotPress({
    liveGames: payload.mlbLiveGames || [],
    briefing: payload.mlbBriefing || null,
    allStandings: payload.mlbStandings || null,
  });

  // ── 1. OPENER — emoji-led, premium, energetic ──
  parts.push('⚾ Your Daily MLB Intel Briefing is here.');
  parts.push('');

  // ── 2. TOP STORY — from the headline engine ──
  const topBullet = hotPress[0]?.text;
  const topEmoji = hotPress[0]?.logoSlug ? teamEmoji(nameFromSlug(hotPress[0].logoSlug)) : '🚨';
  if (topBullet) {
    parts.push(`${topEmoji} ${topBullet}`);
  } else if (dynamicHL.subhead) {
    parts.push(`🚨 ${dynamicHL.subhead}`);
  }
  parts.push('');

  // ── 3. SECOND STORY ──
  const secondBullet = hotPress[1]?.text;
  const secondEmoji = hotPress[1]?.logoSlug ? teamEmoji(nameFromSlug(hotPress[1].logoSlug)) : '🔥';
  if (secondBullet) {
    parts.push(`${secondEmoji} ${secondBullet}`);
    parts.push('');
  }

  // ── 4. TRANSITION — standings-aware "why it matters" ──
  const standingsContext = hotPress[2]?.text;
  if (standingsContext && standingsContext.length > 30) {
    // Use the standings-enriched HOTP bullet as the transition
    parts.push(`📊 ${standingsContext}`);
  } else {
    const transitions = [
      'And just like that — the board is already shifting. 👀',
      'The early signals are loud. The model is reacting. 📡',
      'Results like these ripple across the standings. 📊',
    ];
    parts.push(transitions[doy % transitions.length]);
  }
  parts.push('');

  // ── 5. MODEL SIGNALS — projected wins leaders ──
  const topTeams = getTopTeams(payload.seasonIntel, 4);
  if (topTeams.length > 0) {
    parts.push('📈 Model signals — projected wins leaders:');
    for (const t of topTeams) {
      const e = teamEmoji(t.name || t.abbrev);
      parts.push(`${e} ${t.abbrev} — ${t.projectedWins} wins`);
    }
    parts.push('');
  }

  // ── 6. PENNANT RACE IMPLICATION ──
  const outlookLine = buildOutlookNarrative(payload.seasonIntel);
  if (outlookLine) {
    parts.push(`🏆 ${outlookLine}`);
    parts.push('');
  }

  // ── 7. ADDITIONAL CONTEXT (from HOTP bullet 4) ──
  const contextBullet = hotPress[3]?.text;
  if (contextBullet) {
    parts.push(`🔎 ${contextBullet}`);
    parts.push('');
  }

  // ── 8. CTA — closing punch ──
  const ctas = [
    'The board moves daily. Stay ahead of it → maximussports.ai 🔥',
    'Tomorrow brings more edges. Stay locked in → maximussports.ai ⚾',
    'The model never sleeps. Neither should your edge → maximussports.ai 🧠',
  ];
  parts.push(ctas[(doy + 1) % ctas.length]);

  // ── 9. HASHTAGS — content-aware, story-specific ──
  const hashtags = buildDailyHashtags(hotPress, topTeams);

  return { caption: parts.join('\n'), hashtags };
}

// ── Slug → team name helper ────────────────────────────────────────────────

function nameFromSlug(slug) {
  if (!slug) return '';
  const team = MLB_TEAMS.find(t => t.slug === slug);
  return team?.name || slug;
}

// ── Dynamic hashtag builder ────────────────────────────────────────────────

function buildDailyHashtags(hotPress, topTeams) {
  const tags = new Set();

  // Always include the core MLB analysis tag
  tags.add('#MLB');
  tags.add('#MLBPredictions');

  // Add team-specific hashtags from top stories
  for (const b of hotPress.slice(0, 2)) {
    if (b?.logoSlug) {
      const team = MLB_TEAMS.find(t => t.slug === b.logoSlug);
      if (team?.name) {
        tags.add(`#${team.name.replace(/\s+/g, '')}`);
      }
    }
  }

  // Add top projected team if not already present
  if (topTeams.length > 0) {
    const topName = topTeams[0].name || topTeams[0].abbrev;
    if (topName) tags.add(`#${topName.replace(/\s+/g, '')}`);
  }

  // Fill to 5 with strong category tags
  const fillers = ['#BaseballAnalytics', '#MLBStandings', '#SportsBetting', '#BaseballIntel', '#MLBModel'];
  for (const f of fillers) {
    if (tags.size >= 5) break;
    tags.add(f);
  }

  return [...tags].slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════
//  OTHER SECTION BUILDERS (team, game, picks, generic)
// ═══════════════════════════════════════════════════════════════════════════

function teamCaption(payload) {
  const teamName = payload.teamA?.name || payload.headline || 'Team';
  const emoji = teamEmoji(teamName);
  const slug = payload.teamA?.slug || null;
  const lines = [];

  // ── Build shared briefing for alignment with slide + team page ──
  const liveGames = payload.mlbLiveGames || [];
  const teamContext = extractTeamContext(liveGames, slug);
  const projection = slug ? getTeamProjection(slug) : (payload.projection || null);
  const team = slug ? MLB_TEAMS.find(t => t.slug === slug) : null;

  const record = payload.record || null;

  const standings = payload.mlbStandings?.[slug] || null;

  const briefing = buildMlbTeamIntelBriefing({
    slug,
    teamName,
    division: team?.division || payload.division || '',
    record,
    projection,
    teamContext,
    newsHeadlines: payload.newsHeadlines || [],
    nextLine: payload.nextLine ?? null,
    standings,
  });

  // Build record + L10 summary for caption context
  const recordL10Parts = [];
  if (record) recordL10Parts.push(record);
  if (teamContext.l10Record) recordL10Parts.push(`L10: ${teamContext.l10Record}`);
  const recordSummary = recordL10Parts.length > 0 ? recordL10Parts.join(' · ') : null;

  // Opener — editorial identity with headline thesis
  lines.push(`${emoji} ${teamName} — Team Intel Report`);
  lines.push('');

  // Headline from shared engine
  if (briefing.headline) {
    lines.push(briefing.headline.replace(/\n/g, ' '));
    lines.push('');
  } else if (payload.subhead) {
    lines.push(payload.subhead);
    lines.push('');
  }

  // Subtext hook
  if (briefing.subtext) {
    lines.push(briefing.subtext);
    lines.push('');
  }

  // "Why it matters" — standings-aware context from shared engine
  const topWhy = briefing.whyItMatters?.top;
  if (topWhy && topWhy.priority >= 70 && topWhy.long) {
    lines.push(`⚡ ${topWhy.long}`);
    lines.push('');
  }

  // Record + L10 context
  if (recordSummary) {
    lines.push(`📊 ${recordSummary}`);
    lines.push('');
  }

  // Projection context
  if (projection?.projectedWins) {
    const parts = [`📈 ${projection.projectedWins} projected wins`];
    if (projection.floor && projection.ceiling) {
      parts[0] += ` (${projection.floor}\u2013${projection.ceiling} range)`;
    }
    if (projection.marketDelta != null && Math.abs(projection.marketDelta) >= 1.5) {
      const dir = projection.marketDelta > 0 ? 'above' : 'below';
      parts.push(`📐 ${Math.abs(projection.marketDelta).toFixed(1)} wins ${dir} market consensus`);
    }
    lines.push(parts.join('\n'));
    lines.push('');
  }

  // Full Team Intel Briefing — shared bullets, mirrors slide + team page
  if (briefing.items.length > 0) {
    lines.push('🔎 Team Intel Briefing:');
    for (let i = 0; i < briefing.items.length; i++) {
      lines.push(`${i + 1}. ${briefing.items[i].text}`);
    }
    lines.push('');
  }

  // CTA
  lines.push('Full breakdown → maximussports.ai');

  const teamTag = teamName.replace(/\s+/g, '');
  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', `#${teamTag}`, '#BaseballIntel', '#MaximusSports'],
  };
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
  // Daily briefing: short and long are identical (unified caption)
  const isDailyBriefing = payload.section === 'daily-briefing';
  const fullCaption = isDailyBriefing
    ? result.caption
    : result.caption + '\n\nFor entertainment only. Please bet responsibly. 21+';
  return {
    shortCaption: fullCaption,
    longCaption: fullCaption,
    hashtags: result.hashtags,
  };
}
