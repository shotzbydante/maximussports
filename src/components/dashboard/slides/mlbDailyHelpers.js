/**
 * mlbDailyHelpers — Shared data helpers for MLB Daily Briefing carousel slides.
 *
 * Extracted from MlbSingleSlide.jsx so all 3 carousel slides can share
 * the same data pipeline without duplication.
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams.js';
import { getTeamProjection } from '../../../data/mlb/seasonModel.js';
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
