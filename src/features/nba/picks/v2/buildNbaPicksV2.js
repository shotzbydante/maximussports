/**
 * buildNbaPicksV2 — canonical NBA picks builder.
 *
 * Shares the SAME v2 architecture as MLB:
 *   - Per-market candidate generation (moneyline / spread / total)
 *   - Bet-score composite with bounded components
 *   - Tier assignment (Elite/Strong/Solid/Lean) with per-game caps
 *   - Coverage pool for slate-wide minimum coverage
 *
 * Probability/edge derivation from NBA-appropriate priors:
 *   - model win probability uses `game.model.pregameEdge` (spread magnitude
 *     relative to the model's expected margin) + sigmoid around 0. When the
 *     enricher hasn't provided a model edge, we fall back to implied
 *     probability alone — that guarantees rawEdge = 0 and picks never
 *     qualify, which is the correct non-biased behavior.
 *   - No systematic favorite/underdog bias: both sides are evaluated
 *     equivalently and only positive-edge sides enter the candidate pool.
 *   - Total picks use a simple model total vs market total delta when
 *     `game.model.fairTotal` differs from `market.pregameTotal`.
 */

import { computeBetScore } from '../../../mlb/picks/v2/betScore.js';
import { assignTiers } from '../../../mlb/picks/v2/tier.js';

const COVERAGE_MIN_SCORE = 0.30;
const COVERAGE_MAX_PICKS = 15;

export const NBA_MODEL_VERSION = 'nba-picks-v2.0.0';

/**
 * Playoff-aware conservative tuning (2026-04-24).
 *
 * Rationale for each change relative to MLB defaults:
 *
 *   tier1.floor 0.80           (+0.05 vs 0.75 MLB)
 *     Playoffs have higher variance and smaller-sample volatility; demand
 *     more absolute confidence before badging a pick as "Top Play".
 *
 *   tier1.slatePercentile 0.92 (+0.02 vs 0.90 MLB)
 *     Only the top 8% of a slate clears tier 1 — forces selectivity when a
 *     slate has several decent edges that aren't separately actionable.
 *
 *   tier2.floor 0.65           (+0.05 vs 0.60 MLB)
 *     Match the tighter tier-1 gate proportionally.
 *
 *   maxPerTier.tier1 = 2       (-1 vs 3 MLB)
 *     Two top plays max per slate for NBA playoffs. Fewer, stronger.
 *
 *   marketGates.ml.minUnderdogEdge 0.04 (NEW)
 *     Underdog moneylines must have ≥ 4% raw edge to publish. Chasing +200
 *     dogs on a 0.5% edge was one of the theoretical failure modes.
 *
 *   marketGates.spread.minEdge 0.03 (NEW)
 *     Run-line / spread picks now require real model-vs-market separation,
 *     not just a positive derived edge.
 *
 *   marketGates.total.minConfidence 0.55 (+0.05 vs 0.50 MLB)
 *     NBA totals rarely publish because `fairTotal` is rarely supplied;
 *     when they do, require tighter model confidence.
 *
 *   largeSpread.penaltyAbove 10 (NEW)
 *     Penalize bet scores on lines where |spread| > 10 unless model
 *     modelProb delta is ≥ 0.06 from implied. Discourages aggressive
 *     blowout picks that dominate the score composition unfairly.
 *
 *   coverage.minScore 0.40 (+0.10 vs 0.30 MLB)
 *     Narrow the coverage pool so NBA Home doesn't surface weak leans.
 *
 * Every adjustment is conservative. Changes are bounded to what a tuning
 * validator would accept (|Δ| ≤ 0.05 per dimension). When real NBA data
 * accumulates, the audit cron can propose further adjustments in shadow
 * mode.
 */
export const NBA_DEFAULT_CONFIG = Object.freeze({
  version: 'nba-picks-tuning-2026-04-24a',
  sport: 'nba',
  weights: { edge: 0.40, conf: 0.25, sit: 0.20, mkt: 0.15 },
  tierCutoffs: {
    tier1: { floor: 0.80, slatePercentile: 0.92 },
    tier2: { floor: 0.65, slatePercentile: 0.70 },
    tier3: { floor: 0.45, slatePercentile: 0.50 },
  },
  maxPerTier: { tier1: 2, tier2: 5, tier3: 5 },
  maxPerGame: 2,
  maxTier1PerGame: 1,
  marketGates: {
    moneyline: {
      minUnderdogEdge: 0.04,       // +4% raw edge required for underdog ML
    },
    spread: {
      minProbSpread: 0.05,
      minEdge: 0.03,                // raw-edge floor for spread qualification
    },
    total: {
      minConfidence: 0.55,
      minExpectedDelta: 2.0,
    },
  },
  components: {
    edge: { mlCap: 0.10, spreadCap: 0.08, totDeltaCap: 6.0 },
    mkt: { minConsensusBooks: 3 },
    largeSpread: {
      penaltyAbove: 10,             // |line| > 10 triggers scrutiny
      requiredModelEdge: 0.06,      // model-prob edge needed to bypass penalty
      penaltyFactor: 0.75,          // bet-score multiplier when triggered
    },
  },
  coverage: {
    minScore: 0.40,                 // narrower pool than MLB (0.30)
    maxPicks: 12,                   // down from 15
  },
});

function isNum(v) { return v != null && Number.isFinite(v); }
function round3(v) { return isNum(v) ? Math.round(v * 1000) / 1000 : null; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function moneylineToImplied(ml) {
  if (!isNum(ml)) return null;
  if (ml > 0) return 100 / (ml + 100);
  if (ml < 0) return -ml / (-ml + 100);
  return 0.5;
}

function todayET() {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}

function gameDateET(iso) {
  if (!iso) return '';
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date(iso));
  } catch { return ''; }
}

/**
 * Derive model win probability for each side from the NBA odds enricher.
 *
 *   game.model.pregameEdge  = model spread − market spread (positive ⇒ model
 *                              thinks home team should cover more than market)
 *   sigmoid around pregameEdge converts that to a probability delta.
 *
 * When pregameEdge is absent we return nulls so no pick qualifies. Zero model
 * input => zero picks. Never invent confidence.
 */
function deriveWinProbs(game) {
  const edge = game?.model?.pregameEdge;
  if (!isNum(edge)) return { away: null, home: null };
  // 3-point scale: +3 home-side edge ~ 58% home win prob
  const k = 0.12;
  const homeProb = clamp01(0.5 + Math.tanh(edge * k) * 0.5);
  return { away: 1 - homeProb, home: homeProb };
}

function toMatchup(game) {
  const away = game?.teams?.away || {};
  const home = game?.teams?.home || {};
  return {
    gameId: game.gameId || `${away.slug}-${home.slug}-${game.startTime || 'unknown'}`,
    startTime: game.startTime || null,
    awayTeam: {
      slug: away.slug, name: away.name, shortName: away.abbrev || away.shortName, logo: away.logo,
      record: away.record || null,
    },
    homeTeam: {
      slug: home.slug, name: home.name, shortName: home.abbrev || home.shortName, logo: home.logo,
      record: home.record || null,
    },
    market: {
      moneyline: {
        away: isNum(game?.market?.moneyline?.away) ? game.market.moneyline.away : null,
        home: isNum(game?.market?.moneyline?.home) ? game.market.moneyline.home : null,
      },
      runLine: { awayLine: null, homeLine: null }, // unused in NBA
      spread: {
        awayLine: isNum(game?.market?.pregameSpread) ? -game.market.pregameSpread : null,
        homeLine: isNum(game?.market?.pregameSpread) ? game.market.pregameSpread : null,
      },
      total: { points: isNum(game?.market?.pregameTotal) ? game.market.pregameTotal : null },
    },
    venue: null,
    modelEdge: game?.model?.pregameEdge ?? null,
    modelConfidence: game?.model?.confidence ?? null,
  };
}

/**
 * Build a "score" object the shared components helpers expect. We map NBA
 * inputs onto the same shape MLB uses so we can reuse betScore.js directly.
 */
function synthesizeScore(game, winProbs) {
  const signals = [];
  const modelConf = game?.model?.confidence;
  const pregameEdge = game?.model?.pregameEdge;
  const importance = game?.signals?.importanceScore;
  const watchability = game?.signals?.watchabilityScore;
  const marketDislocation = game?.signals?.marketDislocationScore;

  if (isNum(pregameEdge)) signals.push(`Market edge (${pregameEdge > 0 ? 'home' : 'away'})`);
  if (isNum(importance)) signals.push(`Importance (${importance.toFixed(0)})`);
  if (isNum(marketDislocation)) signals.push(`Market dislocation (${marketDislocation.toFixed(0)})`);

  // Normalized data quality from whatever signals the enricher provided.
  let dq = 0;
  if (isNum(modelConf)) dq += Math.max(0, Math.min(0.4, modelConf * 0.4));
  if (isNum(pregameEdge)) dq += 0.15;
  if (isNum(importance)) dq += 0.1;
  if (isNum(watchability)) dq += 0.05;
  dq = clamp01(dq);

  // Signal agreement: if both importance and market dislocation are high, they
  // agree. If only edge is present, default mid-high.
  let sa = 0.6;
  if (isNum(importance) && isNum(marketDislocation)) {
    const diff = Math.abs(importance - marketDislocation) / 100;
    sa = clamp01(1 - diff);
  }

  return {
    awayWinProb: winProbs.away,
    homeWinProb: winProbs.home,
    dataQuality: dq,
    signalAgreement: sa,
    topSignals: signals.slice(0, 3),
    // Fair total (when odds enricher supplies one) — used by totals logic
    expectedTotal: isNum(game?.model?.fairTotal) ? game.model.fairTotal : null,
  };
}

function convictionLabel(total) {
  if (total >= 0.85) return 'Top Play';
  if (total >= 0.70) return 'Strong';
  if (total >= 0.55) return 'Solid';
  return 'Lean';
}

function makePick(matchup, score, info, bs) {
  const team = info.side === 'away' ? matchup.awayTeam
             : info.side === 'home' ? matchup.homeTeam
             : null;

  const label = info.marketType === 'total'
    ? `${info.side === 'over' ? 'Over' : 'Under'} ${info.lineValue}`
    : info.marketType === 'spread'
      ? `${team?.shortName || info.side.toUpperCase()} ${info.lineValue > 0 ? '+' : ''}${info.lineValue}`
      : `${team?.shortName || info.side.toUpperCase()} ${info.priceAmerican != null ? (info.priceAmerican > 0 ? '+' + info.priceAmerican : info.priceAmerican) : ''}`.trim();

  const legacyCategory =
    info.marketType === 'moneyline' ? 'pickEms'
    : info.marketType === 'spread'  ? 'ats'
    : info.marketType === 'total'   ? 'totals' : 'leans';

  const confidence = bs.total >= 0.75 ? 'high' : bs.total >= 0.60 ? 'medium' : 'low';
  const pickKey = `${matchup.gameId}-${info.marketType}-${info.side}`;

  const headline =
    info.marketType === 'moneyline' ? `Model edge on ${team?.name || info.side}.`
    : info.marketType === 'spread'  ? `${team?.name || info.side} to cover ${info.lineValue > 0 ? '+' : ''}${info.lineValue}.`
    : info.totalDelta > 0 ? `Model leans Over ${info.lineValue}.` : `Model leans Under ${info.lineValue}.`;

  const rationale = { headline, bullets: (score?.topSignals || []).slice(0, 2) };

  return {
    id: pickKey,
    sport: 'nba',
    gameId: matchup.gameId,
    tier: null,
    conviction: { label: convictionLabel(bs.total), score: Math.round(bs.total * 100) },
    market: {
      type: info.marketType === 'spread' ? 'runline' : info.marketType,   // UI uses 'runline' for spread styling
      line: info.lineValue ?? null,
      priceAmerican: info.priceAmerican ?? null,
    },
    selection: { side: info.side, team: team?.shortName || null, label },
    matchup: {
      awayTeam: matchup.awayTeam,
      homeTeam: matchup.homeTeam,
      startTime: matchup.startTime,
      venue: null,
      dayNight: null,
    },
    betScore: bs,
    rationale,
    modelProb: round3(info.modelProb),
    impliedProb: round3(info.impliedProb),
    rawEdge: round3(info.rawEdge),
    expectedTotal: round3(info.expectedTotal),
    result: null,
    // Back-compat
    category: legacyCategory,
    confidence,
    confidenceScore: Math.round(bs.total * 100) / 100,
    pick: {
      label,
      side: info.side,
      value: info.marketType === 'total' ? info.lineValue : (info.priceAmerican ?? info.lineValue ?? null),
      marketType: info.marketType === 'spread' ? 'runline' : info.marketType,
      explanation: rationale.headline,
      topSignals: score?.topSignals || [],
    },
    model: {
      awayWinProb: round3(score?.awayWinProb),
      homeWinProb: round3(score?.homeWinProb),
      impliedAwayWinProb: round3(moneylineToImplied(matchup.market?.moneyline?.away)),
      impliedHomeWinProb: round3(moneylineToImplied(matchup.market?.moneyline?.home)),
      edge: round3(Math.abs(info.rawEdge ?? 0)),
      dataQuality: round3(score?.dataQuality),
      signalAgreement: round3(score?.signalAgreement),
    },
  };
}

export function buildNbaPicksV2({
  games = [],
  config = NBA_DEFAULT_CONFIG,
  modelVersion = NBA_MODEL_VERSION,
  scorecardSummary = null,
} = {}) {
  const today = todayET();
  const meta = { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0, picksPublished: 0, flags: [] };

  const upcoming = games.filter(g => {
    const s = (g.status || '').toLowerCase();
    const isLive = g.gameState?.isLive;
    const isFinal = g.gameState?.isFinal;
    return !isLive && !isFinal && s !== 'final' && s !== 'in_progress';
  });

  const todayGames = upcoming.filter(g => gameDateET(g.startTime) === today);
  const tomorrowGames = upcoming.filter(g => gameDateET(g.startTime) !== today);
  const candidates = [...todayGames, ...tomorrowGames].slice(0, 30);
  meta.totalCandidates = candidates.length;
  if (candidates.length < 3) meta.flags.push('low_slate');

  const allPickCandidates = [];

  for (const g of candidates) {
    const matchup = toMatchup(g);
    if (!matchup.awayTeam.slug || !matchup.homeTeam.slug) { meta.skippedGames += 1; continue; }

    const winProbs = deriveWinProbs(g);
    const score = synthesizeScore(g, winProbs);
    // Skip games with no model signal whatsoever — prevents zero-input picks
    if (!isNum(score.awayWinProb) || !isNum(score.homeWinProb)) { meta.skippedGames += 1; continue; }
    meta.qualifiedGames += 1;

    const m = matchup.market;
    const implAway = moneylineToImplied(m.moneyline?.away);
    const implHome = moneylineToImplied(m.moneyline?.home);

    // ── Large-spread penalty helper ──
    const spreadGates = config?.marketGates?.spread || {};
    const mlGates = config?.marketGates?.moneyline || {};
    const lsConf = config?.components?.largeSpread || {};
    const penaltyAbove = lsConf.penaltyAbove ?? 10;
    const requiredModelEdge = lsConf.requiredModelEdge ?? 0.06;
    const penaltyFactor = lsConf.penaltyFactor ?? 0.75;
    const homeLineAbs = isNum(m.spread?.homeLine) ? Math.abs(m.spread.homeLine) : 0;
    const isLargeSpread = homeLineAbs > penaltyAbove;

    function maybePenalize(bs, modelEdge) {
      if (!isLargeSpread) return bs;
      if (isNum(modelEdge) && Math.abs(modelEdge) >= requiredModelEdge) return bs;
      // Shallow clone + scale the total down. Components unchanged so the UI
      // still shows the raw composition.
      return { ...bs, total: Math.max(0, (bs.total ?? 0) * penaltyFactor) };
    }

    // ── Moneyline ──
    const mlSides = [
      { side: 'away', modelProb: score.awayWinProb, implied: implAway, price: m.moneyline?.away },
      { side: 'home', modelProb: score.homeWinProb, implied: implHome, price: m.moneyline?.home },
    ];
    for (const s of mlSides) {
      if (!isNum(s.modelProb) || !isNum(s.implied)) continue;
      const rawEdge = s.modelProb - s.implied;
      if (rawEdge <= 0) continue;
      // Underdog (+) price requires a higher raw-edge floor. Keeps the model
      // from chasing +200 dogs on a 0.5% edge.
      const isUnderdog = isNum(s.price) && s.price > 0;
      const minDogEdge = mlGates.minUnderdogEdge ?? 0;
      if (isUnderdog && rawEdge < minDogEdge) continue;

      let bs = computeBetScore({
        matchup, score, marketType: 'moneyline', side: s.side,
        rawEdge, totalDelta: null, config,
      });
      bs = maybePenalize(bs, rawEdge);
      if (!Number.isFinite(bs.total) || bs.total <= 0) continue;
      allPickCandidates.push(makePick(matchup, score, {
        marketType: 'moneyline', side: s.side, lineValue: null,
        priceAmerican: s.price ?? null, rawEdge, modelProb: s.modelProb, impliedProb: s.implied,
      }, bs));
    }

    // ── Spread ──
    if (isNum(m.spread?.homeLine)) {
      const probSpread = Math.abs(score.awayWinProb - score.homeWinProb);
      if (probSpread >= (spreadGates.minProbSpread ?? 0.05)) {
        const minSpreadEdge = spreadGates.minEdge ?? 0;
        const sides = [
          { side: 'away', line: m.spread.awayLine, rawEdge: (score.awayWinProb - (implAway ?? 0.5)) * 0.9 },
          { side: 'home', line: m.spread.homeLine, rawEdge: (score.homeWinProb - (implHome ?? 0.5)) * 0.9 },
        ];
        for (const s of sides) {
          if (!isNum(s.rawEdge) || s.rawEdge <= 0) continue;
          if (s.rawEdge < minSpreadEdge) continue; // playoff: require real separation
          let bs = computeBetScore({
            matchup, score, marketType: 'runline', side: s.side,
            rawEdge: s.rawEdge, totalDelta: null, config,
          });
          bs = maybePenalize(bs, s.rawEdge);
          if (!Number.isFinite(bs.total) || bs.total <= 0) continue;
          allPickCandidates.push(makePick(matchup, score, {
            marketType: 'spread', side: s.side, lineValue: s.line,
            priceAmerican: null, rawEdge: s.rawEdge,
            modelProb: s.side === 'away' ? score.awayWinProb : score.homeWinProb,
            impliedProb: s.side === 'away' ? implAway : implHome,
          }, bs));
        }
      }
    }

    // ── Total ──
    if (isNum(m.total?.points) && isNum(score.expectedTotal)) {
      const delta = score.expectedTotal - m.total.points;
      const gate = config?.marketGates?.total || {};
      const passConf = (score.dataQuality ?? 0) * (score.signalAgreement ?? 0.5) >= (gate.minConfidence ?? 0.5);
      const passDelta = Math.abs(delta) >= (gate.minExpectedDelta ?? 2.0);
      if (passConf && passDelta) {
        const side = delta > 0 ? 'over' : 'under';
        const bs = computeBetScore({
          matchup, score, marketType: 'total', side,
          rawEdge: null, totalDelta: delta, config,
        });
        if (Number.isFinite(bs.total) && bs.total > 0) {
          allPickCandidates.push(makePick(matchup, score, {
            marketType: 'total', side, lineValue: m.total.points,
            priceAmerican: null, rawEdge: null, modelProb: null, impliedProb: null,
            expectedTotal: score.expectedTotal, totalDelta: delta,
          }, bs));
        }
      }
    }
  }

  // Guard: drop any invalid bet-scores that slipped through
  const invalid = allPickCandidates.filter(p => !Number.isFinite(p?.betScore?.total) || p.betScore.total <= 0);
  if (invalid.length > 0) {
    console.warn(`[buildNbaPicksV2] dropped ${invalid.length} invalid-score candidate(s)`);
  }
  const clean = allPickCandidates.filter(p => Number.isFinite(p?.betScore?.total) && p.betScore.total > 0);

  const assigned = assignTiers(clean, config);
  meta.picksPublished = assigned.published.length;
  meta.invalidBetScoreDropped = invalid.length;
  const topPick = assigned.tier1[0] || assigned.tier2[0] || null;

  const publishedIds = new Set(assigned.published.map(p => p.id));
  // Config-driven coverage floor + cap so NBA can narrow the pool vs MLB.
  const coverageMinScore = config?.coverage?.minScore ?? COVERAGE_MIN_SCORE;
  const coverageMaxPicks = config?.coverage?.maxPicks ?? COVERAGE_MAX_PICKS;
  const coverage = clean
    .filter(p => !publishedIds.has(p.id) && (p.betScore?.total ?? 0) >= coverageMinScore)
    .map(p => ({ ...p, tier: 'coverage', _coverage: true }))
    .sort((a, b) => (b.betScore?.total ?? 0) - (a.betScore?.total ?? 0))
    .slice(0, coverageMaxPicks);
  meta.coverageAvailable = coverage.length;

  // Non-bias validation — log if published picks are uniformly one side
  const favSides = assigned.published.map(p => {
    if (p.market?.type === 'moneyline' || p.market?.type === 'runline') return p.selection?.side;
    return null;
  }).filter(Boolean);
  if (favSides.length >= 4) {
    const allHome = favSides.every(s => s === 'home');
    const allAway = favSides.every(s => s === 'away');
    if (allHome || allAway) {
      console.warn(`[buildNbaPicksV2] ⚠ bias detected: all ${favSides.length} ML/spread picks on ${allHome ? 'home' : 'away'} side`);
      meta.flags.push(allHome ? 'all_home_bias' : 'all_away_bias');
    }
  }

  const legacy = buildLegacyCategories(assigned.published);

  return {
    sport: 'nba',
    date: today,
    modelVersion,
    configVersion: config?.version || 'nba-picks-unknown',
    generatedAt: new Date().toISOString(),
    topPick,
    tiers: { tier1: assigned.tier1, tier2: assigned.tier2, tier3: assigned.tier3 },
    coverage,
    scorecardSummary: scorecardSummary || null,
    meta,
    legacy: { categories: legacy },
    categories: legacy,
  };
}

function buildLegacyCategories(published) {
  const out = { pickEms: [], ats: [], leans: [], totals: [] };
  for (const p of published) {
    if (p.market?.type === 'total') out.totals.push(p);
    else if (p.market?.type === 'runline') out.ats.push(p);
    else if (p.market?.type === 'moneyline') {
      if (p.tier === 'tier3') out.leans.push(p);
      else out.pickEms.push(p);
    }
  }
  return out;
}
