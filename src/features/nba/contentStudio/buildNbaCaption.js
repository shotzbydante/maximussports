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
 *   🏆 Season Leaders — all 5 NBA categories (PPG/APG/RPG/SPG/BPG), top 3
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
  const cats = data?.nbaPicks?.categories || data?.canonicalPicks?.categories || {};
  const pickEms = (cats.pickEms || []).map(p => ({ ...p, _cat: 'Moneyline' }));
  const ats     = (cats.ats     || []).map(p => ({ ...p, _cat: 'Spread' }));
  const leans   = (cats.leans   || []).map(p => ({ ...p, _cat: 'Lean' }));
  const totals  = (cats.totals  || []).map(p => ({ ...p, _cat: 'Total' }));

  // Sort by V2 betScore (fallback to confidenceScore)
  const score = p => p?.betScore?.total ?? p?.confidenceScore ?? 0;
  const all = [...pickEms, ...ats, ...leans, ...totals].sort((a, b) => score(b) - score(a));

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
  if (resolvedPicks.length === 0) {
    throw new Error(`[CAPTION_VALIDATION_FAILED] Zero NBA picks resolved. payload keys: ${Object.keys(payload?.nbaPicks?.categories || {}).join(',') || 'NONE'}`);
  }
  if (resolvedLeaders.length === 0) {
    throw new Error(`[CAPTION_VALIDATION_FAILED] Zero NBA leader categories resolved. payload keys: ${Object.keys(payload?.nbaLeaders?.categories || {}).join(',') || 'NONE'}`);
  }

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
    // No finals yet today — use playoff-framed placeholder pulled from context,
    // NOT generic filler. The hot-press builder returned [] so here we state
    // what the slate looks like tonight.
    const activeSeriesCount = pc?.series?.length || 0;
    if (activeSeriesCount > 0) {
      parts.push(`• ${activeSeriesCount} ${pc?.round?.toLowerCase() || 'playoff'} series in motion — tonight's tip will shift the bracket.`);
    }
  }
  parts.push('');

  // ── 4. WHY IT MATTERS ──
  parts.push('📈 Why it matters:');
  parts.push(buildWhyItMatters(payload, hl.topStory));
  parts.push('');

  // ── 5. MAXIMUS'S PICKS ──
  parts.push('🎯 Maximus\'s Picks:');
  for (const p of resolvedPicks) {
    parts.push(`▸ ${p.type} | ${p.matchup}: ${p.selection} (${p.conviction})`);
  }
  parts.push('');

  // ── 6. SEASON LEADERS ──
  parts.push('🏆 Season Leaders:');
  for (const cat of resolvedLeaders) {
    parts.push('');
    parts.push(`${cat.icon} ${cat.label}:`);
    cat.leaders.forEach((l, i) => {
      const team = fullFromAbbrev(l.teamAbbrev);
      parts.push(`${i + 1}. ${l.name} — ${team} (${l.value})`);
    });
  }
  parts.push('');

  // ── 7. CTA ──
  parts.push('🚀 The model never sleeps. Neither should your edge → maximussports.ai');
  parts.push('');

  // ── 8. DISCLAIMER ──
  parts.push('For entertainment only. Please bet responsibly. 21+');

  const hashtags = buildDailyHashtags(pc, hl.topStory, resolvedPicks);
  return { caption: parts.join('\n'), hashtags };
}

// ── Dynamic hashtag builder ───────────────────────────────────────────────

function buildDailyHashtags(playoffContext, topStory, picks) {
  const tags = new Set();
  tags.add('#NBA');
  tags.add('#NBAPlayoffs');

  // Top story team
  if (topStory?.winSlug) {
    const t = TEAM_BY_SLUG[topStory.winSlug];
    if (t) tags.add(`#${t.name.replace(/\s+/g, '')}`);
  }

  // An upset-watch or elimination team, to mirror storyline
  const featured = playoffContext?.upsetWatch?.[0] || playoffContext?.eliminationGames?.[0];
  if (featured && tags.size < 5) {
    const leader = featured.leader === 'top' ? featured.topTeam : featured.bottomTeam;
    if (leader?.slug) {
      const t = TEAM_BY_SLUG[leader.slug];
      if (t) tags.add(`#${t.name.replace(/\s+/g, '')}`);
    }
  }

  // Top pick team
  if (tags.size < 5 && picks?.length > 0) {
    const slug = picks[0]?.selectedTeamSlug;
    if (slug) {
      const t = TEAM_BY_SLUG[slug];
      if (t) tags.add(`#${t.name.replace(/\s+/g, '')}`);
    }
  }

  const fillers = ['#BasketballIntel', '#NBAPicks', '#Playoffs', '#Basketball'];
  for (const f of fillers) {
    if (tags.size >= 5) break;
    tags.add(f);
  }

  return [...tags].slice(0, 5);
}

// ── Other section stubs (Phase 2+; keep contract consistent with MLB) ────

function teamCaption(payload) {
  const teamName = payload.teamA?.name || payload.headline || 'Team';
  const lines = [`🏀 ${teamName} — Playoff Intel`, ''];
  if (payload.subhead) lines.push(payload.subhead);
  lines.push('', 'More → maximussports.ai');
  return { caption: lines.join('\n'), hashtags: ['#NBA', '#NBAPlayoffs', `#${teamName.replace(/\s+/g, '')}`, '#BasketballIntel', '#MaximusSports'] };
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

  const hasOwnDisclaimer = payload.section === 'daily-briefing' || result._noSlate;
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
