/**
 * maximusPicksModel — pure pick derivation for 4-column analytics layout.
 *
 * Columns:
 *   1. Pick 'Ems        — straight-up winner prediction (3-tier fallback)
 *   2. Against the Spread — ATS recommendation (3-tier fallback)
 *   3. Value Leans       — market value identification
 *   4. Game Totals       — over/under leans
 *
 * Fallback ladder (Pick 'Ems & ATS):
 *   Tier 1 — full model: all major enrichments available
 *   Tier 2 — reduced model: missing some enrichments, still has form/market data
 *   Tier 3 — minimum viable: market signal + home court, confidence capped LOW
 *
 * Exported:
 *   buildMaximusPicks(opts) → { pickEmPicks, atsPicks, valuePicks, totalsPicks, mlPicks }
 *   buildPicksSummary(picks) → string | null
 *   confidenceLabel(level) → 'HIGH' | 'MEDIUM' | 'LOW'
 */

import { getTeamSlug } from './teamSlug';
import { getAtsCache } from './atsCache';

// ─── tuneable constants ────────────────────────────────────────────────────────

// Pick 'Ems — Tier 1 (full model) weights
const PE_W_RANKING     = 0.12;
const PE_W_CHAMP_ODDS  = 0.18;
const PE_W_SEASON_REC  = 0.12;
const PE_W_LAST10      = 0.15;
const PE_W_SOS         = 0.08;
const PE_W_ATS         = 0.10;
const PE_W_MARKET      = 0.25;
const PE_HOME_BUMP     = 0.03;
const PE_MIN_EDGE_T1   = 0.05;
const PE_MIN_EDGE_T2   = 0.04;
const PE_MIN_EDGE_T3   = 0.05;
const PE_HIGH_EDGE     = 0.14;
const PE_MED_EDGE      = 0.07;

// Pick'Em chalk deflation — de-rank obvious heavy favorites in sort order
const PE_CHALK_ML    = -600;
const PE_CHALK_FLOOR = 0.30;
// Suppress extremely lopsided games from surfacing (no analytical value)
const PE_SUPPRESS_ML = -800;

// ATS thresholds — tightened for selectivity
const ATS_EDGE_MIN  = 0.10;
const ATS_EDGE_HIGH = 0.18;
const ATS_EDGE_MED  = 0.12;

// ATS spread-magnitude discount — large spreads are harder to cover
const ATS_SPREAD_SOFT_CAP     = 8;
const ATS_SPREAD_PENALTY_RATE = 0.04;
// Extra guard: require top-tier edge for very large spreads
const ATS_LARGE_SPREAD_GATE   = 12;

// ATS partial-signal thresholds — relaxed
const ATS_PARTIAL_COVER_MIN  = 0.53;
const ATS_PARTIAL_SAMPLE_MIN = 5;

// Value Leans thresholds
const VL_VALUE_MIN  = 0.04;
const VL_VALUE_HIGH = 0.08;
const VL_VALUE_MED  = 0.05;
const VL_AVOID_PRICE = -350;
const VL_HOME_BUMP   = 0.015;
const VL_ATS_WEIGHT  = 0.40;
// Bonus when recent form (last-30 ATS) aligns with the model lean
const VL_FORM_BONUS  = 0.03;

// Totals thresholds — tightened to suppress conflicting signals
const TOT_OU_MIN_EDGE   = 0.08;
const TOT_OU_HIGH_EDGE  = 0.16;
const TOT_OU_MED_EDGE   = 0.12;

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

/** Convert a point-spread to an approximate home-win probability. */
function spreadToWinProb(spread) {
  if (spread == null) return null;
  return clamp(0.5 - spread * 0.03, 0.15, 0.85);
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

/**
 * Reliably parse a moneyline string into { homeML, awayML }.
 * Cross-validates against spread direction when available to catch
 * data sources that provide the ML string in away/home order.
 */
function parseMoneylinePair(game) {
  const ml = resolveMoneyline(game);
  if (!ml) return { homeML: null, awayML: null };
  const parts = String(ml).split('/');
  if (parts.length < 2) return { homeML: null, awayML: null };
  let homeML = parseNum(parts[0]);
  let awayML = parseNum(parts[1]);
  if (homeML == null || awayML == null) return { homeML: null, awayML: null };
  if (homeML === awayML) return { homeML, awayML };
  const { spread: homeSpread } = getTeamSpread(game, true);
  if (homeSpread != null && homeSpread !== 0) {
    const homeIsFavBySpread = homeSpread < 0;
    const homeIsFavByML = homeML < awayML;
    if (homeIsFavBySpread !== homeIsFavByML) {
      [homeML, awayML] = [awayML, homeML];
    }
  }
  return { homeML, awayML };
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

// ─── signal helpers ──────────────────────────────────────────────────────────

function rankSignal(rank) {
  if (rank == null || rank <= 0) return null;
  return clamp(1 - (rank - 1) / 50, 0.2, 0.95);
}

function champOddsSignal(americanOdds) {
  if (americanOdds == null) return null;
  const implied = americanOdds > 0
    ? 100 / (americanOdds + 100)
    : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  return clamp(implied * 2.5, 0.1, 0.95);
}

function recordSignal(ats) {
  if (!ats || ats.coverPct == null) return null;
  return clamp(ats.coverPct / 100, 0.2, 0.8);
}

/**
 * Derive a market-implied win probability for the home team from ML and/or spread.
 * Returns null only when neither ML nor spread data exists.
 */
function marketWinSignal(game) {
  const { homeML, awayML } = parseMoneylinePair(game);
  if (homeML != null && awayML != null) {
    const hImp = mlToImplied(homeML);
    const aImp = mlToImplied(awayML);
    if (hImp != null && aImp != null) {
      const total = hImp + aImp;
      return clamp(hImp / total, 0.1, 0.9);
    }
  }
  const { spread: homeSpread } = getTeamSpread(game, true);
  if (homeSpread != null) {
    return spreadToWinProb(homeSpread);
  }
  return null;
}

// ─── COLUMN 1: Pick 'Ems (3-tier fallback) ───────────────────────────────────

function buildPickEmPicks(games, atsLeaders, atsBySlug, rankMap, championshipOdds) {
  const picks = [];

  for (const game of games) {
    if (!hasMoneylineLine(game) && !hasSpreadLine(game)) continue;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);

    const homeRank = rankMap?.[homeSlug] ?? null;
    const awayRank = rankMap?.[awaySlug] ?? null;
    const homeChampOdds = championshipOdds?.[homeSlug]?.american ?? null;
    const awayChampOdds = championshipOdds?.[awaySlug]?.american ?? null;
    const homeAts = getBestAtsRecord(homeSlug, atsLeaders, atsBySlug);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders, atsBySlug);
    const marketProb = marketWinSignal(game);

    // Count how many enrichments are available per side
    const homeHasRank   = rankSignal(homeRank) !== null;
    const homeHasChamp  = champOddsSignal(homeChampOdds) !== null;
    const homeHasAts    = recordSignal(homeAts) !== null;
    const awayHasRank   = rankSignal(awayRank) !== null;
    const awayHasChamp  = champOddsSignal(awayChampOdds) !== null;
    const awayHasAts    = recordSignal(awayAts) !== null;
    const hasMarket     = marketProb !== null;

    const enrichCount = [homeHasRank || awayHasRank, homeHasChamp || awayHasChamp,
                         homeHasAts || awayHasAts, hasMarket].filter(Boolean).length;

    let tier, homeScore, awayScore, minEdge;

    if (enrichCount >= 3) {
      // Tier 1: full model — at least 3 of 4 signal categories present
      tier = 1;
      minEdge = PE_MIN_EDGE_T1;
      const hRank  = rankSignal(homeRank)          ?? 0.5;
      const hChamp = champOddsSignal(homeChampOdds) ?? 0.5;
      const hRec   = recordSignal(homeAts)          ?? 0.5;
      const hLast  = homeAts?.window === 'last30' ? (recordSignal(homeAts) ?? 0.5) : 0.5;
      const hSos   = homeRank != null && homeRank <= 25 ? 0.65 : 0.5;
      const hAts   = homeAts ? clamp(homeAts.coverPct / 100, 0.3, 0.7) : 0.5;
      const hMkt   = marketProb ?? 0.5;

      const aRank  = rankSignal(awayRank)          ?? 0.5;
      const aChamp = champOddsSignal(awayChampOdds) ?? 0.5;
      const aRec   = recordSignal(awayAts)          ?? 0.5;
      const aLast  = awayAts?.window === 'last30' ? (recordSignal(awayAts) ?? 0.5) : 0.5;
      const aSos   = awayRank != null && awayRank <= 25 ? 0.65 : 0.5;
      const aAts   = awayAts ? clamp(awayAts.coverPct / 100, 0.3, 0.7) : 0.5;
      const aMkt   = 1 - hMkt;

      homeScore = hRank * PE_W_RANKING + hChamp * PE_W_CHAMP_ODDS + hRec * PE_W_SEASON_REC +
                  hLast * PE_W_LAST10 + hSos * PE_W_SOS + hAts * PE_W_ATS + hMkt * PE_W_MARKET + PE_HOME_BUMP;
      awayScore = aRank * PE_W_RANKING + aChamp * PE_W_CHAMP_ODDS + aRec * PE_W_SEASON_REC +
                  aLast * PE_W_LAST10 + aSos * PE_W_SOS + aAts * PE_W_ATS + aMkt * PE_W_MARKET;

    } else if (enrichCount >= 1) {
      // Tier 2: reduced model — at least 1 enrichment + market or form
      tier = 2;
      minEdge = PE_MIN_EDGE_T2;
      const hRec  = recordSignal(homeAts)          ?? 0.5;
      const hAts  = homeAts ? clamp(homeAts.coverPct / 100, 0.3, 0.7) : 0.5;
      const hMkt  = marketProb ?? 0.5;
      const hRank = rankSignal(homeRank)           ?? 0.5;
      const hChamp = champOddsSignal(homeChampOdds) ?? 0.5;

      const aRec  = recordSignal(awayAts)          ?? 0.5;
      const aAts  = awayAts ? clamp(awayAts.coverPct / 100, 0.3, 0.7) : 0.5;
      const aMkt  = 1 - hMkt;
      const aRank = rankSignal(awayRank)           ?? 0.5;
      const aChamp = champOddsSignal(awayChampOdds) ?? 0.5;

      // Reweight: market gets 0.40, form 0.25, rank+champ 0.20, ATS 0.15
      homeScore = hMkt * 0.40 + hRec * 0.15 + hAts * 0.10 + hRank * 0.10 + hChamp * 0.10 +
                  (homeAts?.window === 'last30' ? (recordSignal(homeAts) ?? 0.5) : 0.5) * 0.10 + PE_HOME_BUMP;
      awayScore = aMkt * 0.40 + aRec * 0.15 + aAts * 0.10 + aRank * 0.10 + aChamp * 0.10 +
                  (awayAts?.window === 'last30' ? (recordSignal(awayAts) ?? 0.5) : 0.5) * 0.10;

    } else if (hasMarket) {
      // Tier 3: minimum viable — market signal + home court only
      tier = 3;
      minEdge = PE_MIN_EDGE_T3;
      homeScore = (marketProb ?? 0.5) * 0.85 + PE_HOME_BUMP + 0.5 * 0.15;
      awayScore = (1 - (marketProb ?? 0.5)) * 0.85 + 0.5 * 0.15;
    } else {
      continue;
    }

    const edge = homeScore - awayScore;
    if (Math.abs(edge) < minEdge) continue;

    const pickHome = edge > 0;
    const pickTeam = pickHome ? game.homeTeam : game.awayTeam;
    const pickRank = pickHome ? homeRank : awayRank;
    const oppRank  = pickHome ? awayRank : homeRank;
    const pickChampOddsVal = pickHome ? homeChampOdds : awayChampOdds;
    const pickAts = pickHome ? homeAts : awayAts;
    const oppAts  = pickHome ? awayAts : homeAts;
    const edgeMag = Math.abs(edge);

    // Confidence: tier 3 capped at LOW, tier 2 capped at MEDIUM
    let confidence = 0;
    if (edgeMag >= PE_HIGH_EDGE) confidence = 2;
    else if (edgeMag >= PE_MED_EDGE) confidence = 1;
    if (tier === 3) confidence = Math.min(confidence, 0);
    if (tier === 2) confidence = Math.min(confidence, 1);

    const signals = [];
    if (pickRank != null && pickRank <= 25) {
      if (oppRank == null || oppRank > 25) signals.push(`Top 25 ranking edge (#${pickRank})`);
      else if (pickRank < oppRank) signals.push(`Higher ranked (#${pickRank} vs #${oppRank})`);
    }
    if (pickChampOddsVal != null && pickChampOddsVal < 5000) {
      signals.push('Championship odds favor');
    }
    if (pickAts && pickAts.coverPct >= 55) {
      signals.push(`Strong recent form (${Math.round(pickAts.coverPct)}% ATS)`);
    }
    if (oppAts && oppAts.coverPct < 45) {
      signals.push(`Opponent struggling (${Math.round(oppAts.coverPct)}% ATS)`);
    }
    if (hasMarket && marketProb != null) {
      const favPct = Math.round((pickHome ? marketProb : 1 - marketProb) * 100);
      if (favPct >= 55) signals.push(`Market implied ${favPct}% win probability`);
    }
    if (pickHome) signals.push('Home court advantage');
    if (signals.length === 0) signals.push('Composite model edge');

    const { homeML: peHomeML, awayML: peAwayML } = parseMoneylinePair(game);
    const pickML = pickHome ? peHomeML : peAwayML;

    // Suppress extremely heavy favorites — no analytical value
    if (pickML != null && pickML <= PE_SUPPRESS_ML) continue;

    const pickLine = pickML != null ? `${pickTeam} ${fmtPrice(pickML)}` : pickTeam;

    // Deflate sort edge for heavy chalk so more competitive games rank higher
    let _sortEdge = edgeMag;
    if (pickML != null && pickML < PE_CHALK_ML) {
      const chalkFactor = Math.max(PE_CHALK_FLOOR, 1 - (Math.abs(pickML) - Math.abs(PE_CHALK_ML)) / 3000);
      _sortEdge = edgeMag * chalkFactor;
    }

    const opponentTeam = pickHome ? game.awayTeam : game.homeTeam;
    const opponentSlug = pickHome ? awaySlug : homeSlug;

    // Build explainability rationale
    const rationale = buildPickEmRationale({ pickTeam, opponentTeam, confidence, edgeMag, pickRank, oppRank, pickAts, marketProb, pickHome, pickML, tier });

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
      opponentTeam,
      opponentSlug,
      pickLine,
      confidence,
      edgeMag,
      signals,
      rationale,
      partial: tier >= 2,
      _tier: tier,
      _sortEdge,
    });
  }

  return picks
    .sort((a, b) => (a._tier - b._tier) || (b._sortEdge - a._sortEdge))
    .slice(0, PICKS_PER_SECTION);
}

// ─── COLUMN 2: Against the Spread (3-tier fallback) ──────────────────────────

function buildSpreadPicks(games, atsLeaders, atsBySlug, rankMap, championshipOdds) {
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

    // ── Tier 1: both teams have ATS records ──
    if (homeAts && awayAts) {
      const homePct = homeAts.coverPct / 100;
      const awayPct = awayAts.coverPct / 100;
      const rawEdge = Math.abs(homePct - awayPct);

      // Discount edge for large spreads — covering at high magnitudes is harder
      let spreadDiscount = 1.0;
      if (spreadMagnitude != null && spreadMagnitude > ATS_SPREAD_SOFT_CAP) {
        const excess = spreadMagnitude - ATS_SPREAD_SOFT_CAP;
        spreadDiscount = Math.max(0.50, 1 - excess * ATS_SPREAD_PENALTY_RATE);
      }
      const adjustedEdge = rawEdge * spreadDiscount;
      if (adjustedEdge < ATS_EDGE_MIN) continue;

      const pickHome = (homePct - awayPct) > 0;
      const pickTeam = pickHome ? game.homeTeam : game.awayTeam;
      const pickAts  = pickHome ? homeAts : awayAts;
      const oppAts   = pickHome ? awayAts : homeAts;

      const homeIsFav = homeSpreadNum != null ? homeSpreadNum < 0 : false;
      const favTeamName = homeIsFav ? game.homeTeam : game.awayTeam;
      const isBigFav  = spreadMagnitude != null && spreadMagnitude >= 10;
      if (isBigFav && pickTeam === favTeamName && adjustedEdge < ATS_EDGE_HIGH) continue;
      // Very large spreads (12+) require HIGH-tier edge regardless of side
      if (spreadMagnitude != null && spreadMagnitude >= ATS_LARGE_SPREAD_GATE && adjustedEdge < ATS_EDGE_HIGH) continue;

      const { spread: teamSpreadNum } = getTeamSpread(game, pickHome);
      const spreadDisplay = fmtSpread(teamSpreadNum);
      const win     = windowLabel(pickAts.window);
      const edgeMag = adjustedEdge;
      const pickRecord = fmtRecord(pickAts) ?? `${Math.round(pickAts.coverPct)}%`;
      const oppRecord  = fmtRecord(oppAts)  ?? `${Math.round(oppAts.coverPct)}%`;

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
      const opponentTeam = pickHome ? game.awayTeam : game.homeTeam;
      const opponentSlug = pickHome ? awaySlug : homeSlug;
      const rationale = buildAtsRationale({ pickTeam, opponentTeam, confidence, edgeMag: adjustedEdge, pickAts, oppAts, spreadMagnitude, teamSpreadNum, isBigFav, pickIsFav: pickTeam === favTeamName });
      picks.push({
        ...sharedBase,
        itemType: 'lean',
        pickTeam,
        opponentTeam,
        opponentSlug,
        spread: teamSpreadNum,
        pickLine: hasLine ? `${pickTeam} ${spreadDisplay}` : `${pickTeam} ATS —`,
        confidence,
        edgeMag,
        signals,
        rationale,
        partial: false,
        _tier: 1,
      });
      continue;
    }

    // ── Tier 2: one team has ATS records ──
    const singleAts = homeAts ?? awayAts;
    if (singleAts) {
      const pickIsHome = !!homeAts;
      const sampleSize = (singleAts.w ?? 0) + (singleAts.l ?? 0);
      if (singleAts.coverPct >= ATS_PARTIAL_COVER_MIN * 100 && sampleSize >= ATS_PARTIAL_SAMPLE_MIN) {
        const pickTeamP = pickIsHome ? game.homeTeam : game.awayTeam;
        const { spread: teamSpreadNumP } = getTeamSpread(game, pickIsHome);
        const spreadDisplayP = fmtSpread(teamSpreadNumP);
        const win = windowLabel(singleAts.window);
        const pickRecord = fmtRecord(singleAts) ?? `${Math.round(singleAts.coverPct)}%`;
        const rawConf = singleAts.coverPct >= 65 ? 1 : 0;

        const signals = [];
        signals.push(`ATS form (${win}): ${pickRecord}`);
        signals.push('Opponent ATS data unavailable');

        const hasLineP = spreadDisplayP != null;
        const opponentTeamP = pickIsHome ? game.awayTeam : game.homeTeam;
        const opponentSlugP = pickIsHome ? awaySlug : homeSlug;
        picks.push({
          ...sharedBase,
          itemType: 'lean',
          pickTeam: pickTeamP,
          opponentTeam: opponentTeamP,
          opponentSlug: opponentSlugP,
          spread: teamSpreadNumP,
          pickLine: hasLineP ? `${pickTeamP} ${spreadDisplayP}` : `${pickTeamP} ATS —`,
          confidence: rawConf,
          edgeMag: (singleAts.coverPct - 50) / 100,
          signals,
          partial: true,
          _tier: 2,
        });
        continue;
      }
    }

    // ── Tier 3: no ATS data — use market + ranking signals for directional lean ──
    if (homeSpreadNum != null && spreadMagnitude != null && spreadMagnitude >= 2) {
      const homeRank = rankMap?.[homeSlug] ?? null;
      const awayRank = rankMap?.[awaySlug] ?? null;
      const homeIsRanked = homeRank != null && homeRank <= 25;
      const awayIsRanked = awayRank != null && awayRank <= 25;

      // Lean toward the underdog unless spread is large + ranking confirms favorite
      const homeIsFav = homeSpreadNum < 0;
      const favTeam   = homeIsFav ? game.homeTeam : game.awayTeam;
      const dogTeam   = homeIsFav ? game.awayTeam : game.homeTeam;
      const dogIsHome = !homeIsFav;

      // Default: lean dog if spread is moderate (3-8 pts), lean fav if spread is large (>8)
      let leanFav = spreadMagnitude > 8;

      // Ranking override: if one team is ranked and the other isn't, lean toward the ranked side
      if (homeIsRanked !== awayIsRanked) {
        const rankedIsFav = (homeIsRanked && homeIsFav) || (awayIsRanked && !homeIsFav);
        leanFav = rankedIsFav ? (spreadMagnitude > 10) : true;
      }

      const pickTeamT3 = leanFav ? favTeam : dogTeam;
      const pickIsHomeT3 = pickTeamT3 === game.homeTeam;
      const { spread: teamSpreadT3 } = getTeamSpread(game, pickIsHomeT3);
      const spreadDispT3 = fmtSpread(teamSpreadT3);

      const signals = [];
      signals.push(`Spread: ${fmtSpread(homeSpreadNum)} (${game.homeTeam})`);
      if (homeIsRanked) signals.push(`${game.homeTeam} ranked #${homeRank}`);
      if (awayIsRanked) signals.push(`${game.awayTeam} ranked #${awayRank}`);
      if (!leanFav) signals.push('Market spread creates underdog cover value');
      else signals.push('Large spread supports favorite cover');

      const opponentTeamT3 = pickTeamT3 === game.homeTeam ? game.awayTeam : game.homeTeam;
      const opponentSlugT3 = pickTeamT3 === game.homeTeam ? awaySlug : homeSlug;
      picks.push({
        ...sharedBase,
        itemType: 'lean',
        pickTeam: pickTeamT3,
        opponentTeam: opponentTeamT3,
        opponentSlug: opponentSlugT3,
        spread: teamSpreadT3,
        pickLine: spreadDispT3 ? `${pickTeamT3} ${spreadDispT3}` : `${pickTeamT3} ATS —`,
        confidence: 0,
        edgeMag: spreadMagnitude * 0.005,
        signals,
        partial: true,
        _tier: 3,
      });
    }
  }

  return picks
    .sort((a, b) => (a._tier - b._tier) || (a.partial !== b.partial ? (a.partial ? 1 : -1) : 0) || (b.edgeMag - a.edgeMag))
    .slice(0, PICKS_PER_SECTION);
}

// ─── COLUMN 3: Value Leans ───────────────────────────────────────────────────

function buildValuePicks(games, atsLeaders, atsBySlug, rankMap, championshipOdds) {
  const picks = [];

  for (const game of games) {
    if (!game.moneyline) continue;
    const { homeML, awayML } = parseMoneylinePair(game);
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

    const homeChamp = championshipOdds?.[homeSlug]?.american;
    const awayChamp = championshipOdds?.[awaySlug]?.american;
    let champAdj = 0;
    if (homeChamp != null && awayChamp != null) {
      const homeChampImpl = mlToImplied(homeChamp) ?? 0;
      const awayChampImpl = mlToImplied(awayChamp) ?? 0;
      champAdj = (homeChampImpl - awayChampImpl) * 0.15;
    }

    // Form momentum boost: when the lean-side team's recent ATS form (last30)
    // strongly aligns (>58% cover rate), nudge model probability up
    let formBoost = 0;
    const leanHomeCover = homeCover > awayCover;
    const strongFormSide = leanHomeCover ? homeAts : awayAts;
    if (strongFormSide && strongFormSide.window === 'last30' && strongFormSide.coverPct >= 58) {
      formBoost = leanHomeCover ? VL_FORM_BONUS : -VL_FORM_BONUS;
    }

    const homeModelProb = clamp(0.5 + atsDiff * VL_ATS_WEIGHT + VL_HOME_BUMP + champAdj + formBoost, 0.35, 0.75);
    const awayModelProb = 1 - homeModelProb;

    const homeValue = homeModelProb - homeImplied;
    const awayValue = awayModelProb - awayImplied;

    let pickTeam, pickML, pickProb, impliedPct, value;

    if (homeValue >= awayValue && homeValue >= VL_VALUE_MIN) {
      if (homeML <= VL_AVOID_PRICE) continue;
      pickTeam = game.homeTeam; pickML = homeML; pickProb = homeModelProb; impliedPct = homeImplied; value = homeValue;
    } else if (awayValue >= VL_VALUE_MIN) {
      if (awayML <= VL_AVOID_PRICE) continue;
      pickTeam = game.awayTeam; pickML = awayML; pickProb = awayModelProb; impliedPct = awayImplied; value = awayValue;
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
      if (atsRec) signals.push(`Recent ATS form: ${Math.round(atsRec.coverPct)}%`);
    }

    const opponentTeamV = pickTeam === game.homeTeam ? game.awayTeam : game.homeTeam;
    const opponentSlugV = pickTeam === game.homeTeam ? getTeamSlug(game.awayTeam) : homeSlug;

    const rationale = buildValueRationale({ pickTeam, opponentTeam: opponentTeamV, confidence, value, modelPctRounded, marketPctRounded, edgePpRounded, pickML, formBoost: formBoost !== 0 });

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
      opponentTeam: opponentTeamV,
      opponentSlug: opponentSlugV,
      pickLine,
      mlPriceLabel,
      confidence,
      value,
      edgeMag: value,
      modelPct: modelPctRounded,
      marketImpliedPct: marketPctRounded,
      edgePp: edgePpRounded,
      signals,
      rationale,
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

    const homeCoverTot = homeAts ? (homeAts.coverPct - 50) / 100 : 0;
    const awayCoverTot = awayAts ? (awayAts.coverPct - 50) / 100 : 0;
    const combinedTrend = (homeCoverTot + awayCoverTot) / 2;
    const trendMag = Math.abs(combinedTrend);

    // Suppress totals when the two sides disagree in direction (one over, one under)
    const sidesConflict = homeAts && awayAts &&
      ((homeCoverTot > 0.02 && awayCoverTot < -0.02) || (homeCoverTot < -0.02 && awayCoverTot > 0.02));
    if (sidesConflict && trendMag < TOT_OU_MED_EDGE) continue;

    const overPrice  = game.overPrice  ? fmtPrice(parseNum(game.overPrice))  : null;
    const underPrice = game.underPrice ? fmtPrice(parseNum(game.underPrice)) : null;

    const isOver = combinedTrend > 0;
    const leanLabel = trendMag >= TOT_OU_MIN_EDGE ? (isOver ? 'OVER' : 'UNDER') : null;

    let confidence = 0;
    if (trendMag >= TOT_OU_HIGH_EDGE) confidence = 2;
    else if (trendMag >= TOT_OU_MED_EDGE) confidence = 1;

    const priceStr = overPrice || underPrice ? ` (O ${overPrice ?? '—'} / U ${underPrice ?? '—'})` : '';

    const signals = [];
    if (homeAts && homeAts.coverPct != null) signals.push(`${game.homeTeam} ATS: ${Math.round(homeAts.coverPct)}% cover rate`);
    if (awayAts && awayAts.coverPct != null) signals.push(`${game.awayTeam} ATS: ${Math.round(awayAts.coverPct)}% cover rate`);
    if (sidesConflict) signals.push('Pace signals partially conflict — lean is weaker');
    else if (leanLabel) signals.push(`Combined scoring trend favors ${leanLabel.toLowerCase()}`);
    else signals.push('No clear directional edge');

    const rationale = buildTotalsRationale({ homeTeam: game.homeTeam, awayTeam: game.awayTeam, leanLabel, trendMag, marketTotal, sidesConflict, confidence });

    picks.push({
      key:      game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup:  `${game.awayTeam} @ ${game.homeTeam}`,
      homeTeam: game.homeTeam, awayTeam: game.awayTeam, homeSlug, awaySlug,
      time:     fmtTime(game.startTime || game.commence_time || game.commenceTime),
      pickType: 'total', itemType: 'lean', pickTeam: null,
      pickLine: leanLabel ? `${leanLabel} ${marketTotal}${priceStr}` : `O/U ${marketTotal}${priceStr}`,
      leanDirection: leanLabel ?? null, confidence, lineValue: marketTotal,
      edgeMag: trendMag, signals, rationale, partial: false,
    });
  }

  return picks.sort((a, b) => b.edgeMag - a.edgeMag).slice(0, PICKS_PER_SECTION);
}

// ─── rationale builders (explainability strings) ─────────────────────────────

function buildPickEmRationale({ pickTeam, opponentTeam, confidence, edgeMag, pickRank, oppRank, pickAts, marketProb, pickHome, pickML, tier }) {
  const parts = [];
  const confLabel = confidenceLabel(confidence);
  const edgePct = Math.round(edgeMag * 100);

  if (tier === 1) {
    parts.push(`Full-model composite edge of ${edgePct}pp favors ${pickTeam}.`);
  } else if (tier === 2) {
    parts.push(`Reduced-model edge of ${edgePct}pp with partial enrichment data.`);
  } else {
    parts.push(`Market-implied lean on ${pickTeam} — limited model data available.`);
  }

  if (pickRank != null && pickRank <= 25 && (oppRank == null || oppRank > 25)) {
    parts.push(`Ranking advantage: #${pickRank} vs unranked.`);
  } else if (pickRank != null && oppRank != null && pickRank < oppRank) {
    parts.push(`Higher-ranked (#${pickRank} vs #${oppRank}).`);
  }

  if (pickAts && pickAts.coverPct >= 58) {
    parts.push(`Strong recent form — ${Math.round(pickAts.coverPct)}% ATS cover rate.`);
  }

  if (pickHome) parts.push('Home court advantage factored in.');

  if (pickML != null && pickML >= 150) {
    parts.push('Underdog value — market may be underestimating win probability.');
  } else if (pickML != null && pickML <= -500) {
    parts.push('Heavy favorite — chalk deflation applied to sort ranking.');
  }

  return parts.join(' ');
}

function buildAtsRationale({ pickTeam, opponentTeam, confidence, edgeMag, pickAts, oppAts, spreadMagnitude, teamSpreadNum, isBigFav, pickIsFav }) {
  const parts = [];
  const edgePct = Math.round(edgeMag * 100);

  if (pickAts && oppAts) {
    parts.push(`ATS differential: ${Math.round(pickAts.coverPct)}% vs ${Math.round(oppAts.coverPct)}% (${edgePct}pp adjusted edge).`);
  }

  if (spreadMagnitude != null && spreadMagnitude >= 10) {
    parts.push(`Large spread (${Math.abs(teamSpreadNum)}) — spread-magnitude penalty applied.`);
    if (pickIsFav) {
      parts.push('Favorite cover at this magnitude carries elevated risk.');
    }
  } else if (spreadMagnitude != null && spreadMagnitude <= 3) {
    parts.push('Close line — matchup efficiency edge in pick-em range.');
  }

  if (confidence >= 2) {
    parts.push('Edge exceeds HIGH threshold after spread-discount adjustment.');
  } else if (confidence >= 1) {
    parts.push('Moderate edge — directional lean with reasonable conviction.');
  } else {
    parts.push('Marginal ATS lean — spread value at the margin.');
  }

  return parts.join(' ');
}

function buildValueRationale({ pickTeam, opponentTeam, confidence, value, modelPctRounded, marketPctRounded, edgePpRounded, pickML, formBoost }) {
  const parts = [];

  parts.push(`Model win probability (${modelPctRounded}%) exceeds market implied (${marketPctRounded}%) by ${edgePpRounded}pp.`);

  if (pickML != null && pickML >= 200) {
    parts.push('Underdog pricing suggests the market may be undervaluing this matchup.');
  } else if (pickML != null && pickML >= 100) {
    parts.push('Slight underdog with a meaningful probability gap.');
  }

  if (formBoost) {
    parts.push('Recent form (last 30 ATS) aligns with model lean — form bonus applied.');
  }

  if (confidence >= 2) {
    parts.push('Value gap exceeds HIGH threshold — strongest model-vs-market divergence.');
  } else if (confidence >= 1) {
    parts.push('Moderate value gap detected.');
  } else {
    parts.push('Edge qualifies but gap is narrow — thinner lean.');
  }

  return parts.join(' ');
}

function buildTotalsRationale({ homeTeam, awayTeam, leanLabel, trendMag, marketTotal, sidesConflict, confidence }) {
  const parts = [];
  const trendPct = Math.round(trendMag * 100);

  if (leanLabel) {
    parts.push(`Combined ATS trend (${trendPct}pp) leans ${leanLabel} ${marketTotal}.`);
  } else {
    parts.push(`No clear directional signal on ${homeTeam} vs ${awayTeam} total (${marketTotal}).`);
  }

  if (sidesConflict) {
    parts.push('Pace signals partially conflict between the two sides — lean carries elevated uncertainty.');
  }

  if (confidence >= 2) {
    parts.push('Both sides agree directionally with strong magnitude.');
  } else if (confidence >= 1) {
    parts.push('Moderate trend agreement — directional lean with caveats.');
  } else if (leanLabel) {
    parts.push('Marginal lean — trend exists but magnitude is low.');
  }

  return parts.join(' ');
}

// ─── watch item helpers (with debug reason codes) ────────────────────────────

function buildWatchBase(game, pickType, debugReason) {
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
    _debugReason:     debugReason || 'unknown',
  };
}

function buildPickEmWatches(games, leanKeys, needed) {
  const watches = [];
  for (const game of games) {
    if (watches.length >= needed) break;
    if (leanKeys.has(baseGameKey(game))) continue;
    if (!hasMoneylineLine(game) && !hasSpreadLine(game)) continue;

    let reason = 'insufficient_edge';
    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);
    if (!homeSlug && !awaySlug) reason = 'unresolved_team_identity';
    else if (!hasMoneylineLine(game) && !hasSpreadLine(game)) reason = 'missing_market_data';

    watches.push({
      ...buildWatchBase(game, 'pickem', reason),
      pickLine: `${game.awayTeam} @ ${game.homeTeam}`,
      watchReason: 'Monitoring — edge below threshold.',
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

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);
    let reason = 'insufficient_edge';
    if (!homeSlug && !awaySlug) reason = 'unresolved_team_identity';

    const { spread: homeSpreadNum } = getTeamSpread(game, true);
    const { spread: awaySpreadNum } = getTeamSpread(game, false);
    const favIsHome = homeSpreadNum != null && homeSpreadNum < 0;
    const favTeam   = favIsHome ? game.homeTeam : game.awayTeam;
    const favSpread = favIsHome ? fmtSpread(homeSpreadNum) : fmtSpread(awaySpreadNum ?? null);
    const pickLine  = favSpread ? `${favTeam} ${favSpread}` : `${game.awayTeam} @ ${game.homeTeam}`;

    watches.push({
      ...buildWatchBase(game, 'ats', reason),
      spread: homeSpreadNum,
      pickLine,
      watchReason: 'Lines posted. Edge below threshold.',
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
      ...buildWatchBase(game, 'value', 'insufficient_value_gap'),
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
      ...buildWatchBase(game, 'total', 'no_directional_edge'),
      pickLine:  `O/U ${marketTotal}`,
      lineValue: marketTotal,
      watchReason: 'Line posted. Monitoring for directional lean.',
    });
  }
  return watches;
}

// ─── public API ───────────────────────────────────────────────────────────────

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

  // Deduplicate by team matchup — same pair of teams from different sources
  // (ESPN scores vs Odds API) can produce different gameIds but identical matchups.
  const seenMatchups = new Set();
  const dedupedGames = [];
  for (const g of sortedGames) {
    const key = baseGameKey(g);
    if (key && seenMatchups.has(key)) continue;
    if (key) seenMatchups.add(key);
    dedupedGames.push(g);
  }

  const rawPickEm = buildPickEmPicks(dedupedGames, atsLeaders, atsBySlug, rankMap, championshipOdds);
  const rawAts    = buildSpreadPicks(dedupedGames, atsLeaders, atsBySlug, rankMap, championshipOdds);
  const rawValue  = buildValuePicks(dedupedGames, atsLeaders, atsBySlug, rankMap, championshipOdds);
  const rawTotals = buildTotalsPicks(dedupedGames, atsLeaders, atsBySlug);

  const pickEmKeys  = new Set(rawPickEm.map(baseGameKey));
  const atsKeys     = new Set(rawAts.map(baseGameKey));
  const valueKeys   = new Set(rawValue.map(baseGameKey));
  const totalsKeys  = new Set(rawTotals.map(baseGameKey));

  const pickEmWatches  = buildPickEmWatches(dedupedGames, pickEmKeys, Math.max(0, TARGET_SHOW - rawPickEm.length));
  const atsWatches     = buildSpreadWatches(dedupedGames, atsKeys, Math.max(0, TARGET_SHOW - rawAts.length));
  const valueWatches   = buildValueWatches(dedupedGames, valueKeys, Math.max(0, TARGET_SHOW - rawValue.length));
  const totalsWatches  = buildTotalsWatches(dedupedGames, totalsKeys, Math.max(0, TARGET_SHOW - rawTotals.length));

  const finalPickEm = [...rawPickEm, ...pickEmWatches];
  const finalAts    = [...rawAts, ...atsWatches];
  const finalValue  = [...rawValue, ...valueWatches];
  const finalTotals = [...rawTotals, ...totalsWatches];

  return {
    pickEmPicks:  finalPickEm,
    atsPicks:     finalAts,
    valuePicks:   finalValue,
    totalsPicks:  finalTotals,
    mlPicks:      finalValue,
  };
}

export function buildPicksSummary({ pickEmPicks = [], atsPicks = [], valuePicks, mlPicks, totalsPicks = [] } = {}) {
  const valPicks = valuePicks ?? mlPicks ?? [];
  const topPickEm = pickEmPicks.find((p) => p.itemType === 'lean');
  const topAts    = atsPicks.find((p) => p.itemType === 'lean');
  const topValue  = valPicks.find((p) => p.itemType === 'lean');

  if (!topPickEm && !topAts && !topValue) {
    if (totalsPicks.length > 0) return 'No strong leans today. Totals available for monitoring.';
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

/**
 * buildBoardBriefing — editorial intelligence summary for the picks board.
 *
 * Detects board state (spread-heavy, value-heavy, totals-heavy, mixed, quiet)
 * and generates 1–2 sentence prose with standout examples.
 *
 * Returns { headline, body, boardType } or null when no leans exist.
 */
const HEADLINE_TEMPLATES = {
  spreads: [
    'Spread signals are driving the strongest edge today, led by {p1} and {p2}.',
    'ATS edges are the headline of today\u2019s board, with {p1} and {p2} standing out.',
    'The model is locking onto spread edges today, led by {p1} and {p2}.',
  ],
  value: [
    'Longshot value is unusually active today, with {p1} and {p2} highlighting the board.',
    'Value edges are clustering across the board, led by {p1} and {p2}.',
    'The model sees asymmetric value today, headlined by {p1} and {p2}.',
  ],
  totals: [
    'Totals are carrying the strongest edge today, with scoring signals clustering around {p1}.',
    'Game totals are the most actionable part of today\u2019s board, led by {p1}.',
    'Environment-driven signals are leading today, with {p1} at the top.',
  ],
  pickem: [
    'Straight-up winner signals are leading the board, with {p1} and {p2} standing out.',
    'The model is most confident on outright winners today, led by {p1} and {p2}.',
    'Pick \u2019em leans are the clearest signals today, highlighted by {p1} and {p2}.',
  ],
  mixed: [
    'Signals are spread across the board today, with notable edges on {angles}.',
    'Today\u2019s board is diversified, with the model seeing {angles}.',
    'Multiple angles are active today, including {angles}.',
  ],
};

const TONE_MODIFIERS = {
  favoritesHeavy: 'Favorites dominate the model board today.',
  underdogValue:  'Underdog value is appearing more frequently than usual.',
  lightSignals:   'Signals are lighter than usual across today\u2019s slate.',
  strongBoard:    'This is one of the sharper boards the model has produced recently.',
};

function templateRotate(templates) {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return templates[dayOfYear % templates.length];
}

export function buildBoardBriefing({ pickEmPicks = [], atsPicks = [], valuePicks, mlPicks, totalsPicks = [] } = {}) {
  const valPicks = valuePicks ?? mlPicks ?? [];

  const peLeans  = pickEmPicks.filter(p => p.itemType === 'lean');
  const atsLeans = atsPicks.filter(p => p.itemType === 'lean');
  const valLeans = valPicks.filter(p => p.itemType === 'lean');
  const totLeans = totalsPicks.filter(p => p.itemType === 'lean' && p.leanDirection);

  const totalLeans = peLeans.length + atsLeans.length + valLeans.length + totLeans.length;
  if (totalLeans === 0) return null;

  const highAts = atsLeans.filter(p => p.confidence >= 2);
  const highVal = valLeans.filter(p => p.confidence >= 2);
  const highTot = totLeans.filter(p => p.confidence >= 2);
  const highPe  = peLeans.filter(p => p.confidence >= 2);
  const totalHigh = highAts.length + highVal.length + highTot.length + highPe.length;

  function pickLabel(p) {
    return p.pickLine || p.pickTeam || '';
  }

  function topExamples(arr, n = 2) {
    return [...arr]
      .sort((a, b) => (b.confidence - a.confidence) || ((b.edgeMag ?? 0) - (a.edgeMag ?? 0)))
      .slice(0, n)
      .map(pickLabel)
      .filter(Boolean);
  }

  function listStr(arr) {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  const atsScore = atsLeans.length * 2 + highAts.length * 3;
  const valScore = valLeans.length * 2 + highVal.length * 3;
  const totScore = totLeans.length * 2 + highTot.length * 3;
  const peScore  = peLeans.length * 2 + highPe.length * 3;
  const maxScore = Math.max(atsScore, valScore, totScore, peScore);
  const totalScore = atsScore + valScore + totScore + peScore;

  const isConcentrated = maxScore >= totalScore * 0.45;

  let boardType = 'mixed';
  let headline = '';
  let body = '';

  if (isConcentrated && atsScore === maxScore && atsLeans.length >= 2) {
    boardType = 'spreads';
    const ex = topExamples(atsLeans);
    const tpl = templateRotate(HEADLINE_TEMPLATES.spreads);
    headline = tpl.replace('{p1}', ex[0] || '').replace('{p2}', ex[1] || '');
    body = valLeans.length > 0
      ? `${valLeans.length} value spot${valLeans.length > 1 ? 's' : ''} also qualifying.`
      : '';
  } else if (isConcentrated && valScore === maxScore && valLeans.length >= 2) {
    boardType = 'value';
    const ex = topExamples(valLeans);
    const tpl = templateRotate(HEADLINE_TEMPLATES.value);
    headline = tpl.replace('{p1}', ex[0] || '').replace('{p2}', ex[1] || '');
    body = atsLeans.length > 0
      ? `${atsLeans.length} spread signal${atsLeans.length > 1 ? 's' : ''} also active.`
      : '';
  } else if (isConcentrated && totScore === maxScore && totLeans.length >= 2) {
    boardType = 'totals';
    const ex = topExamples(totLeans);
    const tpl = templateRotate(HEADLINE_TEMPLATES.totals);
    headline = tpl.replace('{p1}', ex[0] || '').replace('{p2}', ex[1] || '');
    const overCount = totLeans.filter(p => p.leanDirection === 'OVER').length;
    const underCount = totLeans.filter(p => p.leanDirection === 'UNDER').length;
    body = underCount > overCount
      ? 'Under signals are clustering around lower-tempo matchups.'
      : overCount > underCount
        ? 'Over signals are pointing to high-scoring environments.'
        : 'Over and under signals are both active.';
  } else if (isConcentrated && peScore === maxScore && peLeans.length >= 2) {
    boardType = 'pickem';
    const ex = topExamples(peLeans);
    const tpl = templateRotate(HEADLINE_TEMPLATES.pickem);
    headline = tpl.replace('{p1}', ex[0] || '').replace('{p2}', ex[1] || '');
    body = atsLeans.length > 0 ? 'Spread edges are also available.' : '';
  } else {
    boardType = 'mixed';
    const angles = [];
    if (atsLeans.length > 0) {
      const ex = topExamples(atsLeans, 1);
      angles.push(ex.length > 0 ? `spread edges led by ${ex[0]}` : `${atsLeans.length} spread signal${atsLeans.length > 1 ? 's' : ''}`);
    }
    if (valLeans.length > 0) {
      const ex = topExamples(valLeans, 1);
      angles.push(ex.length > 0 ? `value on ${ex[0]}` : `${valLeans.length} value play${valLeans.length > 1 ? 's' : ''}`);
    }
    if (totLeans.length > 0) {
      angles.push(`${totLeans.length} total${totLeans.length > 1 ? 's' : ''} signal${totLeans.length > 1 ? 's' : ''}`);
    }
    if (peLeans.length > 0 && angles.length < 3) {
      angles.push(`${peLeans.length} straight-up lean${peLeans.length > 1 ? 's' : ''}`);
    }
    const tpl = templateRotate(HEADLINE_TEMPLATES.mixed);
    headline = tpl.replace('{angles}', listStr(angles));
    body = '';
  }

  // Tone modifier — append when applicable
  const favLeans = [...atsLeans, ...peLeans].filter(p => {
    const ml = parseInt(String(p.mlPriceLabel || '').replace('+', ''), 10);
    return !isNaN(ml) && ml < 0;
  });
  const dogLeans = valLeans.filter(p => {
    const ml = parseInt(String(p.mlPriceLabel || '').replace('+', ''), 10);
    return !isNaN(ml) && ml >= 300;
  });

  let tone = '';
  if (totalLeans <= 4 && totalHigh === 0) {
    tone = TONE_MODIFIERS.lightSignals;
  } else if (totalHigh >= 4) {
    tone = TONE_MODIFIERS.strongBoard;
  } else if (dogLeans.length >= 3) {
    tone = TONE_MODIFIERS.underdogValue;
  } else if (favLeans.length >= Math.ceil(totalLeans * 0.7)) {
    tone = TONE_MODIFIERS.favoritesHeavy;
  }

  if (tone && body) {
    body = body + ' ' + tone;
  } else if (tone) {
    body = tone;
  }

  // Board strength
  let boardStrength = 'Moderate';
  if (totalHigh >= 4 || totalLeans >= 12) {
    boardStrength = 'Strong';
  } else if (totalLeans <= 4 && totalHigh === 0) {
    boardStrength = 'Light';
  }

  return { headline, body, boardType, boardStrength };
}
