/**
 * maximusPicksModel — pure pick derivation functions.
 *
 * Exported:
 *   buildMaximusPicks({ games, atsLeaders, atsBySlug? }) → { atsPicks, mlPicks, totalsPicks }
 *   buildPicksSummary({ atsPicks, mlPicks, totalsPicks }) → string | null
 *   confidenceLabel(level) → 'High' | 'Medium' | 'Low'
 *
 * ATS picks use a 2-tier system:
 *   Tier 1 — both teams have ATS records; full differential analysis.
 *   Tier 2 — only one team's ATS record available; requires coverPct ≥ 60% + n ≥ 8.
 *            Confidence is capped at Medium. UI labels these "PARTIAL SIGNAL".
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
const ML_AVOID_PRICE     = -350;
const HOME_BUMP          = 0.02;
const ATS_ML_WEIGHT      = 0.35;
const PICKS_PER_SECTION  = 5;

// "Always-rich" slate: fill columns to TARGET_SHOW with watch items when leans are sparse
const TARGET_SHOW = 4;

// Tier 2 (partial-signal) ATS thresholds
const ATS_PARTIAL_COVER_MIN  = 0.60; // team must cover ≥ 60%
const ATS_PARTIAL_SAMPLE_MIN = 8;    // need ≥ 8 recorded games for the window

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

  if (atsBySlug && atsBySlug[slug]) {
    const entry = atsBySlug[slug];
    for (const key of ['last30', 'season', 'last7']) {
      const rec = entry[key];
      if (rec && rec.total > 0 && rec.coverPct != null) return { ...rec, window: key };
    }
  }

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

/**
 * Return the team-specific spread (as a signed number) for a given game.
 * Prefers the explicit homeSpread/awaySpread fields added by the fixed extractOdds.
 * Falls back to the legacy `game.spread` string (home-team-perspective by convention).
 *
 * @param {object} game - merged game object
 * @param {boolean} isHome - true for the home team, false for the away team
 * @returns {{ spread: number|null, source: string|null }}
 */
function getTeamSpread(game, isHome) {
  if (isHome) {
    if (game.homeSpread != null) return { spread: game.homeSpread, source: 'homeSpread' };
    if (game.awaySpread != null) return { spread: -game.awaySpread, source: 'derived_from_awaySpread' };
  } else {
    if (game.awaySpread != null) return { spread: game.awaySpread, source: 'awaySpread' };
    if (game.homeSpread != null) return { spread: -game.homeSpread, source: 'derived_from_homeSpread' };
  }
  // Legacy fallback: `game.spread` is treated as home team's spread
  const n = parseNum(game.spread);
  if (n == null) return { spread: null, source: null };
  return { spread: isHome ? n : -n, source: 'legacy_spread' };
}

/**
 * Format a spread number with mandatory sign.
 * Always returns a string: "+6.5", "-3", "+0" (for true pick-ems).
 * Returns null for null input.
 */
function fmtSpread(n) {
  if (n == null) return null;
  if (n > 0) return `+${n}`;
  if (n === 0) return '+0';
  return String(n); // negative numbers already have '-'
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

function fmtRecord(rec) {
  if (rec == null || rec.w == null || rec.l == null) return null;
  const push = rec.p > 0 ? `–${rec.p}` : '';
  return `${rec.w}–${rec.l}${push} (${Math.round(rec.coverPct)}%)`;
}

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

// ─── spread picks (2-tier) ────────────────────────────────────────────────────

function buildSpreadPicks(games, atsLeaders, atsBySlug) {
  const picks = [];

  for (const game of games) {
    // Require at least one spread field to be present (any numeric form)
    const hasAnySpread =
      game.homeSpread != null ||
      game.awaySpread != null ||
      (game.spread != null && game.spread !== '');
    if (!hasAnySpread) continue;

    // Resolve the canonical home-team spread (number or null)
    const { spread: homeSpreadNum, source: homeSpreadSource } = getTeamSpread(game, true);
    // We still need a numeric spread for the big-fav filter; allow null (shows as unavailable)
    const spreadMagnitude = homeSpreadNum != null ? Math.abs(homeSpreadNum) : null;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);
    const homeAts  = getBestAtsRecord(homeSlug, atsLeaders, atsBySlug);
    const awayAts  = getBestAtsRecord(awaySlug, atsLeaders, atsBySlug);

    if (import.meta.env?.DEV) {
      if (!homeAts || !awayAts) {
        console.debug('[Picks:ATS] partial record —', game.awayTeam, '@', game.homeTeam,
          '| home:', homeSlug, homeAts ? 'ok' : 'missing',
          '| away:', awaySlug, awayAts ? 'ok' : 'missing');
      }
      console.debug('[Picks:ATS] spread —', game.awayTeam, '@', game.homeTeam,
        '| homeSpread:', homeSpreadNum, '| source:', homeSpreadSource,
        '| raw game.spread:', game.spread,
        '| game.homeSpread:', game.homeSpread, '| game.awaySpread:', game.awaySpread);
    }

    const sharedBase = {
      key:      game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup:  `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug,
      awaySlug,
      time:     fmtTime(game.startTime || game.commence_time),
      pickType: 'ats',
      marketImpliedPct: null,
      edgePp:           null,
    };

    // ── Tier 1: full-differential pick (both teams have ATS records) ──────────
    if (homeAts && awayAts) {
      const homePct = homeAts.coverPct / 100;
      const awayPct = awayAts.coverPct / 100;
      const edge    = homePct - awayPct;
      if (Math.abs(edge) < ATS_EDGE_MIN) continue;

      const pickHome = edge > 0;
      const pickTeam = pickHome ? game.homeTeam : game.awayTeam;
      const pickAts  = pickHome ? homeAts : awayAts;
      const oppAts   = pickHome ? awayAts : homeAts;

      // Big-fav filter: skip if spread magnitude is known and is heavy
      const homeIsFav = homeSpreadNum != null ? homeSpreadNum < 0 : false;
      const isBigFav  = spreadMagnitude != null && spreadMagnitude >= 10;
      if (isBigFav && homeIsFav && pickHome && Math.abs(edge) < ATS_EDGE_HIGH) continue;

      // Resolve team-specific spread (number or null)
      const { spread: teamSpreadNum } = getTeamSpread(game, pickHome);
      const spreadDisplay = fmtSpread(teamSpreadNum); // "+6.5", "-3", "+0", or null

      const win          = windowLabel(pickAts.window);
      const edgeMag      = Math.abs(edge);
      const pickRecord   = fmtRecord(pickAts) ?? `${Math.round(pickAts.coverPct)}%`;
      const oppRecord    = fmtRecord(oppAts)  ?? `${Math.round(oppAts.coverPct)}%`;
      const pickCoverPct = Math.round(pickAts.coverPct);
      const oppCoverPct  = Math.round(oppAts.coverPct);
      const edgePpVal    = Math.round(edgeMag * 100);

      const slipTips = [];
      if (spreadMagnitude != null && spreadMagnitude >= 10) {
        slipTips.push('Heavy line — value may compress if the spread shifts further.');
      }

      const hasLine = spreadDisplay != null;
      picks.push({
        ...sharedBase,
        pickTeam,
        spread:   teamSpreadNum,  // number|null — used by UI for "unavailable" state
        pickLine: hasLine
          ? `${pickTeam} ${spreadDisplay}`
          : `${pickTeam} ATS —`,
        confidence:  atsConfidenceLevel(edgeMag),
        edgeMag,
        modelPct:    Math.round(pickAts.coverPct),
        rationale: [
          `ATS form (${win}): ${pickRecord}`,
          `Opponent ATS (${win}): ${oppRecord}`,
        ],
        confidenceRationale: atsConfidenceRationale(edgeMag),
        whyValue: hasLine
          ? `${pickCoverPct}% ATS cover vs opponent's ${oppCoverPct}% — +${edgePpVal}pp edge.`
          : `${pickCoverPct}% ATS cover vs opponent's ${oppCoverPct}% — +${edgePpVal}pp edge. Spread line unavailable.`,
        slipTips,
        partial: false,
      });
      continue;
    }

    // ── Tier 2: partial single-team pick (one team's ATS record only) ─────────
    const singleAts   = homeAts ?? awayAts;
    if (!singleAts) continue; // no data at all

    const pickIsHome  = !!homeAts;
    const sampleSize  = (singleAts.w ?? 0) + (singleAts.l ?? 0);
    if (singleAts.coverPct < ATS_PARTIAL_COVER_MIN * 100) continue;
    if (sampleSize < ATS_PARTIAL_SAMPLE_MIN) continue;

    const pickTeamP = pickIsHome ? game.homeTeam : game.awayTeam;

    // Resolve team-specific spread (number or null)
    const { spread: teamSpreadNumP } = getTeamSpread(game, pickIsHome);
    const spreadDisplayP = fmtSpread(teamSpreadNumP);

    const win        = windowLabel(singleAts.window);
    const pickRecord = fmtRecord(singleAts) ?? `${Math.round(singleAts.coverPct)}%`;
    // Cap confidence: 70%+ → Medium (1), below → Low (0)
    const rawConf   = singleAts.coverPct >= 70 ? 1 : 0;

    const slipTips = [];
    if (spreadMagnitude != null && spreadMagnitude >= 10) {
      slipTips.push('Heavy line — value may compress if the spread shifts further.');
    }

    const hasLineP = spreadDisplayP != null;
    picks.push({
      ...sharedBase,
      pickTeam: pickTeamP,
      spread:   teamSpreadNumP,  // number|null
      pickLine: hasLineP
        ? `${pickTeamP} ${spreadDisplayP}`
        : `${pickTeamP} ATS —`,
      confidence: rawConf,
      edgeMag: 0, // no differential available
      modelPct: Math.round(singleAts.coverPct),
      rationale: [
        `ATS form (${win}): ${pickRecord}`,
        'Opponent ATS data unavailable.',
      ],
      confidenceRationale: `Partial ATS signal (team-only). Confidence capped at ${confidenceLabel(rawConf)}.`,
      whyValue: hasLineP
        ? `Team covers ${Math.round(singleAts.coverPct)}% ATS (${win}, n=${sampleSize}). Opponent ATS unavailable.`
        : `Team covers ${Math.round(singleAts.coverPct)}% ATS (${win}, n=${sampleSize}). Opponent ATS unavailable. Spread line unavailable.`,
      slipTips,
      partial: true,
    });
  }

  // Tier 1 picks first (by edgeMag), then Tier 2
  return picks
    .sort((a, b) => {
      if (a.partial !== b.partial) return a.partial ? 1 : -1;
      return b.edgeMag - a.edgeMag;
    })
    .slice(0, PICKS_PER_SECTION);
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
    const atsDiff   = homeCover - awayCover;

    const homeModelProb = clamp(0.5 + atsDiff * ATS_ML_WEIGHT + HOME_BUMP, 0.35, 0.75);
    const awayModelProb = 1 - homeModelProb;

    const homeValue = homeModelProb - homeImplied;
    const awayValue = awayModelProb - awayImplied;

    let pickTeam, pickML, pickProb, impliedPct, value;

    if (homeValue >= awayValue && homeValue >= ML_VALUE_MIN) {
      if (homeML <= ML_AVOID_PRICE) continue;
      pickTeam   = game.homeTeam;
      pickML     = homeML;
      pickProb   = homeModelProb;
      impliedPct = homeImplied;
      value      = homeValue;
    } else if (awayValue >= ML_VALUE_MIN) {
      if (awayML <= ML_AVOID_PRICE) continue;
      pickTeam   = game.awayTeam;
      pickML     = awayML;
      pickProb   = awayModelProb;
      impliedPct = awayImplied;
      value      = awayValue;
    } else {
      continue;
    }

    const atsRec = homeAts || awayAts;
    const win    = atsRec ? windowLabel(atsRec.window) : '';

    const modelPctRounded  = Math.round(pickProb * 100);
    const marketPctRounded = Math.round(impliedPct * 100);
    const edgePpRounded    = Math.round(value * 100);
    const mlPriceLabel     = fmtPrice(pickML);

    // "ML" is now explicit in the pick line so share/copy text is unambiguous
    const pickLine = `${pickTeam} ML ${mlPriceLabel}`;
    const whyValue = `We price this at ${modelPctRounded}%, market implies ${marketPctRounded}% — +${edgePpRounded}pp value gap.`;

    const slipTips = [];
    if (pickML >= 600) {
      slipTips.push('Long odds — small stake recommended due to variance on underdogs.');
    }

    picks.push({
      key:      game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup:  `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug,
      awaySlug,
      time:     fmtTime(game.startTime || game.commence_time),
      pickType: 'ml',
      pickTeam,
      pickLine,
      mlPriceLabel,
      confidence:      mlConfidenceLevel(value),
      value,
      modelPct:        modelPctRounded,
      marketImpliedPct: marketPctRounded,
      edgePp:          edgePpRounded,
      rationale: [
        `Based on market line + recent ATS form${win ? ` (${win})` : ''}.`,
      ],
      confidenceRationale: mlConfidenceRationale(value),
      whyValue,
      slipTips,
      partial: false,
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
      key:      game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup:  `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug: getTeamSlug(game.homeTeam),
      awaySlug: getTeamSlug(game.awayTeam),
      time:     fmtTime(game.startTime || game.commence_time),
      pickType: 'total',
      pickTeam: null,
      pickLine: `O/U ${marketTotal}${priceNote}`,
      confidence:      0,
      lineValue:       marketTotal,
      modelPct:        null,
      marketImpliedPct: null,
      edgePp:          null,
      rationale: ['Totals are informational. No projection delta model yet.'],
      confidenceRationale: 'Totals are informational. No projection delta model yet.',
      whyValue: null,
      slipTips: [],
      partial:  false,
    });
  }

  return picks.sort((a, b) => b.lineValue - a.lineValue).slice(0, PICKS_PER_SECTION);
}

// ─── watch item helpers ───────────────────────────────────────────────────────

/**
 * Canonical de-dupe key. Uses homeTeam+awayTeam because lean pick objects
 * don't preserve the raw gameId, whereas game objects always have both teams.
 */
function baseGameKey(obj) {
  return `${obj.homeTeam}-${obj.awayTeam}`;
}

/**
 * Shared base object for a "watch" (no-edge) item — game has lines but no qualified lean.
 */
function buildWatchBase(game, pickType) {
  return {
    key:                `${baseGameKey(game)}-watch`,
    matchup:            `${game.awayTeam} @ ${game.homeTeam}`,
    homeTeam:           game.homeTeam,
    awayTeam:           game.awayTeam,
    homeSlug:           getTeamSlug(game.homeTeam),
    awaySlug:           getTeamSlug(game.awayTeam),
    time:               fmtTime(game.startTime || game.commence_time),
    pickType,
    itemType:           'watch',   // distinguishes from 'lean'
    pickTeam:           null,
    confidence:         -1,        // sentinel — no edge derived
    edgeMag:            0,
    modelPct:           null,
    marketImpliedPct:   null,
    edgePp:             null,
    rationale:          [],
    confidenceRationale: null,
    whyValue:           null,
    slipTips:           [],
    partial:            false,
  };
}

/**
 * Build ATS watch items from games that have a spread but no qualified lean.
 * Shows the favorite's spread as the displayable line.
 */
function buildSpreadWatches(games, leanKeys, needed) {
  const watches = [];
  for (const game of games) {
    if (watches.length >= needed) break;
    if (leanKeys.has(baseGameKey(game))) continue;
    const hasAnySpread =
      game.homeSpread != null || game.awaySpread != null ||
      (game.spread != null && game.spread !== '');
    if (!hasAnySpread) continue;

    const { spread: homeSpreadNum } = getTeamSpread(game, true);
    const { spread: awaySpreadNum } = getTeamSpread(game, false);
    const favIsHome = homeSpreadNum != null && homeSpreadNum < 0;
    const favTeam   = favIsHome ? game.homeTeam : game.awayTeam;
    const favSpread = favIsHome ? fmtSpread(homeSpreadNum) : fmtSpread(awaySpreadNum ?? null);
    const pickLine  = favSpread ? `${favTeam} ${favSpread}` : `${game.awayTeam} @ ${game.homeTeam}`;

    watches.push({
      ...buildWatchBase(game, 'ats'),
      spread:      homeSpreadNum,
      pickLine,
      watchReason: 'Lines posted. Monitoring for ATS edge.',
    });
  }
  return watches;
}

/**
 * Build Moneyline watch items from games that have a ML but no qualified lean.
 */
function buildMoneylineWatches(games, leanKeys, needed) {
  const watches = [];
  for (const game of games) {
    if (watches.length >= needed) break;
    if (leanKeys.has(baseGameKey(game))) continue;
    if (!game.moneyline) continue;
    const [rawHome, rawAway] = String(game.moneyline).split('/');
    const homeML = parseNum(rawHome);
    const awayML = parseNum(rawAway);
    if (homeML == null || awayML == null) continue;

    watches.push({
      ...buildWatchBase(game, 'ml'),
      pickLine:    `${game.awayTeam} ML ${fmtPrice(awayML)} / ${game.homeTeam} ML ${fmtPrice(homeML)}`,
      watchReason: 'Lines posted. Monitoring for value edge.',
    });
  }
  return watches;
}

/**
 * Build Totals watch items from games that have a total but no qualified lean.
 */
function buildTotalsWatches(games, leanKeys, needed) {
  const watches = [];
  for (const game of games) {
    if (watches.length >= needed) break;
    if (leanKeys.has(baseGameKey(game))) continue;
    if (!game.total) continue;
    const marketTotal = parseNum(game.total);
    if (marketTotal == null) continue;
    watches.push({
      ...buildWatchBase(game, 'total'),
      pickLine:  `O/U ${marketTotal}`,
      lineValue: marketTotal,
      watchReason: 'Line posted. Informational.',
    });
  }
  return watches;
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
    const gamesWithSpread    = games.filter((g) => g.spread != null || g.homeSpread != null).length;
    const gamesWithML        = games.filter((g) => g.moneyline != null).length;
    const atsLeaderCount     = (atsLeaders.best?.length ?? 0) + (atsLeaders.worst?.length ?? 0);
    const atsSlugCount       = atsBySlug ? Object.keys(atsBySlug).length : 0;
    console.debug(
      '[Picks] games:', games.length,
      '| with spread:', gamesWithSpread,
      '| with ML:', gamesWithML,
      '| ats leaders:', atsLeaderCount,
      '| atsBySlug keys:', atsSlugCount,
    );
    // First-game detailed spread diagnostic
    if (games.length > 0) {
      const g = games[0];
      console.debug(
        '[Picks:SpreadCheck] first game:', g.awayTeam, '@', g.homeTeam,
        '| game.spread:', g.spread,
        '| game.homeSpread:', g.homeSpread,
        '| game.awaySpread:', g.awaySpread,
      );
    }
  }

  const rawAts    = buildSpreadPicks(games, atsLeaders, atsBySlug);
  const rawMl     = buildMoneylinePicks(games, atsLeaders, atsBySlug);
  const rawTotals = buildTotalsPicks(games);

  // Tag existing leans with itemType: 'lean'
  const atsPicks    = rawAts.map((p)    => ({ ...p, itemType: 'lean' }));
  const mlPicks     = rawMl.map((p)     => ({ ...p, itemType: 'lean' }));
  const totalsPicks = rawTotals.map((p) => ({ ...p, itemType: 'lean' }));

  // Collect game keys already covered by leans so watches don't duplicate
  const atsLeanKeys    = new Set(atsPicks.map((p)    => baseGameKey(p)));
  const mlLeanKeys     = new Set(mlPicks.map((p)     => baseGameKey(p)));
  const totalsLeanKeys = new Set(totalsPicks.map((p) => baseGameKey(p)));

  // Fill each column up to TARGET_SHOW with watch items
  const atsWatches    = buildSpreadWatches(games, atsLeanKeys, Math.max(0, TARGET_SHOW - atsPicks.length));
  const mlWatches     = buildMoneylineWatches(games, mlLeanKeys, Math.max(0, TARGET_SHOW - mlPicks.length));
  const totalsWatches = buildTotalsWatches(games, totalsLeanKeys, Math.max(0, TARGET_SHOW - totalsPicks.length));

  return {
    atsPicks:    [...atsPicks,    ...atsWatches],
    mlPicks:     [...mlPicks,     ...mlWatches],
    totalsPicks: [...totalsPicks, ...totalsWatches],
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
  if (topAts) parts.push(`${topAts.pickLine} (${confidenceLabel(topAts.confidence)}${topAts.partial ? ', partial signal' : ''})`);
  if (topMl)  parts.push(`${topMl.pickLine} (${confidenceLabel(topMl.confidence)})`);

  let sentence = `Today's strongest leans: ${parts.join(' and ')}.`;
  if (totalsPicks.length > 0) sentence += ' Totals are informational only.';
  return sentence;
}
