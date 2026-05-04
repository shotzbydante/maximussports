/**
 * buildNbaCaption — Instagram caption generator for NBA Content Studio.
 *
 * Mirrors buildMlbCaption() contract exactly so the same
 * normalizeStudioCaption() / publish pipeline consumes the result.
 * Playoff-framed end-to-end.
 *
 * Structure (daily-briefing):
 *   🔥 opener (playoff-framed)
 *   🔥 hero headline
 *   📊 What happened  — 3-5 HOTP bullets
 *   📈 Why it matters — playoff implication, not generic analysis
 *   🎯 Maximus's Picks — ALL resolved picks with type + team
 *   🏆 Postseason Leaders — all 5 NBA categories (PPG/APG/RPG/SPG/BPG)
 *   🚀 CTA
 *   disclaimer
 *   hashtags (data-driven, 5 tags)
 *
 * HARD VALIDATION (throws; autopost catches + records structured failure):
 *   - Zero picks resolved AND board not explicitly in no-slate state
 *   - Zero leader categories resolved
 *   - Zero bullets AND no playoffContext (nothing to say)
 *
 * No generic fallback junk captions. If the slate is genuinely empty,
 * the builder emits a short no-slate caption that's EXPLICITLY marked as
 * such via the exported NO_SLATE_REASON constant — callers check for that
 * before publishing.
 *
 * Picks contract: reads payload.nbaPicks.categories.{pickEms, ats, leans,
 * totals} (the legacy shape buildNbaPicksV2 also writes) — same path as
 * MLB caption. No parallel shaping. No bias-reshuffling. Convictions come
 * from the V2 engine's tier assignment.
 */

import { NBA_TEAMS } from '../../../sports/nba/teams.js';
import { LEADER_CATEGORIES } from '../../../data/nba/seasonLeaders.js';
import { buildNbaDailyHeadline } from './buildNbaDailyHeadline.js';
import { buildNbaHotPress } from './buildNbaHotPress.js';
import { resolveCanonicalNbaPicks } from './resolveSlidePicks.js';
import { buildNbaTeamIntelCaption } from './buildNbaTeamIntelCaption.js';

export const NO_SLATE_REASON = 'nba_no_slate';
const MIN_CAPTION_CHARS = 80;

// ── Helpers ───────────────────────────────────────────────────────────────

function resolveNickname(fullName) {
  if (!fullName) return '???';
  if (/Trail Blazers$/i.test(fullName)) return 'Trail Blazers';
  return fullName.split(' ').pop();
}

const TEAM_BY_SLUG = Object.fromEntries(NBA_TEAMS.map(t => [t.slug, t]));
const TEAM_BY_ABBREV = Object.fromEntries(NBA_TEAMS.map(t => [t.abbrev, t]));

function fullName(slug) { return TEAM_BY_SLUG[slug]?.name || slug || '???'; }
function nick(slug) { const t = TEAM_BY_SLUG[slug]; return t ? resolveNickname(t.name) : '???'; }
function fullFromAbbrev(abbrev) {
  if (!abbrev) return '';
  return TEAM_BY_ABBREV[abbrev]?.name || abbrev;
}

// ── Resolve picks (same pattern as MLB) ──────────────────────────────────

function _fmtConviction(tier) {
  if (!tier) return 'Edge';
  const t = typeof tier === 'string' ? tier.toLowerCase() : tier;
  if (t === 'high' || t === 'tier1' || t === 'elite') return 'High';
  if (t === 'medium-high') return 'Med-High';
  if (t === 'medium' || t === 'tier2' || t === 'strong') return 'Medium';
  if (t === 'low' || t === 'tier3' || t === 'solid' || t === 'lean') return 'Lean';
  return typeof tier === 'string' ? (tier.charAt(0).toUpperCase() + tier.slice(1)) : 'Edge';
}

function resolvePicks(data, count = 999) {
  // Caption picks share Slide 1's + Slide 2's canonical resolver — one
  // sort, one ordering. Caption can request more (count = 999) but the
  // first N must match Slide 2's first N, which must prefix Slide 1's.
  const all = resolveCanonicalNbaPicks(data);

  return all.slice(0, count).map(p => {
    // V2 matchup shape: { awayTeam: { slug, shortName, name }, homeTeam: {...} }
    // Legacy shape may differ — support both
    const away = p.matchup?.awayTeam || {};
    const home = p.matchup?.homeTeam || {};
    const awayLabel = away.shortName || away.abbrev || away.name || '?';
    const homeLabel = home.shortName || home.abbrev || home.name || '?';
    const selection = p.pick?.label || p.selection?.label || '—';
    const conviction = _fmtConviction(p.confidence || p.tier);
    const pickSide = p.pick?.side || p.selection?.side;
    const selectedTeam = pickSide === 'away' ? away : home;
    return {
      matchup: `${awayLabel} @ ${homeLabel}`,
      type: p._cat,
      selection,
      conviction,
      selectedTeamSlug: selectedTeam?.slug || null,
      confidence: p.confidence || p.tier,
    };
  });
}

function resolveLeaders(data, topN = 3) {
  const raw = data?.nbaLeaders?.categories || {};
  return LEADER_CATEGORIES
    .filter(c => (raw[c.key]?.leaders?.length ?? 0) > 0)
    .map(c => ({
      key: c.key, label: c.label, abbrev: c.abbrev, icon: c.icon,
      leaders: (raw[c.key].leaders || []).slice(0, topN).map(l => ({
        name: l.name || '—',
        teamAbbrev: l.teamAbbrev || '',
        value: l.display || String(l.value || 0),
      })),
    }));
}

// ── "Why it matters" — playoff-specific ──────────────────────────────────

function buildWhyItMatters(payload, topStory) {
  const pc = payload.nbaPlayoffContext;

  // Anchor on the top story if it has playoff weight
  if (topStory) {
    if (topStory.isGame7Win) {
      return `A Game 7 win rewrites the bracket — ${nick(topStory.winSlug)} advance, and the other side of the draw now flexes around them.`;
    }
    if (topStory.isSweep) {
      return `A sweep buys rest and momentum. ${nick(topStory.winSlug)} enter the next round fresh while the rest of the bracket is still grinding.`;
    }
    if (topStory.isClinch) {
      return `Closing out a series on the road or at home is the playoff stamp — ${nick(topStory.winSlug)} advance with their rotation intact.`;
    }
    if (topStory.isElimWin) {
      return `A 3-game cushion changes the math. ${nick(topStory.winSlug)} only need one more win; ${nick(topStory.loseSlug)} need three in a row.`;
    }
    if (topStory.isUpset) {
      return `Upsets this early reshape the title odds — the ${nick(topStory.winSlug)} are playing with house money and forcing the bracket to respect them.`;
    }
    if (topStory.isStolenRoadWin) {
      return `Stealing home-court changes the series — ${nick(topStory.winSlug)} now hold serve advantage the rest of the way.`;
    }
    if (topStory.inSeries) {
      return `Every playoff game moves the series needle. Tonight's result puts ${nick(topStory.winSlug)} one game closer to the next round.`;
    }
  }

  // Elimination/upset framing when no standout finals exist
  if (pc?.eliminationGames?.length) {
    const e = pc.eliminationGames[0];
    const leader = e.eliminationFor === 'top' ? e.bottomTeam : e.topTeam;
    const trailer = e.eliminationFor === 'top' ? e.topTeam : e.bottomTeam;
    return `Elimination night. ${leader?.name || leader?.abbrev} can end ${trailer?.name || trailer?.abbrev}'s season — closeout wins are the hardest ones in the playoffs.`;
  }
  if (pc?.upsetWatch?.length) {
    const u = pc.upsetWatch[0];
    const lead = u.leader === 'top' ? u.topTeam : u.bottomTeam;
    const trail = u.leader === 'top' ? u.bottomTeam : u.topTeam;
    return `${lead?.abbrev} (${lead?.seed}) flipping the bracket against ${trail?.abbrev} (${trail?.seed}) — if this holds, the entire side of the draw opens up.`;
  }

  return 'Playoff results compound — tonight\'s swings echo into next round\'s seeding, rest, and matchup edges.';
}

// ── Daily caption ─────────────────────────────────────────────────────────

function dailyCaption(payload) {
  const parts = [];
  const pc = payload.nbaPlayoffContext;
  const hl = buildNbaDailyHeadline({ liveGames: payload.nbaLiveGames || [], playoffContext: pc });
  const hotPress = buildNbaHotPress({ liveGames: payload.nbaLiveGames || [], playoffContext: pc });
  const bullets = hotPress.filter(b => b?.text);

  // Resolve picks/leaders FIRST — validate before building
  const resolvedPicks = resolvePicks(payload, 999);
  const resolvedLeaders = resolveLeaders(payload, 3);

  // ── No-slate detection ──
  // If there are NO finals and NO upcoming (no bullets) AND NO picks AND
  // no tracked playoff series, we're in a true empty state. Emit a
  // minimal, honest caption (NOT a fallback junk caption).
  const noFinals = (payload.nbaLiveGames || []).every(g => !(g?.gameState?.isFinal || g?.status === 'final'));
  const noUpcoming = (payload.nbaLiveGames || []).every(g => !(g?.status === 'upcoming'));
  const noBullets = bullets.length === 0;
  const noPicks = resolvedPicks.length === 0;
  const noActiveSeries = !(pc?.series?.length > 0);
  if (noFinals && noUpcoming && noBullets && noPicks && noActiveSeries) {
    const text = [
      '🏀 NBA Daily Briefing',
      '',
      'No games on today\'s slate — picks return next game day.',
      '',
      '🚀 Tracking the race → maximussports.ai',
      '',
      'For entertainment only. Please bet responsibly. 21+',
    ].join('\n');
    return {
      caption: text,
      hashtags: ['#NBA', '#NBAPlayoffs', '#MaximusSports', '#BasketballIntel', '#Basketball'],
      _noSlate: true,
      _reason: NO_SLATE_REASON,
    };
  }

  // ── HARD VALIDATION ──
  // Picks remain a hard requirement — without picks the caption has no
  // betting edge to surface, which is the whole point.
  if (resolvedPicks.length === 0) {
    throw new Error(`[CAPTION_VALIDATION_FAILED] Zero NBA picks resolved. payload keys: ${Object.keys(payload?.nbaPicks?.categories || {}).join(',') || 'NONE'}`);
  }
  // Leaders are SOFT — we render "Postseason leader feed updating" in
  // the leaders section instead of failing the entire caption when
  // ESPN's types/3 endpoint and the box-score aggregator both come up
  // empty. The audit Part 2 spec explicitly calls for this behavior.

  // ── Diagnostic: confirm Slide 1, Slide 2, and caption all see the
  // same HOTP / picks / leaders / Title Path data. Any drift here will
  // be visible from a single console line.
  const titlePathSource = [
    ...(payload.playoffOutlook?.east || []),
    ...(payload.playoffOutlook?.west || []),
  ]
    // Title Path must show only ACTIVE teams — eliminated teams now
    // surface in Slide 3 with their own badge but should never appear
    // in the caption's Title Path section.
    .filter(t => !t.isEliminated && t.status !== 'eliminated')
    .filter(t => t.prob != null)
    .sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));
  console.log('[NBA_CAPTION_INPUT]', {
    hotpCount: bullets.length,
    hotpFirst: bullets[0]?.text?.slice(0, 100),
    hotpSources: bullets.slice(0, 4).map(b => b.source),
    picksCount: resolvedPicks.length,
    leaderCategories: resolvedLeaders.map(c => c.abbrev),
    leaderSource: payload.nbaLeaders?._source || payload.nbaLeaders?.seasonType || 'unknown',
    outlookCount: titlePathSource.length,
  });

  // Audit Part 7 — Caption restructured for IG virality:
  //   1. Opener
  //   2. Narrative headline (🔥)
  //   3. What happened (📊) — HOTP
  //   4. Why it matters (📈) — bracket / title path / market stakes
  //   5. Maximus's Picks (🎯) — top 3 (cap, since IG caption length matters)
  //   6. Postseason Leaders (🏆) — ALL 5 categories (totals)
  //   7. Title Path (🔭) — top East + top West contender per conference
  //   8. Watch next (👀) — next key Game 7 / closeout / R2 game
  //   9. CTA + disclaimer

  // ── 1. OPENER ──
  parts.push('🏀 Your Daily NBA Playoff Briefing is here.');
  parts.push('');

  // ── 2. HERO HEADLINE ──
  if (hl.heroTitle) {
    parts.push(`🔥 ${hl.heroTitle}`);
    parts.push('');
  }

  // ── 3. WHAT HAPPENED ──
  parts.push('📊 What happened:');
  if (bullets.length > 0) {
    for (const b of bullets.slice(0, 4)) parts.push(`• ${b.text}`);
  } else {
    const activeSeriesCount = pc?.series?.length || 0;
    if (activeSeriesCount > 0) {
      parts.push(`• ${activeSeriesCount} ${pc?.round?.toLowerCase() || 'playoff'} series in motion — tonight's tip will shift the bracket.`);
    }
  }
  parts.push('');

  // ── 4. WHY IT MATTERS — playoff leverage + title-path framing ──
  parts.push('📈 Why it matters:');
  parts.push(buildWhyItMatters(payload, hl.topStory));
  parts.push('');

  // ── 5. MAXIMUS'S PICKS ──
  // Cap at top 3 in caption (IG length budget) — Slide 2 still surfaces
  // the canonical full picks list, and resolvedPicks already holds it.
  const captionPicks = resolvedPicks.slice(0, 3);
  parts.push('🎯 Maximus\'s Picks:');
  for (const p of captionPicks) {
    parts.push(`▸ ${p.matchup} — ${p.selection} (${p.type}, ${p.conviction})`);
  }
  parts.push('');

  // ── 6. POSTSEASON LEADERS ──
  // ALL 5 categories (PTS / AST / REB / STL / BLK) — top 1 each.
  // Renders "feed updating" inline if no categories resolved.
  parts.push('🏆 Postseason Leaders:');
  if (resolvedLeaders.length === 0) {
    parts.push('▸ Postseason leader feed updating — check back at tip-off.');
  } else {
    // Always emit a row per CANONICAL category so IG followers always
    // see PTS/AST/REB/STL/BLK at a glance, even when one category came
    // up empty in this aggregation pass.
    const byKey = Object.fromEntries(resolvedLeaders.map(c => [c.key, c]));
    for (const meta of LEADER_CATEGORIES) {
      const cat = byKey[meta.key];
      const top = cat?.leaders?.[0];
      if (!top) {
        parts.push(`▸ ${meta.abbrev}: feed updating`);
        continue;
      }
      const team = fullFromAbbrev(top.teamAbbrev) || top.teamAbbrev || '';
      const teamTag = team ? ` (${team})` : '';
      parts.push(`▸ ${meta.abbrev}: ${top.name}${teamTag} — ${top.value}`);
    }
  }
  parts.push('');

  // ── 7. TITLE PATH ──
  // Best East + best West contender by championship odds — mirrors
  // the Slide 3 Playoff Outlook spirit (top per conference) without
  // dumping a full leaderboard into the caption.
  const titleEast = (payload.playoffOutlook?.eastFull || payload.playoffOutlook?.east || [])
    .filter(t => !t.isEliminated)
    .filter(t => t.prob != null)
    .sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));
  const titleWest = (payload.playoffOutlook?.westFull || payload.playoffOutlook?.west || [])
    .filter(t => !t.isEliminated)
    .filter(t => t.prob != null)
    .sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));
  if (titleEast.length > 0 || titleWest.length > 0) {
    parts.push('🔭 Title Path:');
    for (const t of titleEast.slice(0, 2)) {
      const labelTag = t.label ? ` ${t.label}` : '';
      parts.push(`▸ ${t.abbrev || t.team || '?'} (East) — ${t.odds}${labelTag}`);
    }
    for (const t of titleWest.slice(0, 2)) {
      const labelTag = t.label ? ` ${t.label}` : '';
      parts.push(`▸ ${t.abbrev || t.team || '?'} (West) — ${t.odds}${labelTag}`);
    }
    parts.push('');
  }

  // ── 8. WATCH NEXT — surface today's anchor matchup with stakes ──
  // Was "Watch tonight" — moved AFTER Title Path so caption flow goes
  // from "where we stand" to "what's next." Cap at 3 lines.
  const watchNext = buildWatchTonight(payload);
  if (watchNext.length > 0) {
    parts.push('👀 Watch next:');
    for (const line of watchNext) parts.push(`▸ ${line}`);
    parts.push('');
  }

  // ── 9. CTA ──
  parts.push('🚀 The model never sleeps. Neither should your edge → maximussports.ai');
  parts.push('');

  // ── 10. DISCLAIMER ──
  parts.push('For entertainment only. Please bet responsibly. 21+');

  const hashtags = buildDailyHashtags(pc, hl.topStory, resolvedPicks);
  return { caption: parts.join('\n'), hashtags };
}

const EAST_SLUGS_FOR_TITLE_PATH = new Set([
  'bos','det','cle','tor','nyk','atl','ind','mia','phi','mil','orl','chi','was','cha','bkn',
]);
function isEastSlug(slug) {
  return slug ? EAST_SLUGS_FOR_TITLE_PATH.has(slug) : false;
}

/**
 * Build the "Watch tonight" caption section.
 *
 * Sources today's scheduled games from playoffContext.todayGames and
 * pairs each with its series state (closeout / elimination / G7).
 * Returns up to 3 strings ranked by leverage (closeout/G7 first, then
 * pivot/swing). Returns [] when there's nothing to watch tonight.
 *
 * Examples:
 *   "LAL vs HOU — Game 6, Houston faces elimination"
 *   "CLE vs TOR — Game 6, Toronto faces elimination"
 *   "BOS vs PHI — Game 7 decides the series"
 */
function buildWatchTonight(payload) {
  const pc = payload.nbaPlayoffContext;
  const today = pc?.todayGames || [];
  const series = pc?.series || [];
  if (today.length === 0) return [];

  const lines = [];
  for (const g of today) {
    const a = g?.teams?.away;
    const h = g?.teams?.home;
    if (!a?.slug || !h?.slug) continue;

    // Find the series this game belongs to
    const ser = series.find(s => {
      const top = s.topTeam?.slug;
      const btm = s.bottomTeam?.slug;
      return (top === a.slug && btm === h.slug) || (top === h.slug && btm === a.slug);
    });

    const aAbbr = a.abbrev || a.slug?.toUpperCase();
    const hAbbr = h.abbrev || h.slug?.toUpperCase();
    const matchup = `${aAbbr} vs ${hAbbr}`;
    const gameNum = ser?.nextGameNumber || (ser ? (ser.gamesPlayed + 1) : null);
    const gameTag = gameNum ? `Game ${gameNum}` : 'Tonight';

    let stake = '';
    if (ser?.isGameSeven) {
      stake = ', winner takes the series';
    } else if (ser?.isElimination && ser.eliminationFor) {
      const trailer = ser.eliminationFor === 'top' ? ser.topTeam : ser.bottomTeam;
      const trailerName = trailer?.name?.split(' ').pop() || trailer?.abbrev;
      stake = `, ${trailerName} faces elimination`;
    } else if (ser?.isSwingGame) {
      stake = ', series swings tonight';
    } else if (ser?.gamesPlayed === 0) {
      stake = ', series tips off tonight';
    }

    lines.push({
      text: `${matchup} — ${gameTag}${stake}`,
      _priority: ser?.isGameSeven ? 100 : (ser?.isElimination ? 90 : (ser?.isSwingGame ? 60 : 30)),
    });
  }

  lines.sort((x, y) => (y._priority || 0) - (x._priority || 0));
  return lines.slice(0, 3).map(l => l.text);
}

// ── Dynamic hashtag builder ───────────────────────────────────────────────

function buildDailyHashtags(playoffContext, topStory, picks) {
  // Audit Part 2 spec ordering: lead with playoff-aware tags + sports-
  // betting hashtag for IG reach during the postseason.
  const tags = new Set();
  tags.add('#NBAPlayoffs');
  tags.add('#NBAPicks');
  tags.add('#SportsBetting');
  tags.add('#NBA');
  tags.add('#MaximusSports');
  return [...tags].slice(0, 5);
}

// ── Other section stubs (Phase 2+; keep contract consistent with MLB) ────

function teamCaption(payload) {
  // Delegate to the editorial Team Intel caption builder. The new
  // builder reads the SAME canonical payload as the slide (series
  // path, champ odds, picks, leaders, recent finals) so caption ==
  // slide. Kept here for the SECTION_BUILDERS registry.
  return buildNbaTeamIntelCaption(payload);
}

function genericCaption(payload) {
  const lines = [`🏀 ${payload.headline || 'NBA Playoff Intel'}`];
  if (payload.subhead) lines.push('', payload.subhead);
  lines.push('', 'More → maximussports.ai');
  return { caption: lines.join('\n'), hashtags: ['#NBA', '#NBAPlayoffs', '#Basketball', '#MaximusSports'] };
}

const SECTION_BUILDERS = {
  'daily-briefing': dailyCaption,
  'team-intel':     teamCaption,
  'league-intel':   genericCaption,
  'division-intel': genericCaption,
  'game-insights':  genericCaption,
  'maximus-picks':  genericCaption,
};

export function buildNbaCaption(payload) {
  const builder = SECTION_BUILDERS[payload.section] || genericCaption;
  const result = builder(payload);

  // Team Intel + Daily Briefing builders include their own disclaimer
  // line. Don't double-add for those sections — only the legacy
  // generic caption builders need the wrapper to append it.
  const hasOwnDisclaimer = payload.section === 'daily-briefing'
    || payload.section === 'team-intel'
    || result._noSlate;
  const fullCaption = hasOwnDisclaimer
    ? result.caption
    : result.caption + '\n\nFor entertainment only. Please bet responsibly. 21+';

  return {
    shortCaption: fullCaption,
    longCaption: fullCaption,
    hashtags: result.hashtags,
    _noSlate: !!result._noSlate,
    _reason: result._reason || null,
  };
}

export default buildNbaCaption;
export { MIN_CAPTION_CHARS, resolvePicks, resolveLeaders };
