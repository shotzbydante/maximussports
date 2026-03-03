/**
 * maximusPicksModel — pure pick derivation functions.
 *
 * Exported:
 *   buildMaximusPicks({ games, atsLeaders, atsBySlug? }) → { atsPicks, mlPicks, totalsPicks }
 *   buildPicksSummary({ atsPicks, mlPicks, totalsPicks }) → string | null
 *   confidenceLabel(level) → 'High' | 'Medium' | 'Low'
 *
 * Logic mirrors MaximusPicks.jsx thresholds exactly so both components stay in sync.
 */

import { getTeamSlug } from './teamSlug';
import { getAtsCache } from './atsCache';

// ─── tuneable constants ────────────────────────────────────────────────────────
const ATS_EDGE_MIN  = 0.12;
const ATS_EDGE_HIGH = 0.18;
const ATS_EDGE_MED  = 0.14;
const ML_VALUE_MIN  = 0.04;
const ML_VALUE_HIGH = 0.07;
const ML_VALUE_MED  = 0.05;
const ML_AVOID_PRICE = -350;
const HOME_BUMP      = 0.02;
const ATS_ML_WEIGHT  = 0.35;
const PICKS_PER_SECTION = 5;

// ─── helpers ──────────────────────────────────────────────────────────────────

function mlToImplied(ml) {
  if (ml == null || isNaN(ml)) return null;
  if (ml > 0) return 100 / (ml + 100);
  return Math.abs(ml) / (Math.abs(ml) + 100);
}

function parseNum(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * Resolve the best ATS record for a team slug.
 * Tier 1: explicit atsBySlug map (caller-supplied, most complete)
 * Tier 2: atsLeaders.best/worst (top-10 / bottom-10 by coverPct)
 * Tier 3: per-team in-memory cache (populated for pinned teams)
 */
function getBestAtsRecord(slug, atsLeaders, atsBySlug) {
  if (!slug) return null;

  // Tier 1: caller-supplied map (explicit, consistent)
  if (atsBySlug && atsBySlug[slug]) {
    const entry = atsBySlug[slug];
    for (const key of ['last30', 'season', 'last7']) {
      const rec = entry[key];
      if (rec && rec.total > 0 && rec.coverPct != null) return { ...rec, window: key };
    }
  }

  // Tier 2: atsLeaders arrays
  if (atsLeaders) {
    const all = [...(atsLeaders.best || []), ...(atsLeaders.worst || [])];
    const row = all.find((r) => r.slug === slug);
    if (row) {
      for (const key of ['last30', 'season', 'last7']) {
        const rec = row[key];
        if (rec && rec.total > 0 && rec.coverPct != null) return { ...rec, window: key };
      }
    }
  }

  // Tier 3: per-team cache (populated when pinned team data loads)
  try {
    const cached = getAtsCache(slug);
    if (cached) {
      for (const key of ['last30', 'season', 'last7']) {
        const rec = cached[key];
        if (rec && rec.total > 0 && rec.coverPct != null) return { ...rec, window: key };
      }
    }
  } catch { /* ignore cache failures */ }

  return null;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    const t = d
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(':00', '')
      .replace(' AM', 'a')
      .replace(' PM', 'p');
    return `${day} ${t}`;
  } catch {
    return '';
  }
}

function fmtPrice(price) {
  if (price == null) return '';
  return price > 0 ? `+${price}` : String(price);
}

function windowLabel(w) {
  if (w === 'last30') return 'last 30';
  if (w === 'last7') return 'last 7';
  return 'season';
}

/** Build a W–L[–P] record string from an ATS record object. */
function fmtRecord(rec) {
  if (rec == null || rec.w == null || rec.l == null) return null;
  const push = rec.p > 0 ? `–${rec.p}` : '';
  return `${rec.w}–${rec.l}${push} (${Math.round(rec.coverPct)}%)`;
}

/** Convert edge magnitude to confidence level (0 = Low, 1 = Medium, 2 = High). */
function atsConfidenceLevel(edgeMag) {
  if (edgeMag >= ATS_EDGE_HIGH) return 2;
  if (edgeMag >= ATS_EDGE_MED)  return 1;
  return 0;
}

function mlConfidenceLevel(value) {
  if (value >= ML_VALUE_HIGH) return 2;
  if (value >= ML_VALUE_MED)  return 1;
  return 0;
}

/** Human-readable explanation referencing exact thresholds + actual edge. */
function atsConfidenceRationale(edgeMag) {
  const pp = Math.round(edgeMag * 100);
  if (edgeMag >= ATS_EDGE_HIGH)
    return `${pp}pp ATS edge (threshold ≥${Math.round(ATS_EDGE_HIGH * 100)}pp) — High confidence.`;
  if (edgeMag >= ATS_EDGE_MED)
    return `${pp}pp ATS edge (threshold ≥${Math.round(ATS_EDGE_MED * 100)}pp) — Medium confidence.`;
  return `${pp}pp ATS edge (threshold ≥${Math.round(ATS_EDGE_MIN * 100)}pp) — Low confidence.`;
}

function mlConfidenceRationale(value) {
  const pp = Math.round(value * 100);
  if (value >= ML_VALUE_HIGH)
    return `+${pp}pp vs implied odds (threshold ≥${Math.round(ML_VALUE_HIGH * 100)}pp) — High confidence.`;
  if (value >= ML_VALUE_MED)
    return `+${pp}pp vs implied odds (threshold ≥${Math.round(ML_VALUE_MED * 100)}pp) — Medium confidence.`;
  return `+${pp}pp vs implied odds (threshold ≥${Math.round(ML_VALUE_MIN * 100)}pp) — Low confidence.`;
}

// ─── public confidence label ───────────────────────────────────────────────────

export function confidenceLabel(level) {
  if (level >= 2) return 'High';
  if (level >= 1) return 'Medium';
  return 'Low';
}

// ─── spread picks ─────────────────────────────────────────────────────────────

function buildSpreadPicks(games, atsLeaders, atsBySlug) {
  const picks = [];

  for (const game of games) {
    if (!game.spread && game.spread !== 0) continue;
    const spreadNum = parseNum(game.spread);
    if (spreadNum == null) continue;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);

    const homeAts = getBestAtsRecord(homeSlug, atsLeaders, atsBySlug);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders, atsBySlug);

    if (import.meta.env?.DEV && (!homeAts || !awayAts)) {
      console.debug('[Picks:ATS] no record —', game.awayTeam, '@', game.homeTeam,
        '| home:', homeSlug, homeAts ? 'ok' : 'missing',
        '| away:', awaySlug, awayAts ? 'ok' : 'missing');
    }

    if (!homeAts || !awayAts) continue;

    const homePct = homeAts.coverPct / 100;
    const awayPct = awayAts.coverPct / 100;
    const edge = homePct - awayPct;

    if (Math.abs(edge) < ATS_EDGE_MIN) continue;

    const pickHome = edge > 0;
    const pickTeam = pickHome ? game.homeTeam : game.awayTeam;
    const pickAts  = pickHome ? homeAts : awayAts;
    const oppAts   = pickHome ? awayAts : homeAts;

    const homeIsFav = spreadNum < 0;
    const isBigFav  = Math.abs(spreadNum) >= 10;
    if (isBigFav && homeIsFav && pickHome && Math.abs(edge) < ATS_EDGE_HIGH) continue;

    // Spread label from pick-team perspective
    const spreadLabel = pickHome
      ? (spreadNum < 0 ? spreadNum : `+${spreadNum}`)
      : (spreadNum > 0 ? `-${spreadNum}` : `+${Math.abs(spreadNum)}`);

    const win = windowLabel(pickAts.window);
    const edgeMag = Math.abs(edge);

    // Build rationale lines with W-L records when available
    const pickRecord = fmtRecord(pickAts) ?? `${Math.round(pickAts.coverPct)}%`;
    const oppRecord  = fmtRecord(oppAts)  ?? `${Math.round(oppAts.coverPct)}%`;

    // Bet slip framing
    const pickCoverPct = Math.round(pickAts.coverPct);
    const oppCoverPct  = Math.round(oppAts.coverPct);
    const edgePpVal    = Math.round(edgeMag * 100);
    const whyValue = `${pickCoverPct}% ATS cover vs opponent's ${oppCoverPct}% — +${edgePpVal}pp edge.`;

    const slipTips = [];
    if (Math.abs(spreadNum) >= 10) {
      slipTips.push('Heavy line — value may compress if the spread shifts further.');
    }

    picks.push({
      key:     game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug,
      awaySlug,
      time:       fmtTime(game.startTime || game.commence_time),
      pickTeam,
      pickLine:   `${pickTeam} ${spreadLabel > 0 ? '+' : ''}${spreadLabel}`,
      confidence: atsConfidenceLevel(edgeMag),
      edgeMag,
      // Edge breakdown — ATS has no single market-implied equivalent
      modelPct:         Math.round(pickAts.coverPct),
      marketImpliedPct: null,
      edgePp:           null,
      rationale: [
        `ATS form (${win}): ${pickRecord}`,
        `Opponent ATS (${win}): ${oppRecord}`,
      ],
      confidenceRationale: atsConfidenceRationale(edgeMag),
      whyValue,
      slipTips,
    });
  }

  return picks.sort((a, b) => b.edgeMag - a.edgeMag).slice(0, PICKS_PER_SECTION);
}

// ─── moneyline picks ──────────────────────────────────────────────────────────

function buildMoneylinePicks(games, atsLeaders, atsBySlug) {
  const picks = [];

  for (const game of games) {
    if (!game.moneyline) continue;
    const [rawHome, rawAway] = String(game.moneyline).split('/');
    const homeML = parseNum(rawHome);
    const awayML = parseNum(rawAway);
    if (homeML == null || awayML == null) continue;

    const homeImplied = mlToImplied(homeML);
    const awayImplied = mlToImplied(awayML);
    if (!homeImplied || !awayImplied) continue;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);

    const homeAts = getBestAtsRecord(homeSlug, atsLeaders, atsBySlug);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders, atsBySlug);

    const homeCover = homeAts ? homeAts.coverPct / 100 : 0.5;
    const awayCover = awayAts ? awayAts.coverPct / 100 : 0.5;
    const atsDiff = homeCover - awayCover;

    const homeModelProb = clamp(0.5 + atsDiff * ATS_ML_WEIGHT + HOME_BUMP, 0.35, 0.75);
    const awayModelProb = 1 - homeModelProb;

    const homeValue = homeModelProb - homeImplied;
    const awayValue = awayModelProb - awayImplied;

    let pickTeam, pickML, pickProb, impliedPct, value;

    if (homeValue >= awayValue && homeValue >= ML_VALUE_MIN) {
      if (homeML <= ML_AVOID_PRICE) continue;
      pickTeam  = game.homeTeam;
      pickML    = homeML;
      pickProb  = homeModelProb;
      impliedPct = homeImplied;
      value     = homeValue;
    } else if (awayValue >= ML_VALUE_MIN) {
      if (awayML <= ML_AVOID_PRICE) continue;
      pickTeam  = game.awayTeam;
      pickML    = awayML;
      pickProb  = awayModelProb;
      impliedPct = awayImplied;
      value     = awayValue;
    } else {
      continue;
    }

    const atsRec = homeAts || awayAts;
    const win = atsRec ? windowLabel(atsRec.window) : '';

    // Bet slip framing
    const modelPctRounded   = Math.round(pickProb * 100);
    const marketPctRounded  = Math.round(impliedPct * 100);
    const edgePpRounded     = Math.round(value * 100);
    const whyValue = `We price this at ${modelPctRounded}%, market implies ${marketPctRounded}% — +${edgePpRounded}pp value gap.`;

    const slipTips = [];
    if (pickML >= 600) {
      slipTips.push('Long odds — small stake recommended due to variance on underdogs.');
    }

    picks.push({
      key:     game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug,
      awaySlug,
      time:       fmtTime(game.startTime || game.commence_time),
      pickTeam,
      pickLine:   `${pickTeam} ${fmtPrice(pickML)}`,
      confidence: mlConfidenceLevel(value),
      value,
      modelPct:         modelPctRounded,
      marketImpliedPct: marketPctRounded,
      edgePp:           edgePpRounded,
      rationale: [
        `Based on market line + recent ATS form${win ? ` (${win})` : ''}.`,
      ],
      confidenceRationale: mlConfidenceRationale(value),
      whyValue,
      slipTips,
    });
  }

  return picks.sort((a, b) => b.value - a.value).slice(0, PICKS_PER_SECTION);
}

// ─── totals picks ─────────────────────────────────────────────────────────────

function buildTotalsPicks(games) {
  const picks = [];

  for (const game of games) {
    if (!game.total) continue;
    const marketTotal = parseNum(game.total);
    if (marketTotal == null) continue;

    const overPrice  = game.overPrice  ? fmtPrice(parseNum(game.overPrice))  : null;
    const underPrice = game.underPrice ? fmtPrice(parseNum(game.underPrice)) : null;
    const priceNote  =
      overPrice || underPrice ? ` (O ${overPrice ?? '—'} / U ${underPrice ?? '—'})` : '';

    picks.push({
      key:     game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug: getTeamSlug(game.homeTeam),
      awaySlug: getTeamSlug(game.awayTeam),
      time:       fmtTime(game.startTime || game.commence_time),
      pickTeam:   null,
      pickLine:   `O/U ${marketTotal}${priceNote}`,
      confidence: 0,
      lineValue:  marketTotal,
      modelPct:         null,
      marketImpliedPct: null,
      edgePp:           null,
      rationale: ['Totals are informational. No projection delta model yet.'],
      confidenceRationale: 'Totals are informational. No projection delta model yet.',
      whyValue: null,
      slipTips: [],
    });
  }

  return picks.sort((a, b) => b.lineValue - a.lineValue).slice(0, PICKS_PER_SECTION);
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Build all Maximus picks from Home state data. Pure — no side effects, no fetches.
 *
 * @param {{ games: object[], atsLeaders: { best: object[], worst: object[] }, atsBySlug?: Record<string,object>|null }} opts
 * @returns {{ atsPicks: object[], mlPicks: object[], totalsPicks: object[] }}
 */
export function buildMaximusPicks({
  games = [],
  atsLeaders = { best: [], worst: [] },
  atsBySlug: providedAtsBySlug = null,
} = {}) {
  // Build a consistent atsBySlug map from atsLeaders when caller hasn't supplied one.
  // This ensures predictable, timing-independent ATS lookup behavior.
  const atsBySlug = providedAtsBySlug ?? (() => {
    const all = [...(atsLeaders.best ?? []), ...(atsLeaders.worst ?? [])];
    if (all.length === 0) return null;
    const map = {};
    for (const row of all) {
      if (!row.slug) continue;
      map[row.slug] = {
        season: row.season ?? row.rec ?? null,
        last30: row.last30 ?? row.rec ?? null,
        last7:  row.last7  ?? row.rec ?? null,
      };
    }
    return Object.keys(map).length > 0 ? map : null;
  })();

  if (import.meta.env?.DEV) {
    const gamesWithSpread = games.filter((g) => g.spread != null).length;
    const atsLeaderCount  = (atsLeaders.best?.length ?? 0) + (atsLeaders.worst?.length ?? 0);
    const atsSlugCount    = atsBySlug ? Object.keys(atsBySlug).length : 0;
    console.debug(
      '[Picks] games:', games.length,
      '| with spread:', gamesWithSpread,
      '| ats leaders:', atsLeaderCount,
      '| atsBySlug keys:', atsSlugCount,
    );
  }

  return {
    atsPicks:    buildSpreadPicks(games, atsLeaders, atsBySlug),
    mlPicks:     buildMoneylinePicks(games, atsLeaders, atsBySlug),
    totalsPicks: buildTotalsPicks(games),
  };
}

/**
 * Build a 1–2 sentence picks summary for the top briefing.
 * Uses "lean" language — never "guarantee" or "lock".
 *
 * @param {{ atsPicks: object[], mlPicks: object[], totalsPicks: object[] }} picks
 * @returns {string | null}
 */
export function buildPicksSummary({ atsPicks = [], mlPicks = [], totalsPicks = [] } = {}) {
  const topAts = atsPicks[0];
  const topMl  = mlPicks[0];

  if (!topAts && !topMl) {
    if (totalsPicks.length > 0) {
      return 'No strong ATS or moneyline leans today. Totals are available as informational lines only.';
    }
    return null;
  }

  const parts = [];
  if (topAts) parts.push(`${topAts.pickLine} (${confidenceLabel(topAts.confidence)})`);
  if (topMl)  parts.push(`${topMl.pickLine} (${confidenceLabel(topMl.confidence)})`);

  let sentence = `Today's strongest leans: ${parts.join(' and ')}.`;
  if (totalsPicks.length > 0) sentence += ' Totals are informational only.';
  return sentence;
}
