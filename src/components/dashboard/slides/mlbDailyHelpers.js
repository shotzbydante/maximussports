/**
 * mlbDailyHelpers — Shared data helpers for MLB Daily Briefing carousel slides.
 *
 * Extracted from MlbSingleSlide.jsx so all 3 carousel slides can share
 * the same data pipeline without duplication.
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams.js';
import { getTeamProjection } from '../../../data/mlb/seasonModel.js';
import { LEADER_CATEGORIES } from '../../../data/mlb/seasonLeaders.js';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos.js';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload.js';

// ─── Text helpers ──────────────────────────────────────────────

export function stripEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

export function fmtOdds(v) {
  if (v == null) return '—';
  const n = Number(v);
  return isNaN(n) ? String(v) : n > 0 ? `+${n}` : `${n}`;
}

export function fmtDelta(v) {
  if (v == null) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n > 0 ? `+${n}` : `${n}`;
}

// ─── Card rationale builder ────────────────────────────────────

export function buildCardRationale(t) {
  const parts = [];
  if (t.confidenceTier) parts.push(`${t.confidenceTier} confidence`);
  if (t.marketDelta != null && t.marketDelta !== 0) {
    const dir = t.marketDelta > 0 ? 'above' : 'below';
    parts.push(`${Math.abs(t.marketDelta).toFixed(1)} wins ${dir} market`);
  }
  const line1 = parts.length > 0 ? parts.join(', ') + '.' : '';

  const line2Parts = [];
  if (t.strongestDriver) line2Parts.push(t.strongestDriver);
  if (t.biggestDrag && t.biggestDrag !== 'None significant') line2Parts.push(`${t.biggestDrag} is the drag`);
  const line2 = line2Parts.length > 0 ? line2Parts.join('. ') + '.' : '';

  return [line1, line2].filter(Boolean).join(' ') || `${t.abbrev} projects at ${t.projectedWins} wins.`;
}

// ─── Season intel leaders (6-team board) ───────────────────────

export function buildSeasonIntelLeaders(champOdds) {
  const entries = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    const oddsData = champOdds?.[team.slug];
    const oddsVal = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;
    entries.push({
      slug: team.slug, abbrev: team.abbrev, league: team.league,
      projectedWins: proj.projectedWins, odds: oddsVal,
      confidenceTier: proj.confidenceTier ?? null,
      marketDelta: proj.marketDelta ?? null,
      strongestDriver: proj.takeaways?.strongestDriver ?? null,
      biggestDrag: proj.takeaways?.biggestDrag ?? null,
      marketStance: proj.takeaways?.marketStance ?? null,
      depthProfile: proj.takeaways?.depthProfile ?? null,
      riskProfile: proj.takeaways?.riskProfile ?? null,
      signals: proj.signals ?? [],
    });
  }
  entries.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  const al = entries.filter(e => e.league === 'AL').slice(0, 3);
  const nl = entries.filter(e => e.league === 'NL').slice(0, 3);
  if (al.length === 0 && nl.length === 0) return null;

  const ordered = [];
  const maxLen = Math.max(al.length, nl.length);
  for (let i = 0; i < maxLen; i++) {
    if (al[i]) ordered.push({ ...al[i], rank: i + 1 });
    if (nl[i]) ordered.push({ ...nl[i], rank: i + 1 });
  }
  return ordered;
}

// ─── Editorial blocks ──────────────────────────────────────────

const EDITORIAL_MAP = [
  { title: 'HOT OFF THE PRESS', paraIdx: 0, maxSentences: 3 },
  { title: 'PENNANT RACE INSIGHTS', paraIdx: 2, maxSentences: 2 },
  { title: 'MARKET SIGNAL', paraIdx: 1, maxSentences: 2 },
];

export function buildEditorialBlocks(intel) {
  if (!intel?.rawParagraphs?.length) return null;
  const blocks = [];

  for (const mapping of EDITORIAL_MAP) {
    const para = intel.rawParagraphs[mapping.paraIdx];
    if (!para) continue;
    const cleaned = stripEmojis(para);
    if (!cleaned || cleaned.length < 30) continue;

    const labelMatch = cleaned.match(/^([A-Z][A-Z\s&+\-:]*[A-Z])\s*[:—–-]\s*/);
    const bodyText = labelMatch ? cleaned.slice(labelMatch[0].length) : cleaned;
    const sentences = bodyText.match(/[^.!?]*[.!?]+/g) || [bodyText];
    const body = sentences.slice(0, mapping.maxSentences).join(' ').trim();

    if (!body || body.length < 20) continue;
    blocks.push({ title: mapping.title, body });
  }

  if (blocks.length < 3) {
    const usedIndices = new Set(EDITORIAL_MAP.map(m => m.paraIdx));
    const fallbackTitles = ['HOT OFF THE PRESS', 'PENNANT RACE INSIGHTS', 'MARKET SIGNAL'];
    const fallbackMax = [3, 2, 2];
    for (let i = 0; i < intel.rawParagraphs.length && blocks.length < 3; i++) {
      if (usedIndices.has(i)) continue;
      const cleaned = stripEmojis(intel.rawParagraphs[i]);
      if (!cleaned || cleaned.length < 30) continue;
      const sentences = cleaned.match(/[^.!?]*[.!?]+/g) || [cleaned];
      const maxS = fallbackMax[blocks.length] || 2;
      const body = sentences.slice(0, maxS).join(' ').trim();
      if (!body || body.length < 20) continue;
      blocks.push({ title: fallbackTitles[blocks.length] || 'INTEL', body });
    }
  }

  return blocks.length > 0 ? blocks : null;
}

// ─── Canonical pick resolver (SINGLE SOURCE OF TRUTH) ─────────
// Used by Slide 1, Slide 2, and caption builder.
// Returns the FINAL resolved picks array — no component should
// re-derive picks from raw categories independently.

function fmtConvictionShared(tier) {
  if (!tier) return 'Edge';
  if (tier === 'high') return 'High';
  if (tier === 'medium-high') return 'Med-High';
  if (tier === 'medium') return 'Medium';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * Resolve picks from raw data — identical logic for slides + caption.
 * @param {Object} data - { mlbPicks, canonicalPicks }
 * @param {number} count - max picks to return (3 for Slide 1/caption, 4 for Slide 2)
 * @param {boolean} pad - if true, pad to `count` with TBD placeholders (Slide 2 only)
 * @returns {Array} resolved pick objects
 */
export function resolvePicks(data, count = 3, pad = false) {
  const pickCats = data?.mlbPicks?.categories || data?.canonicalPicks?.categories || {};
  const pickEms = (pickCats.pickEms || []).map(p => ({ ...p, type: "Pick 'Em" }));
  const ats = (pickCats.ats || []).map(p => ({ ...p, type: 'ATS' }));
  const totals = (pickCats.totals || []).map(p => ({ ...p, type: 'O/U' }));

  const allByConf = [...pickEms, ...ats, ...totals].sort(
    (a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0)
  );
  const selected = [];
  const usedIds = new Set();

  // Guarantee one ATS first if available
  if (ats.length > 0) {
    const bestAts = [...ats].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))[0];
    selected.push(bestAts);
    usedIds.add(bestAts.id);
  }
  // Fill remaining with best by confidence
  for (const p of allByConf) {
    if (selected.length >= count) break;
    if (!usedIds.has(p.id)) {
      selected.push(p);
      usedIds.add(p.id);
    }
  }

  const picks = selected.slice(0, count).map(p => {
    const away = p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.name || '?';
    const home = p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.name || '?';
    const matchup = `${away} vs ${home}`;
    const selection = p.pick?.label || '—';
    const conviction = fmtConvictionShared(p.confidence);
    const edgePct = p.pick?.edgePercent || p.confidenceScore;
    const rationale = edgePct
      ? `Model favors ${(selection || '').split(' ').pop()} with a ${Number(edgePct).toFixed(1)}% edge.`
      : `Model edge: ${conviction.toLowerCase()} conviction`;
    const pickSide = p.pick?.side;
    const selectedTeam = pickSide === 'away' ? p.matchup?.awayTeam : p.matchup?.homeTeam;
    const selectionLogoSrc = selectedTeam?.slug ? getMlbEspnLogoUrl(selectedTeam.slug) : null;
    return { matchup, type: p.type, selection, selectionLogoSrc, conviction, rationale, confidence: p.confidence };
  });

  if (pad) {
    while (picks.length < count) {
      picks.push({
        matchup: 'TBD vs TBD', type: "Pick 'Em", selection: '—',
        selectionLogoSrc: null, conviction: 'Edge',
        rationale: 'More picks in the full daily board',
        confidence: null,
      });
    }
  }

  return picks;
}

// ─── Canonical leader resolver (SINGLE SOURCE OF TRUTH) ───────
// Used by Slide 2 and caption builder.
// Returns leaders using LEADER_CATEGORIES keys (homeRuns, RBIs, hits, wins, saves).

/**
 * Resolve leaders from raw data — identical logic for slides + caption.
 * @param {Object} data - { mlbLeaders: { categories: { homeRuns, RBIs, ... } } }
 * @param {number} topN - number of leaders per category (3 for slides, 1 for caption)
 * @returns {Array} resolved leader category objects
 */
export function resolveLeaders(data, topN = 3) {
  const leadersRaw = data?.mlbLeaders?.categories || {};
  const abbrevToSlug = Object.fromEntries(MLB_TEAMS.map(t => [t.abbrev, t.slug]));

  return LEADER_CATEGORIES
    .filter(cat => leadersRaw[cat.key]?.leaders?.length > 0)
    .map(cat => ({
      key: cat.key,
      label: cat.label,
      abbrev: cat.abbrev,
      leaders: leadersRaw[cat.key].leaders.slice(0, topN).map(l => {
        const slug = abbrevToSlug[l.teamAbbrev] || l.teamAbbrev?.toLowerCase() || null;
        return {
          name: l.name || '—',
          teamAbbrev: l.teamAbbrev || '',
          teamLogoSrc: slug ? getMlbEspnLogoUrl(slug) : null,
          value: l.display || String(l.value || 0),
        };
      }),
    }));
}

// ─── Content builder ───────────────────────────────────────────

export function buildDailyContent(data) {
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const champOdds = data?.mlbChampOdds ?? {};
  const seasonIntel = buildSeasonIntelLeaders(champOdds);
  const editorialBlocks = buildEditorialBlocks(intel);

  const cleaned = stripEmojis(intel?.headline || '');
  const sentences = cleaned.match(/[^.!?]*[.!?]+/g);
  const headline = sentences?.[0]?.trim() || cleaned || 'MLB Intelligence Briefing';
  const subheadline = intel?.subhead ? stripEmojis(intel.subhead) : null;

  return { headline, subheadline, editorialBlocks, seasonIntel };
}
