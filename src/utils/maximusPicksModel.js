/**
 * maximusPicksModel — pure pick derivation functions.
 *
 * Exported:
 *   buildMaximusPicks({ games, atsLeaders }) → { atsPicks, mlPicks, totalsPicks }
 *   buildPicksSummary({ atsPicks, mlPicks, totalsPicks }) → string | null
 *   confidenceLabel(level) → 'High' | 'Med' | 'Low'
 *
 * Logic mirrors MaximusPicks.jsx thresholds exactly so both components stay in sync.
 */

import { getTeamSlug } from './teamSlug';

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

function getBestAtsRecord(slug, atsLeaders) {
  if (!slug || !atsLeaders) return null;
  const all = [...(atsLeaders.best || []), ...(atsLeaders.worst || [])];
  const row = all.find((r) => r.slug === slug);
  if (!row) return null;
  for (const key of ['last30', 'season', 'last7']) {
    const rec = row[key];
    if (rec && rec.total > 0 && rec.coverPct != null) return { ...rec, window: key };
  }
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

/** Convert edge magnitude to confidence level (0 = Low, 1 = Med, 2 = High). */
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

/** Human-readable explanation for why confidence is High / Med / Low. */
function atsConfidenceRationale(edgeMag) {
  if (edgeMag >= ATS_EDGE_HIGH)
    return `Edge ≥${Math.round(ATS_EDGE_HIGH * 100)}pp vs opponent — High confidence.`;
  if (edgeMag >= ATS_EDGE_MED)
    return `Edge ≥${Math.round(ATS_EDGE_MED * 100)}pp vs opponent — Medium confidence.`;
  return `Edge ≥${Math.round(ATS_EDGE_MIN * 100)}pp vs opponent — Low confidence.`;
}

function mlConfidenceRationale(value) {
  if (value >= ML_VALUE_HIGH)
    return `Model edge ≥${Math.round(ML_VALUE_HIGH * 100)}pp vs implied odds — High confidence.`;
  if (value >= ML_VALUE_MED)
    return `Model edge ≥${Math.round(ML_VALUE_MED * 100)}pp vs implied odds — Medium confidence.`;
  return `Model edge ≥${Math.round(ML_VALUE_MIN * 100)}pp vs implied odds — Low confidence.`;
}

// ─── public confidence label ───────────────────────────────────────────────────

export function confidenceLabel(level) {
  if (level >= 2) return 'High';
  if (level >= 1) return 'Med';
  return 'Low';
}

// ─── spread picks ─────────────────────────────────────────────────────────────

function buildSpreadPicks(games, atsLeaders) {
  const picks = [];

  for (const game of games) {
    if (!game.spread && game.spread !== 0) continue;
    const spreadNum = parseNum(game.spread);
    if (spreadNum == null) continue;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);

    const homeAts = getBestAtsRecord(homeSlug, atsLeaders);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders);
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
      // Edge breakdown — ATS has no market-implied equivalent
      modelPct:         Math.round(pickAts.coverPct),
      marketImpliedPct: null,
      edgePp:           null,
      rationale: [
        `ATS form (${win}): ${Math.round(pickAts.coverPct)}% cover`,
        `Opponent ATS (${win}): ${Math.round(oppAts.coverPct)}% cover`,
      ],
      confidenceRationale: atsConfidenceRationale(edgeMag),
    });
  }

  return picks.sort((a, b) => b.edgeMag - a.edgeMag).slice(0, PICKS_PER_SECTION);
}

// ─── moneyline picks ──────────────────────────────────────────────────────────

function buildMoneylinePicks(games, atsLeaders) {
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

    const homeAts = getBestAtsRecord(homeSlug, atsLeaders);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders);

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
      modelPct:         Math.round(pickProb * 100),
      marketImpliedPct: Math.round(impliedPct * 100),
      edgePp:           Math.round(value * 100),
      rationale: [
        `Based on market line + recent ATS form${win ? ` (${win})` : ''}.`,
      ],
      confidenceRationale: mlConfidenceRationale(value),
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
    });
  }

  return picks.sort((a, b) => b.lineValue - a.lineValue).slice(0, PICKS_PER_SECTION);
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Build all Maximus picks from Home state data. Pure — no side effects, no fetches.
 *
 * @param {{ games: object[], atsLeaders: { best: object[], worst: object[] } }} opts
 * @returns {{ atsPicks: object[], mlPicks: object[], totalsPicks: object[] }}
 */
export function buildMaximusPicks({ games = [], atsLeaders = { best: [], worst: [] } } = {}) {
  return {
    atsPicks:    buildSpreadPicks(games, atsLeaders),
    mlPicks:     buildMoneylinePicks(games, atsLeaders),
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
