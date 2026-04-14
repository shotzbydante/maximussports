/**
 * buildMlbCaption — Instagram caption generator for MLB Content Studio.
 *
 * Produces social-native, editorial captions that mirror all 3 carousel slides.
 * Voice: ESPN × The Athletic × premium startup brand.
 * Data: same sources as MlbDailySlide1/2/3 — zero drift.
 *
 * Structure: identity opener → hero story → board/picks → outlook → CTA
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams.js';
import { getTeamProjection } from '../../../data/mlb/seasonModel.js';
import { LEADER_CATEGORIES } from '../../../data/mlb/seasonLeaders.js';
import { resolvePicks, resolveLeaders } from '../../../data/mlb/resolveSlideData.js';
import { buildMlbDailyHeadline, buildMlbHotPress } from './buildMlbDailyHeadline.js';
import { buildMlbTeamIntelBriefing, extractTeamContext } from '../../../data/mlb/buildTeamIntelBriefing.js';
import { buildLeagueWhyItMatters } from '../../../data/mlb/whyItMatters.js';

// ── Resolve nickname (handles multi-word names like "White Sox") ────────────

function resolveNick(fullName) {
  if (!fullName) return '???';
  if (/White Sox$/i.test(fullName)) return 'White Sox';
  if (/Red Sox$/i.test(fullName)) return 'Red Sox';
  if (/Blue Jays$/i.test(fullName)) return 'Blue Jays';
  return fullName.split(' ').pop();
}

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
  const parts = [];

  // ── Pull the SAME data objects the slides use — zero drift ──
  const dynamicHL = buildMlbDailyHeadline({
    liveGames: payload.mlbLiveGames || [],
    briefing: payload.mlbBriefing || null,
    seasonIntel: null,
    allStandings: payload.mlbStandings || null,
  });
  const hotPress = buildMlbHotPress({
    liveGames: payload.mlbLiveGames || [],
    briefing: payload.mlbBriefing || null,
    allStandings: payload.mlbStandings || null,
  });
  const usedBullets = hotPress.filter(b => b?.text);

  // ── 1. OPENER — locked identity line ──
  parts.push('⚾ Your Daily MLB Intel Briefing is here.');
  parts.push('');

  // ── 2. HERO HEADLINE — from Slide 1 #1 story ──
  if (dynamicHL.heroTitle) {
    parts.push(`🔥 ${dynamicHL.heroTitle}`);
    parts.push('');
  }

  // ── 3. WHAT HAPPENED — HOTP bullets (Slide 2), MANDATORY ──
  parts.push('📊 What happened:');
  if (usedBullets.length > 0) {
    for (const b of usedBullets.slice(0, 4)) {
      parts.push(`• ${b.text}`);
    }
  } else {
    parts.push('• Full results and analysis inside.');
  }
  parts.push('');

  // ── 4. WHY IT MATTERS — real insight from signal engine, NOT score recap ──
  // Uses the same signal objects attached to topStory/secondStory by
  // buildGameWhyItMatters() — the identical engine the slides consume.
  parts.push('📈 Why it matters:');
  const topSignal = dynamicHL.topStory?.signal;
  const secondSignal = dynamicHL.secondStory?.signal;

  if (topSignal?.long) {
    // Primary insight — standings implications, momentum, race context
    parts.push(topSignal.long);
    // Layer in second insight if it's high-priority and different type
    if (secondSignal?.long && secondSignal.priority >= 70 && secondSignal.type !== topSignal.type) {
      parts.push(secondSignal.long);
    }
  } else if (dynamicHL.topStory) {
    // Signal engine returned null → build contextual insight from game type
    const story = dynamicHL.topStory;
    const winName = nameFromSlug(story.winSlug);
    const loseName = nameFromSlug(story.loseSlug);
    if (story.type === 'shutout') {
      parts.push(`A shutout reinforces elite pitching depth. ${winName} blank ${loseName} — the kind of dominance that defines October contenders.`);
    } else if (story.type === 'blowout') {
      parts.push(`A statement win. ${winName} send a message with a ${story.margin}-run margin — this kind of offensive explosion shifts momentum.`);
    } else if (story.isUpset) {
      parts.push(`An upset that tightens the race. ${loseName} stumble against a team they should beat — the rest of the division gains ground.`);
    } else if (story.isDivisionRival) {
      parts.push(`A divisional result with real standings weight. Every head-to-head in this race carries double implications.`);
    } else if (story.isContender) {
      parts.push(`Contenders banking wins against the field is how you build separation. ${winName} protect their position.`);
    } else {
      parts.push(`Results across the league shape the standings picture. Every win and loss moves the needle this deep into the season.`);
    }
  } else {
    parts.push('Today\'s results will shift the standings picture across both leagues.');
  }
  parts.push('');

  // ── 5. MAXIMUS'S PICKS — from canonical resolver (SAME as Slides 1/2) ──
  // resolvePicks() is the SINGLE function used by Slide 1, Slide 2, and caption.
  // If slides show picks, caption shows picks. No divergence possible.
  const resolvedPicks = resolvePicks(payload, 3, false);

  parts.push('🎯 Maximus\'s Picks:');
  if (resolvedPicks.length > 0) {
    for (const p of resolvedPicks) {
      parts.push(`▸ ${p.matchup}: ${p.selection} (${p.conviction})`);
    }
  } else {
    parts.push('▸ No games on today\'s slate — picks return tomorrow.');
  }
  parts.push('');

  // ── 6. SEASON LEADERS — from canonical resolver (SAME as Slide 2) ──
  // resolveLeaders() is the SINGLE function used by Slide 2 and caption.
  // Uses LEADER_CATEGORIES keys (homeRuns, RBIs, hits, wins, saves).
  const resolvedLeaders = resolveLeaders(payload, 1);

  parts.push('🏆 League Leaders:');
  if (resolvedLeaders.length > 0) {
    for (const cat of resolvedLeaders) {
      const top = cat.leaders[0];
      if (top) {
        parts.push(`▸ ${cat.abbrev}: ${top.name} (${top.value})`);
      }
    }
  } else {
    parts.push('▸ Season leaders update daily — check the app for live stats.');
  }
  parts.push('');

  // ── 7. CTA — locked, single, no rotation ──
  parts.push('🚀 The model never sleeps. Neither should your edge → maximussports.ai');
  parts.push('');

  // ── 8. DISCLAIMER ──
  parts.push('For entertainment only. Please bet responsibly. 21+');

  // ── 9. HASHTAGS — data-driven: top 3 story teams + 1 pick team + #MLB + #MLBPredictions ──
  const hashtags = buildDailyHashtags(hotPress, [], resolvedPicks);

  return { caption: parts.join('\n'), hashtags };
}

// ── Slug → team name helper ────────────────────────────────────────────────

function nameFromSlug(slug) {
  if (!slug) return '';
  const team = MLB_TEAMS.find(t => t.slug === slug);
  return team?.name || slug;
}

// ── Dynamic hashtag builder ────────────────────────────────────────────────

function buildDailyHashtags(hotPress, _topTeams, allPicks = []) {
  const tags = new Set();

  // Core tags — always present
  tags.add('#MLB');
  tags.add('#MLBPredictions');

  // Top 3 story teams from HOTP bullets (same data as slides)
  for (const b of hotPress.slice(0, 5)) {
    if (tags.size >= 5) break;
    if (b?.logoSlug) {
      const team = MLB_TEAMS.find(t => t.slug === b.logoSlug);
      if (team?.name) {
        tags.add(`#${team.name.replace(/\s+/g, '')}`);
      }
    }
  }

  // 1 pick team if not already covered (resolvedPicks have { selection: "Yankees -130" })
  if (tags.size < 5 && allPicks.length > 0) {
    const topPick = allPicks[0];
    // Extract team name from selection label (e.g., "Yankees -130" → "Yankees")
    const selWord = (topPick.selection || '').split(/\s+/)[0];
    if (selWord) {
      const team = MLB_TEAMS.find(t =>
        t.abbrev === selWord || t.name.includes(selWord) || t.name.split(' ').pop() === selWord
      );
      if (team?.name) {
        tags.add(`#${team.name.replace(/\s+/g, '')}`);
      }
    }
  }

  // Fill remaining slots with category tags
  const fillers = ['#BaseballIntel', '#SportsBetting', '#BaseballAnalytics'];
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

  // ── Build shared briefing — same source as slide + team page ──
  const liveGames = payload.mlbLiveGames || [];
  const teamContext = extractTeamContext(liveGames, slug);
  const projection = slug ? getTeamProjection(slug) : (payload.projection || null);
  const team = slug ? MLB_TEAMS.find(t => t.slug === slug) : null;
  const division = team?.division || payload.division || '';
  const record = payload.record || null;
  const standings = payload.mlbStandings?.[slug] || null;

  const briefing = buildMlbTeamIntelBriefing({
    slug,
    teamName,
    division,
    record,
    projection,
    teamContext,
    newsHeadlines: payload.newsHeadlines || [],
    nextLine: payload.nextLine ?? null,
    standings,
    mlbLeaders: payload.mlbLeaders ?? null,
  });

  const lines = [];

  // ── 1. OPENER ──
  lines.push(`\u26be ${teamName} \u2014 Team Intel Report`);
  lines.push('');

  // ── 2. HOOK HEADLINE ──
  if (briefing.headline) {
    lines.push(`${emoji} ${briefing.headline.replace(/\n/g, ' ').toUpperCase()}`);
    lines.push('');
  }

  // ── 3. MODEL + STANDING CONTEXT ──
  if (projection?.projectedWins) {
    let projLine = `\ud83d\udcca Maximus Model: ${projection.projectedWins} wins`;
    if (projection.floor && projection.ceiling) {
      projLine += ` (${projection.floor}\u2013${projection.ceiling} range)`;
    }
    lines.push(projLine);
  }

  // Division rank + GB from standings or briefing items
  const standingCtx = buildStandingContext(standings, division, record);
  if (standingCtx) {
    lines.push(`\ud83d\udccd ${standingCtx}`);
  }
  lines.push('');

  // ── 4. WHAT'S ACTUALLY HAPPENING — narrative synthesis ──
  const narrative = synthesizeNarrative(briefing);
  if (narrative) {
    lines.push('\ud83d\udca1 What\u2019s actually happening:');
    lines.push(narrative);
    lines.push('');
  }

  // ── 5. WHY IT MATTERS — 3 compact bullet points ──
  const whyBullets = buildWhyItMatters(briefing);
  if (whyBullets.length > 0) {
    lines.push('\ud83d\udcca Why it matters:');
    for (const b of whyBullets) {
      lines.push(`\u2022 ${b}`);
    }
    lines.push('');
  }

  // ── 6. TEAM LEADERS — always exactly 5 categories ──
  const LEADER_DISPLAY = {
    HR: { emoji: '\ud83d\udca5', label: 'Home Runs' },
    RBI: { emoji: '\ud83c\udfaf', label: 'RBIs' },
    H: { emoji: '\u26a1', label: 'Hits' },
    W: { emoji: '\ud83d\udd25', label: 'Wins' },
    SV: { emoji: '\ud83e\udde4', label: 'Saves' },
  };

  if (briefing.teamLeaders?.length > 0) {
    lines.push('\ud83c\udfc6 Team Leaders:');
    for (const tl of briefing.teamLeaders) {
      const ld = LEADER_DISPLAY[tl.stat] || { emoji: '\u26be', label: tl.label || tl.stat };
      const playerName = (tl.player && tl.player !== '\u2014') ? tl.player : 'No clear leader';
      const value = (tl.value && tl.value !== '\u2014') ? tl.value : '\u2014';
      lines.push(`${ld.emoji} ${ld.label} \u2014 ${playerName} (${value})`);
    }
    lines.push('');
  }

  // ── 7. BOTTOM LINE ──
  const bottomLine = buildBottomLine(briefing, teamName, projection);
  lines.push(`\ud83d\udcc9 Bottom line:`);
  lines.push(bottomLine);
  lines.push('');

  // ── 8. CTA ──
  lines.push('\ud83d\ude80 Stay ahead \u2192 maximussports.ai');
  lines.push('');

  // ── 9. DISCLAIMER ──
  lines.push('For entertainment only. Please bet responsibly. 21+');

  // ── 10. HASHTAGS — dynamic, team-aware, exactly 5 ──
  const hashtags = buildTeamHashtags(teamName);

  return { caption: lines.join('\n'), hashtags };
}

// ── Caption helpers ───────────────────────────────────────────────────────

function buildStandingContext(standings, division, record) {
  const parts = [];
  if (record) parts.push(record);
  if (standings?.rank && division) {
    const ordStr = standings.rank === 1 ? '1st' : standings.rank === 2 ? '2nd' : standings.rank === 3 ? '3rd' : `${standings.rank}th`;
    let divStr = `${ordStr} in the ${division}`;
    if (standings.gb > 0) divStr += `, ${standings.gb} GB`;
    parts.push(divStr);
  } else if (division) {
    parts.push(division);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Clean internal model jargon from bullets before rendering to users */
function cleanJargon(text) {
  if (!text) return text;
  return text
    .replace(/\broster misc\b/gi, 'roster construction')
    .replace(/\boverperf\.?\s*corr\.?\b/gi, 'overperformance correction')
    .replace(/\bunderperf\.?\s*corr\.?\b/gi, 'underperformance correction')
    .replace(/\bproj\.?\s*wins?\b/gi, 'projected wins')
    .replace(/\bconf\.?\s*tier\b/gi, 'confidence level')
    .replace(/\bmarket\s*delta\b/gi, 'market gap')
    .replace(/\bdiv\.?\s*rank\b/gi, 'division rank')
    .replace(/\bGB\b/g, 'games back');
}

function synthesizeNarrative(briefing) {
  const fragments = [];
  if (briefing.subtext) fragments.push(cleanJargon(briefing.subtext));
  const items = briefing.items || [];
  // Use first 2 items (standings context + trend) for narrative flow
  for (const item of items.slice(0, 2)) {
    if (item.text && item.text.length > 20) {
      fragments.push(cleanJargon(item.text));
    }
  }
  if (fragments.length === 0) return null;
  return fragments.slice(0, 2).join(' ');
}

function buildWhyItMatters(briefing) {
  const items = briefing.items || [];
  const bullets = [];
  // Pick items 3-5 (last game, driver, risk/outlook)
  for (const item of items.slice(2, 5)) {
    if (item.text && item.text.length > 10) {
      let text = cleanJargon(item.text);
      if (text.length > 140) {
        const sentEnd = text.indexOf('. ', 40);
        if (sentEnd > 0) text = text.slice(0, sentEnd + 1);
      }
      bullets.push(text);
    }
  }
  // Fill from earlier items if needed
  if (bullets.length < 2) {
    for (const item of items) {
      if (bullets.length >= 3) break;
      const cleaned = cleanJargon(item.text);
      if (cleaned && !bullets.includes(cleaned)) {
        bullets.push(cleaned.length > 140 ? cleaned.slice(0, 137) + '...' : cleaned);
      }
    }
  }
  return bullets.slice(0, 3);
}

function buildBottomLine(briefing, teamName, projection) {
  // Use whyItMatters from briefing if available — it's { signals, top } object
  const wim = briefing.whyItMatters;
  if (wim?.top?.long) return wim.top.long;
  if (wim?.top?.short) return wim.top.short;
  if (typeof wim === 'string') return wim;

  // Synthesize from projection + headline
  const shortName = resolveNick(teamName);
  if (projection?.confidenceTier) {
    const tier = projection.confidenceTier.toLowerCase();
    if (tier.includes('high')) {
      return `The ${shortName} have the pieces. The model sees it. Now they need to prove it on the field.`;
    }
    if (tier.includes('low')) {
      return `It\u2019s a tough road ahead for the ${shortName}. The margins are thin and the room for error is shrinking.`;
    }
  }
  return `The ${shortName} are in a defining stretch. What happens next will set the tone for the rest of the season.`;
}

function buildTeamHashtags(teamName) {
  const shortName = resolveNick(teamName);
  const fullTag = `#${teamName.replace(/\s+/g, '')}`;

  // Team-specific culture tags
  const teamTags = {
    'Yankees': '#PinstripePride', 'Red Sox': '#RedSoxNation', 'Dodgers': '#LetsGoDodgers',
    'Mets': '#LGM', 'Cubs': '#GoCubsGo', 'Braves': '#ForTheA',
    'Astros': '#LevelUp', 'Phillies': '#RingTheBell', 'Padres': '#FriarFaithful',
    'Giants': '#SFGiants', 'Cardinals': '#STLCards', 'Guardians': '#ClevelandGuardians',
    'Rangers': '#StraightUpTX', 'Mariners': '#SeaUsRise', 'Twins': '#MNTwins',
    'Orioles': '#Birdland', 'Rays': '#RaysUp', 'Blue Jays': '#NextLevel',
    'White Sox': '#WhiteSox', 'Royals': '#Royals', 'Tigers': '#DetroitRoots',
    'Angels': '#GoHalos', 'Athletics': '#GreenCollar', 'Brewers': '#ThisIsMyCrew',
    'Pirates': '#LetsGoBucs', 'Reds': '#ATOBTTR', 'Diamondbacks': '#Dbacks',
    'Rockies': '#Rockies', 'Nationals': '#NATITUDE', 'Marlins': '#MakeItMiami',
  };

  const culturalTag = teamTags[shortName] || fullTag;
  const tags = [fullTag, culturalTag, '#MLB', '#BaseballIntel', '#MLBPredictions'];
  // Deduplicate
  return [...new Set(tags)].slice(0, 5);
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
  // team-intel and daily-briefing include their own disclaimer
  const hasOwnDisclaimer = payload.section === 'daily-briefing' || payload.section === 'team-intel';
  const fullCaption = hasOwnDisclaimer
    ? result.caption
    : result.caption + '\n\nFor entertainment only. Please bet responsibly. 21+';
  return {
    shortCaption: fullCaption,
    longCaption: fullCaption,
    hashtags: result.hashtags,
  };
}
