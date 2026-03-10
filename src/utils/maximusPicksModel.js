/**
 * maximusPicksModel — pure pick derivation for 4-column analytics layout.
 *
 * Columns:
 *   1. Pick 'Ems        — straight-up winner prediction
 *   2. Against the Spread — ATS recommendation
 *   3. Value Leans       — market value identification
 *   4. Game Totals       — over/under leans
 *
 * Exported:
 *   buildMaximusPicks(opts) → { pickEmPicks, atsPicks, valuePicks, totalsPicks }
 *   buildPicksSummary(picks) → string | null
 *   confidenceLabel(level) → 'HIGH' | 'MEDIUM' | 'LOW'
 */

import { getTeamSlug } from './teamSlug';
import { getAtsCache } from './atsCache';

// ─── tuneable constants ────────────────────────────────────────────────────────

// Pick 'Ems weights (sum to 1.0)
const PE_W_RANKING     = 0.15;
const PE_W_CHAMP_ODDS  = 0.25;
const PE_W_SEASON_REC  = 0.15;
const PE_W_LAST10      = 0.25;
const PE_W_SOS         = 0.10;
const PE_W_ATS         = 0.10;
const PE_HOME_BUMP     = 0.03;
const PE_MIN_EDGE      = 0.06;
const PE_HIGH_EDGE     = 0.15;
const PE_MED_EDGE      = 0.10;

// ATS thresholds
const ATS_EDGE_MIN  = 0.12;
const ATS_EDGE_HIGH = 0.18;
const ATS_EDGE_MED  = 0.14;

// Value Leans thresholds
const VL_VALUE_MIN  = 0.04;
const VL_VALUE_HIGH = 0.07;
const VL_VALUE_MED  = 0.05;
const VL_AVOID_PRICE = -350;
const VL_HOME_BUMP   = 0.02;
const VL_ATS_WEIGHT  = 0.35;

// Totals thresholds
const TOT_OU_MIN_EDGE   = 0.06;
const TOT_OU_HIGH_EDGE  = 0.14;
const TOT_OU_MED_EDGE   = 0.10;

// Partial-signal ATS thresholds
const ATS_PARTIAL_COVER_MIN  = 0.60;
const ATS_PARTIAL_SAMPLE_MIN = 8;

const PICKS_PER_SECTION = 5;
const TARGET_SHOW = 4;

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
  } catch { /* ignore */ }
  return null;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function getTeamSpread(game, isHome) {
  if (isHome) {
    if (game.homeSpread != null) return { spread: game.homeSpread, source: 'homeSpread' };
    if (game.awaySpread != null) return { spread: -game.awaySpread, source: 'derived_from_awaySpread' };
  } else {
    if (game.awaySpread != null) return { spread: game.awaySpread, source: 'awaySpread' };
    if (game.homeSpread != null) return { spread: -game.homeSpread, source: 'derived_from_homeSpread' };
  }
  const n = parseNum(game.spread);
  if (n == null) return { spread: null, source: null };
  return { spread: isHome ? n : -n, source: 'legacy_spread' };
}

function fmtSpread(n) {
  if (n == null) return null;
  if (n > 0) return `+${n}`;
  if (n === 0) return '+0';
  return String(n);
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

function hasSpreadLine(game) {
  return (
    game.homeSpread != null ||
    game.awaySpread != null ||
    (game.spread != null && game.spread !== '') ||
    game.spreads?.home != null ||
    game.lines?.spread != null ||
    game.odds?.spread != null
  );
}

function hasMoneylineLine(game) {
  return (
    game.moneyline != null ||
    game.ml != null ||
    game.lines?.moneyline != null ||
    game.odds?.moneyline != null
  );
}

function resolveMoneyline(game) {
  return game.moneyline ?? game.ml ?? game.lines?.moneyline ?? game.odds?.moneyline ?? null;
}

function hasTotalLine(game) {
  return (
    game.total != null ||
    game.totals?.points != null ||
    game.lines?.total != null ||
    game.odds?.total != null
  );
}

function resolveTotal(game) {
  const raw = game.total ?? game.totals?.points ?? game.lines?.total ?? game.odds?.total ?? null;
  return parseNum(raw);
}

function baseGameKey(obj) {
  const home = getTeamSlug(obj.homeTeam) || (obj.homeTeam || '').toLowerCase().trim();
  const away = getTeamSlug(obj.awayTeam) || (obj.awayTeam || '').toLowerCase().trim();
  return `${home}|${away}`;
}

// ─── confidence ───────────────────────────────────────────────────────────────

export function confidenceLabel(level) {
  if (level >= 2) return 'HIGH';
  if (level >= 1) return 'MEDIUM';
  return 'LOW';
}

// ─── ranking signal helpers ───────────────────────────────────────────────────

function rankSignal(rank) {
  if (rank == null || rank <= 0) return 0.5;
  return clamp(1 - (rank - 1) / 50, 0.2, 0.95);
}

function champOddsSignal(americanOdds) {
  if (americanOdds == null) return 0.5;
  const implied = americanOdds > 0
    ? 100 / (americanOdds + 100)
    : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  return clamp(implied * 2.5, 0.1, 0.95);
}

function recordSignal(ats) {
  if (!ats || ats.coverPct == null) return 0.5;
  return clamp(ats.coverPct / 100, 0.2, 0.8);
}

// ─── COLUMN 1: Pick 'Ems ─────────────────────────────────────────────────────

function buildPickEmPicks(games, atsLeaders, atsBySlug, rankMap, championshipOdds) {
  const picks = [];

  for (const game of games) {
    if (!hasMoneylineLine(game) && !hasSpreadLine(game)) continue;
    const ml = resolveMoneyline(game);
    const [rawHome, rawAway] = ml ? String(ml).split('/') : ['', ''];
    const homeML = parseNum(rawHome);
    const awayML = parseNum(rawAway);

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);

    const homeRank = rankMap?.[homeSlug] ?? null;
    const awayRank = rankMap?.[awaySlug] ?? null;
    const homeChampOdds = championshipOdds?.[homeSlug]?.american ?? null;
    const awayChampOdds = championshipOdds?.[awaySlug]?.american ?? null;
    const homeAts = getBestAtsRecord(homeSlug, atsLeaders, atsBySlug);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders, atsBySlug);

    const homeSignals = {
      ranking:   rankSignal(homeRank),
      champOdds: champOddsSignal(homeChampOdds),
      seasonRec: recordSignal(homeAts),
      last10:    homeAts?.window === 'last30' ? recordSignal(homeAts) : 0.5,
      sos:       homeRank != null && homeRank <= 25 ? 0.65 : 0.5,
      ats:       homeAts ? clamp(homeAts.coverPct / 100, 0.3, 0.7) : 0.5,
    };

    const awaySignals = {
      ranking:   rankSignal(awayRank),
      champOdds: champOddsSignal(awayChampOdds),
      seasonRec: recordSignal(awayAts),
      last10:    awayAts?.window === 'last30' ? recordSignal(awayAts) : 0.5,
      sos:       awayRank != null && awayRank <= 25 ? 0.65 : 0.5,
      ats:       awayAts ? clamp(awayAts.coverPct / 100, 0.3, 0.7) : 0.5,
    };

    const homeScore =
      homeSignals.ranking   * PE_W_RANKING +
      homeSignals.champOdds * PE_W_CHAMP_ODDS +
      homeSignals.seasonRec * PE_W_SEASON_REC +
      homeSignals.last10    * PE_W_LAST10 +
      homeSignals.sos       * PE_W_SOS +
      homeSignals.ats       * PE_W_ATS +
      PE_HOME_BUMP;

    const awayScore =
      awaySignals.ranking   * PE_W_RANKING +
      awaySignals.champOdds * PE_W_CHAMP_ODDS +
      awaySignals.seasonRec * PE_W_SEASON_REC +
      awaySignals.last10    * PE_W_LAST10 +
      awaySignals.sos       * PE_W_SOS +
      awaySignals.ats       * PE_W_ATS;

    const edge = homeScore - awayScore;
    if (Math.abs(edge) < PE_MIN_EDGE) continue;

    const pickHome = edge > 0;
    const pickTeam = pickHome ? game.homeTeam : game.awayTeam;
    const pickSlug = pickHome ? homeSlug : awaySlug;
    const pickRank = pickHome ? homeRank : awayRank;
    const oppRank  = pickHome ? awayRank : homeRank;
    const pickChampOdds = pickHome ? homeChampOdds : awayChampOdds;
    const pickAts = pickHome ? homeAts : awayAts;
    const oppAts  = pickHome ? awayAts : homeAts;
    const edgeMag = Math.abs(edge);

    let confidence = 0;
    if (edgeMag >= PE_HIGH_EDGE) confidence = 2;
    else if (edgeMag >= PE_MED_EDGE) confidence = 1;

    const signals = [];
    if (pickRank != null && pickRank <= 25) {
      if (oppRank == null || oppRank > 25) signals.push(`Top 25 ranking edge (#${pickRank})`);
      else if (pickRank < oppRank) signals.push(`Higher ranked (#${pickRank} vs #${oppRank})`);
    }
    if (pickChampOdds != null && pickChampOdds < 5000) {
      signals.push('Championship odds favor');
    }
    if (pickAts && pickAts.coverPct >= 55) {
      signals.push(`Strong recent form (${Math.round(pickAts.coverPct)}% ATS)`);
    }
    if (oppAts && oppAts.coverPct < 45) {
      signals.push(`Opponent struggling (${Math.round(oppAts.coverPct)}% ATS)`);
    }
    if (pickHome) signals.push('Home court advantage');

    if (signals.length === 0) signals.push('Composite model edge');

    const pickML = pickHome ? homeML : awayML;
    const pickLine = pickML != null
      ? `${pickTeam} ${fmtPrice(pickML)}`
      : pickTeam;

    picks.push({
      key: game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug,
      awaySlug,
      time: fmtTime(game.startTime || game.commence_time || game.commenceTime),
      pickType: 'pickem',
      itemType: 'lean',
      pickTeam,
      pickLine,
      confidence,
      edgeMag,
      signals,
      partial: false,
    });
  }

  return picks
    .sort((a, b) => b.edgeMag - a.edgeMag)
    .slice(0, PICKS_PER_SECTION);
}

// ─── COLUMN 2: Against the Spread ────────────────────────────────────────────

function buildSpreadPicks(games, atsLeaders, atsBySlug) {
  const picks = [];

  for (const game of games) {
    if (!hasSpreadLine(game)) continue;
    const { spread: homeSpreadNum } = getTeamSpread(game, true);
    const spreadMagnitude = homeSpreadNum != null ? Math.abs(homeSpreadNum) : null;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);
    const homeAts  = getBestAtsRecord(homeSlug, atsLeaders, atsBySlug);
    const awayAts  = getBestAtsRecord(awaySlug, atsLeaders, atsBySlug);

    const sharedBase = {
      key:      game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup:  `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug,
      awaySlug,
      time: fmtTime(game.startTime || game.commence_time || game.commenceTime),
      pickType: 'ats',
    };

    // Tier 1: both teams have ATS records
    if (homeAts && awayAts) {
      const homePct = homeAts.coverPct / 100;
      const awayPct = awayAts.coverPct / 100;
      const edge    = homePct - awayPct;
      if (Math.abs(edge) < ATS_EDGE_MIN) continue;

      const pickHome = edge > 0;
      const pickTeam = pickHome ? game.homeTeam : game.awayTeam;
      const pickAts  = pickHome ? homeAts : awayAts;
      const oppAts   = pickHome ? awayAts : homeAts;

      const homeIsFav = homeSpreadNum != null ? homeSpreadNum < 0 : false;
      const isBigFav  = spreadMagnitude != null && spreadMagnitude >= 10;
      if (isBigFav && homeIsFav && pickHome && Math.abs(edge) < ATS_EDGE_HIGH) continue;

      const { spread: teamSpreadNum } = getTeamSpread(game, pickHome);
      const spreadDisplay = fmtSpread(teamSpreadNum);

      const win          = windowLabel(pickAts.window);
      const edgeMag      = Math.abs(edge);
      const pickRecord   = fmtRecord(pickAts) ?? `${Math.round(pickAts.coverPct)}%`;
      const oppRecord    = fmtRecord(oppAts)  ?? `${Math.round(oppAts.coverPct)}%`;

      let confidence = 0;
      if (edgeMag >= ATS_EDGE_HIGH) confidence = 2;
      else if (edgeMag >= ATS_EDGE_MED) confidence = 1;

      const signals = [];
      signals.push(`ATS form (${win}): ${pickRecord}`);
      signals.push(`Opponent ATS (${win}): ${oppRecord}`);
      if (spreadMagnitude != null && spreadMagnitude <= 3) {
        signals.push('Close line — matchup efficiency edge');
      }

      const hasLine = spreadDisplay != null;
      picks.push({
        ...sharedBase,
        itemType: 'lean',
        pickTeam,
        spread: teamSpreadNum,
        pickLine: hasLine ? `${pickTeam} ${spreadDisplay}` : `${pickTeam} ATS —`,
        confidence,
        edgeMag,
        signals,
        partial: false,
      });
      continue;
    }

    // Tier 2: partial single-team pick
    const singleAts = homeAts ?? awayAts;
    if (!singleAts) continue;

    const pickIsHome = !!homeAts;
    const sampleSize = (singleAts.w ?? 0) + (singleAts.l ?? 0);
    if (singleAts.coverPct < ATS_PARTIAL_COVER_MIN * 100) continue;
    if (sampleSize < ATS_PARTIAL_SAMPLE_MIN) continue;

    const pickTeamP = pickIsHome ? game.homeTeam : game.awayTeam;
    const { spread: teamSpreadNumP } = getTeamSpread(game, pickIsHome);
    const spreadDisplayP = fmtSpread(teamSpreadNumP);
    const win = windowLabel(singleAts.window);
    const pickRecord = fmtRecord(singleAts) ?? `${Math.round(singleAts.coverPct)}%`;
    const rawConf = singleAts.coverPct >= 70 ? 1 : 0;

    const signals = [];
    signals.push(`ATS form (${win}): ${pickRecord}`);
    signals.push('Opponent ATS data unavailable');

    const hasLineP = spreadDisplayP != null;
    picks.push({
      ...sharedBase,
      itemType: 'lean',
      pickTeam: pickTeamP,
      spread: teamSpreadNumP,
      pickLine: hasLineP ? `${pickTeamP} ${spreadDisplayP}` : `${pickTeamP} ATS —`,
      confidence: rawConf,
      edgeMag: 0,
      signals,
      partial: true,
    });
  }

  return picks
    .sort((a, b) => {
      if (a.partial !== b.partial) return a.partial ? 1 : -1;
      return b.edgeMag - a.edgeMag;
    })
    .slice(0, PICKS_PER_SECTION);
}

// ─── COLUMN 3: Value Leans ───────────────────────────────────────────────────

function buildValuePicks(games, atsLeaders, atsBySlug, rankMap, championshipOdds) {
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

    // Championship odds adjustment
    const homeChamp = championshipOdds?.[homeSlug]?.american;
    const awayChamp = championshipOdds?.[awaySlug]?.american;
    let champAdj = 0;
    if (homeChamp != null && awayChamp != null) {
      const homeChampImpl = mlToImplied(homeChamp) ?? 0;
      const awayChampImpl = mlToImplied(awayChamp) ?? 0;
      champAdj = (homeChampImpl - awayChampImpl) * 0.15;
    }

    const homeModelProb = clamp(0.5 + atsDiff * VL_ATS_WEIGHT + VL_HOME_BUMP + champAdj, 0.35, 0.75);
    const awayModelProb = 1 - homeModelProb;

    const homeValue = homeModelProb - homeImplied;
    const awayValue = awayModelProb - awayImplied;

    let pickTeam, pickML, pickProb, impliedPct, value;

    if (homeValue >= awayValue && homeValue >= VL_VALUE_MIN) {
      if (homeML <= VL_AVOID_PRICE) continue;
      pickTeam   = game.homeTeam;
      pickML     = homeML;
      pickProb   = homeModelProb;
      impliedPct = homeImplied;
      value      = homeValue;
    } else if (awayValue >= VL_VALUE_MIN) {
      if (awayML <= VL_AVOID_PRICE) continue;
      pickTeam   = game.awayTeam;
      pickML     = awayML;
      pickProb   = awayModelProb;
      impliedPct = awayImplied;
      value      = awayValue;
    } else {
      continue;
    }

    let confidence = 0;
    if (value >= VL_VALUE_HIGH) confidence = 2;
    else if (value >= VL_VALUE_MED) confidence = 1;

    const modelPctRounded  = Math.round(pickProb * 100);
    const marketPctRounded = Math.round(impliedPct * 100);
    const edgePpRounded    = Math.round(value * 100);
    const mlPriceLabel     = fmtPrice(pickML);
    const pickLine = `${pickTeam} ${mlPriceLabel}`;

    const signals = [];
    signals.push(`Model prices at ${modelPctRounded}%, market implies ${marketPctRounded}%`);
    signals.push(`+${edgePpRounded}pp value gap`);
    if (pickML >= 150) signals.push('Underdog value — market may be underestimating');
    if (homeAts || awayAts) {
      const atsRec = pickTeam === game.homeTeam ? homeAts : awayAts;
      if (atsRec) {
        signals.push(`Recent ATS form: ${Math.round(atsRec.coverPct)}%`);
      }
    }

    picks.push({
      key:      game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup:  `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug,
      awaySlug: getTeamSlug(game.awayTeam),
      time:     fmtTime(game.startTime || game.commence_time || game.commenceTime),
      pickType: 'value',
      itemType: 'lean',
      pickTeam,
      pickLine,
      mlPriceLabel,
      confidence,
      value,
      edgeMag: value,
      modelPct: modelPctRounded,
      marketImpliedPct: marketPctRounded,
      edgePp: edgePpRounded,
      signals,
      partial: false,
    });
  }

  return picks.sort((a, b) => b.value - a.value).slice(0, PICKS_PER_SECTION);
}

// ─── COLUMN 4: Game Totals ───────────────────────────────────────────────────

function buildTotalsPicks(games, atsLeaders, atsBySlug) {
  const picks = [];

  for (const game of games) {
    if (!game.total) continue;
    const marketTotal = parseNum(game.total);
    if (marketTotal == null) continue;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);
    const homeAts = getBestAtsRecord(homeSlug, atsLeaders, atsBySlug);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders, atsBySlug);

    // Estimate O/U lean from ATS data as proxy for scoring tendency
    // Teams that cover well tend to score more → slight over lean
    const homeCover = homeAts ? (homeAts.coverPct - 50) / 100 : 0;
    const awayCover = awayAts ? (awayAts.coverPct - 50) / 100 : 0;
    const combinedTrend = (homeCover + awayCover) / 2;
    const trendMag = Math.abs(combinedTrend);

    const overPrice  = game.overPrice  ? fmtPrice(parseNum(game.overPrice))  : null;
    const underPrice = game.underPrice ? fmtPrice(parseNum(game.underPrice)) : null;

    const isOver = combinedTrend > 0;
    const leanLabel = trendMag >= TOT_OU_MIN_EDGE
      ? (isOver ? 'OVER' : 'UNDER')
      : null;

    let confidence = 0;
    if (trendMag >= TOT_OU_HIGH_EDGE) confidence = 2;
    else if (trendMag >= TOT_OU_MED_EDGE) confidence = 1;

    const priceStr = overPrice || underPrice
      ? ` (O ${overPrice ?? '—'} / U ${underPrice ?? '—'})`
      : '';

    const signals = [];
    if (homeAts && homeAts.coverPct != null) {
      signals.push(`${game.homeTeam} ATS: ${Math.round(homeAts.coverPct)}% cover rate`);
    }
    if (awayAts && awayAts.coverPct != null) {
      signals.push(`${game.awayTeam} ATS: ${Math.round(awayAts.coverPct)}% cover rate`);
    }
    if (leanLabel) {
      signals.push(`Combined scoring trend favors ${leanLabel.toLowerCase()}`);
    } else {
      signals.push('No clear directional edge');
    }

    picks.push({
      key:      game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup:  `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeSlug,
      awaySlug,
      time:     fmtTime(game.startTime || game.commence_time || game.commenceTime),
      pickType: 'total',
      itemType: 'lean',
      pickTeam: null,
      pickLine: leanLabel
        ? `${leanLabel} ${marketTotal}${priceStr}`
        : `O/U ${marketTotal}${priceStr}`,
      leanDirection: leanLabel ?? null,
      confidence,
      lineValue: marketTotal,
      edgeMag: trendMag,
      signals,
      partial: false,
    });
  }

  return picks
    .sort((a, b) => b.edgeMag - a.edgeMag)
    .slice(0, PICKS_PER_SECTION);
}

// ─── watch item helpers ───────────────────────────────────────────────────────

function buildWatchBase(game, pickType) {
  return {
    key:              `${baseGameKey(game)}-watch`,
    matchup:          `${game.awayTeam} @ ${game.homeTeam}`,
    homeTeam:         game.homeTeam,
    awayTeam:         game.awayTeam,
    homeSlug:         getTeamSlug(game.homeTeam),
    awaySlug:         getTeamSlug(game.awayTeam),
    time:             fmtTime(game.startTime || game.commence_time || game.commenceTime),
    pickType,
    itemType:         'watch',
    pickTeam:         null,
    confidence:       -1,
    edgeMag:          0,
    signals:          [],
    partial:          false,
  };
}

function buildPickEmWatches(games, leanKeys, needed) {
  const watches = [];
  for (const game of games) {
    if (watches.length >= needed) break;
    if (leanKeys.has(baseGameKey(game))) continue;
    if (!hasMoneylineLine(game) && !hasSpreadLine(game)) continue;
    const { spread: homeSpreadNum } = getTeamSpread(game, true);
    const { spread: awaySpreadNum } = getTeamSpread(game, false);
    const favIsHome = homeSpreadNum != null && homeSpreadNum < 0;
    const favTeam   = favIsHome ? game.homeTeam : game.awayTeam;
    watches.push({
      ...buildWatchBase(game, 'pickem'),
      pickLine: `${game.awayTeam} @ ${game.homeTeam}`,
      watchReason: 'Monitoring — awaiting signal alignment.',
    });
  }
  return watches;
}

function buildSpreadWatches(games, leanKeys, needed) {
  const watches = [];
  for (const game of games) {
    if (watches.length >= needed) break;
    if (leanKeys.has(baseGameKey(game))) continue;
    if (!hasSpreadLine(game)) continue;
    const { spread: homeSpreadNum } = getTeamSpread(game, true);
    const { spread: awaySpreadNum } = getTeamSpread(game, false);
    const favIsHome = homeSpreadNum != null && homeSpreadNum < 0;
    const favTeam   = favIsHome ? game.homeTeam : game.awayTeam;
    const favSpread = favIsHome ? fmtSpread(homeSpreadNum) : fmtSpread(awaySpreadNum ?? null);
    const pickLine  = favSpread ? `${favTeam} ${favSpread}` : `${game.awayTeam} @ ${game.homeTeam}`;
    watches.push({
      ...buildWatchBase(game, 'ats'),
      spread: homeSpreadNum,
      pickLine,
      watchReason: 'Lines posted. Monitoring for ATS edge.',
    });
  }
  return watches;
}

function buildValueWatches(games, leanKeys, needed) {
  const watches = [];
  for (const game of games) {
    if (watches.length >= needed) break;
    if (leanKeys.has(baseGameKey(game))) continue;
    if (!hasMoneylineLine(game)) continue;
    const ml = resolveMoneyline(game);
    if (!ml) continue;
    const [rawHome, rawAway] = String(ml).split('/');
    const homeML = parseNum(rawHome);
    const awayML = parseNum(rawAway);
    if (homeML == null || awayML == null) continue;
    watches.push({
      ...buildWatchBase(game, 'value'),
      pickLine: `${game.awayTeam} ${fmtPrice(awayML)} / ${game.homeTeam} ${fmtPrice(homeML)}`,
      watchReason: 'Lines posted. Monitoring for value edge.',
    });
  }
  return watches;
}

function buildTotalsWatches(games, leanKeys, needed) {
  const watches = [];
  for (const game of games) {
    if (watches.length >= needed) break;
    if (leanKeys.has(baseGameKey(game))) continue;
    if (!hasTotalLine(game)) continue;
    const marketTotal = resolveTotal(game);
    if (marketTotal == null) continue;
    watches.push({
      ...buildWatchBase(game, 'total'),
      pickLine:  `O/U ${marketTotal}`,
      lineValue: marketTotal,
      watchReason: 'Line posted. Monitoring for directional lean.',
    });
  }
  return watches;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Build all Maximus picks from Home state data. Pure — no side effects, no fetches.
 *
 * @param {object} opts
 * @param {object[]} opts.games           — merged game objects (with odds)
 * @param {{ best: object[], worst: object[] }} opts.atsLeaders
 * @param {Record<string,object>|null} [opts.atsBySlug]
 * @param {Record<string,number>} [opts.rankMap]       — slug→AP rank
 * @param {Record<string,object>} [opts.championshipOdds] — slug→{american,...}
 * @returns {{ pickEmPicks: object[], atsPicks: object[], valuePicks: object[], totalsPicks: object[] }}
 */
export function buildMaximusPicks({
  games = [],
  atsLeaders = { best: [], worst: [] },
  atsBySlug: providedAtsBySlug = null,
  rankMap = {},
  championshipOdds = {},
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

  const sortedGames = [...games].sort((a, b) => {
    const ta = a.startTime ? new Date(a.startTime).getTime() : Infinity;
    const tb = b.startTime ? new Date(b.startTime).getTime() : Infinity;
    return ta - tb;
  });

  const rawPickEm = buildPickEmPicks(sortedGames, atsLeaders, atsBySlug, rankMap, championshipOdds);
  const rawAts    = buildSpreadPicks(sortedGames, atsLeaders, atsBySlug);
  const rawValue  = buildValuePicks(sortedGames, atsLeaders, atsBySlug, rankMap, championshipOdds);
  const rawTotals = buildTotalsPicks(sortedGames, atsLeaders, atsBySlug);

  const pickEmPicks  = rawPickEm;
  const atsPicks     = rawAts;
  const valuePicks   = rawValue;
  const totalsPicks  = rawTotals;

  // Collect keys for watch dedup
  const pickEmKeys  = new Set(pickEmPicks.map(baseGameKey));
  const atsKeys     = new Set(atsPicks.map(baseGameKey));
  const valueKeys   = new Set(valuePicks.map(baseGameKey));
  const totalsKeys  = new Set(totalsPicks.map(baseGameKey));

  // Fill columns with watches
  const pickEmWatches  = buildPickEmWatches(sortedGames, pickEmKeys, Math.max(0, TARGET_SHOW - pickEmPicks.length));
  const atsWatches     = buildSpreadWatches(sortedGames, atsKeys, Math.max(0, TARGET_SHOW - atsPicks.length));
  const valueWatches   = buildValueWatches(sortedGames, valueKeys, Math.max(0, TARGET_SHOW - valuePicks.length));
  const totalsWatches  = buildTotalsWatches(sortedGames, totalsKeys, Math.max(0, TARGET_SHOW - totalsPicks.length));

  const finalPickEm  = [...pickEmPicks, ...pickEmWatches];
  const finalAts     = [...atsPicks, ...atsWatches];
  const finalValue   = [...valuePicks, ...valueWatches];
  const finalTotals  = [...totalsPicks, ...totalsWatches];

  return {
    pickEmPicks:  finalPickEm,
    atsPicks:     finalAts,
    valuePicks:   finalValue,
    totalsPicks:  finalTotals,
    // Backward compat: existing slide/dashboard consumers reference mlPicks
    mlPicks:      finalValue,
  };
}

/**
 * Build a 1–2 sentence picks summary for the top briefing.
 */
export function buildPicksSummary({ pickEmPicks = [], atsPicks = [], valuePicks, mlPicks, totalsPicks = [] } = {}) {
  const valPicks = valuePicks ?? mlPicks ?? [];
  const topPickEm = pickEmPicks.find((p) => p.itemType === 'lean');
  const topAts    = atsPicks.find((p) => p.itemType === 'lean');
  const topValue  = valPicks.find((p) => p.itemType === 'lean');

  if (!topPickEm && !topAts && !topValue) {
    if (totalsPicks.length > 0) {
      return 'No strong leans today. Totals available for monitoring.';
    }
    return null;
  }

  const parts = [];
  if (topPickEm) parts.push(`${topPickEm.pickTeam} (${confidenceLabel(topPickEm.confidence)})`);
  if (topAts) parts.push(`${topAts.pickLine} (${confidenceLabel(topAts.confidence)}${topAts.partial ? ', partial' : ''})`);
  if (topValue) parts.push(`${topValue.pickLine} (${confidenceLabel(topValue.confidence)})`);

  let sentence = `Today's strongest leans: ${parts.join(' · ')}.`;
  if (totalsPicks.filter((p) => p.leanDirection).length > 0) sentence += ' Totals leans active.';
  return sentence;
}
