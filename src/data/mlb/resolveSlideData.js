/**
 * resolveSlideData — SINGLE SOURCE OF TRUTH for MLB Daily Briefing picks + leaders.
 *
 * These functions are the CANONICAL resolvers used by:
 *   - MlbDailySlide1 (picks)
 *   - MlbDailySlide2 (picks + leaders)
 *   - buildMlbCaption (picks + leaders)
 *
 * NO component should derive picks or leaders independently.
 * If slides show data, caption shows data. No divergence possible.
 *
 * These functions live in src/data/ (not src/components/) so they can be
 * imported by both client-side slide components AND server-side API routes
 * (e.g., autopost-mlb-daily.js → buildMlbCaption → here).
 */

import { MLB_TEAMS } from '../../sports/mlb/teams.js';
import { LEADER_CATEGORIES } from './seasonLeaders.js';

// ── Pick conviction formatter ─────────────────────────────────────────────

function fmtConviction(tier) {
  if (!tier) return 'Edge';
  if (tier === 'high') return 'High';
  if (tier === 'medium-high') return 'Med-High';
  if (tier === 'medium') return 'Medium';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// ── Logo URL builder (self-hosted, no external deps) ──────────────────────

const VALID_SLUGS = new Set([
  'nyy', 'bos', 'tor', 'tb', 'bal',
  'cle', 'min', 'det', 'cws', 'kc',
  'hou', 'sea', 'tex', 'laa', 'oak',
  'atl', 'nym', 'phi', 'mia', 'wsh',
  'chc', 'mil', 'stl', 'pit', 'cin',
  'lad', 'sd', 'sf', 'ari', 'col',
]);

function logoUrl(slug) {
  if (!slug || !VALID_SLUGS.has(slug)) return null;
  return `/logos/mlb/${slug}.png`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CANONICAL PICK RESOLVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve picks from raw data — identical logic for slides + caption.
 *
 * @param {Object} data - { mlbPicks, canonicalPicks } (raw from API)
 * @param {number} count - max picks to return (3 for Slide 1/caption, 4 for Slide 2)
 * @param {boolean} pad - if true, pad to `count` with TBD placeholders (Slide 2 only)
 * @returns {Array} resolved pick objects: { matchup, type, selection, selectionLogoSrc, conviction, rationale, confidence }
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
    const conviction = fmtConviction(p.confidence);
    const edgePct = p.pick?.edgePercent || p.confidenceScore;
    const rationale = edgePct
      ? `Model favors ${(selection || '').split(' ').pop()} with a ${Number(edgePct).toFixed(1)}% edge.`
      : `Model edge: ${conviction.toLowerCase()} conviction`;
    const pickSide = p.pick?.side;
    const selectedTeam = pickSide === 'away' ? p.matchup?.awayTeam : p.matchup?.homeTeam;
    const selectionLogoSrc = logoUrl(selectedTeam?.slug || null);
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

// ═══════════════════════════════════════════════════════════════════════════
//  CANONICAL LEADER RESOLVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve leaders from raw data — identical logic for slides + caption.
 * Uses LEADER_CATEGORIES keys: homeRuns, RBIs, hits, wins, saves.
 *
 * @param {Object} data - { mlbLeaders: { categories: { homeRuns, RBIs, ... } } }
 * @param {number} topN - number of leaders per category (3 for slides, 1 for caption)
 * @returns {Array} resolved leader category objects: { key, label, abbrev, leaders: [...] }
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
          teamLogoSrc: logoUrl(slug),
          value: l.display || String(l.value || 0),
        };
      }),
    }));
}
