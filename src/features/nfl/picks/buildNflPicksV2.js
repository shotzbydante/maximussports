/**
 * buildNflPicksV2 — canonical NFL picks builder.
 *
 * Same output contract as buildMlbPicksV2 / buildNbaPicksV2 so the shared
 * picks UI, persistence, settlement and scorecard code all work unchanged:
 *
 *   { sport, date, modelVersion, configVersion, topPick,
 *     tiers: { tier1, tier2, tier3 }, coverage,
 *     fullSlatePicks, heroPicks, trackingPicks, byGame,
 *     scorecardSummary, meta, categories, legacy }
 *
 * The NFL slate is a week, not a day. Every game left in the current week
 * gets a spread, moneyline and total lean (the full-slate board); only the
 * strongest are promoted to tiers. The spread market keeps the persisted
 * key `runline` so the picks tables, grader and scorecards need no change.
 *
 * Pure and testable: no HTTP, no DB.
 */

import { assignTiers } from '../../mlb/picks/v2/tier.js';
import { NFL_MODEL, projectNflGame, priceNflGame } from './nflModel.js';

export const NFL_MODEL_VERSION = 'nfl-picks-v1.0.0';

export const NFL_DEFAULT_CONFIG = Object.freeze({
  version: 'nfl-picks-tuning-2026-11-21a',
  sport: 'nfl',
  weights: Object.freeze({ edge: 0.45, conf: 0.25, sit: 0.15, mkt: 0.15 }),
  tierCutoffs: Object.freeze({
    tier1: { floor: 0.72, slatePercentile: 0.90 },
    tier2: { floor: 0.62, slatePercentile: 0.70 },
    tier3: { floor: 0.54, slatePercentile: 0.50 },
  }),
  maxPerTier: Object.freeze({ tier1: 3, tier2: 5, tier3: 6 }),
  maxPerGame: 2,
  maxTier1PerGame: 1,
  components: Object.freeze({
    /** Blended edge (points) at which edge strength reaches ~0.86. */
    edge: { pointsCap: 2.0, mlCap: 0.05 },
  }),
  guards: Object.freeze({
    /** Moneylines outside this band are graded but never promoted. */
    mlMaxFavorite: -450,
    mlMaxUnderdog: 400,
    /** Floor for the lower-conviction coverage pool. */
    coverageMinScore: 0.48,
    coverageMaxPicks: 12,
  }),
});

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function round3(v) { return isNum(v) ? Math.round(v * 1000) / 1000 : null; }
function fmtLine(v) { return !isNum(v) ? '' : v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`; }
function fmtOdds(v) { return !isNum(v) ? '' : v > 0 ? `+${v}` : `${v}`; }
function fmtSigned(v, digits = 1) { return !isNum(v) ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`; }
function pct(v, digits = 1) { return !isNum(v) ? null : `${(v * 100).toFixed(digits)}%`; }

function todayET(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  } catch { return now.toISOString().slice(0, 10); }
}

function teamShape(t) {
  if (!t) return null;
  return {
    slug: t.slug,
    name: t.name,
    shortName: t.abbrev || t.shortName || (t.slug || '').toUpperCase(),
    logo: t.logo || null,
    record: t.record || null,
  };
}

/** Days between a team's last game and this kickoff (null when unknown). */
function restDays(rating, startTime) {
  if (!rating?.lastGameAt || !startTime) return null;
  const kick = Date.parse(startTime);
  if (!Number.isFinite(kick)) return null;
  const days = (kick - rating.lastGameAt) / 86_400_000;
  return days > 0 && days < 40 ? Math.round(days) : null;
}

function softSquash(x, cap) {
  if (!isNum(x) || !isNum(cap) || cap <= 0) return 0;
  return clamp01(1 - Math.exp(-2 * Math.abs(x) / cap));
}

/**
 * Build the four bet-score components for one candidate.
 * Every component is bounded to [0, 1]; neutral is 0.5 for S and M.
 */
const GUARDED_SCORE_CAP = 0.5;

function scoreCandidate({ kind, edgePoints, probEdge, sideIsHome, ctx, config, informationGap, lineMoveToward, guarded = informationGap }) {
  const caps = config?.components?.edge || {};
  const w = config?.weights || NFL_DEFAULT_CONFIG.weights;

  // E — how much the blended number differs from the posted one.
  const E = kind === 'moneyline'
    ? softSquash(probEdge, caps.mlCap ?? 0.05)
    : softSquash(edgePoints, caps.pointsCap ?? 2.0);

  // C — how much to trust the ratings behind it.
  const sample = clamp01(Math.min(ctx.homeGames, ctx.awayGames) / 8);
  let C = 0.4 + 0.5 * sample;
  if (ctx.ratingSource !== 'results') C *= 0.8;
  if (informationGap) C *= 0.6;
  C = clamp01(C);

  // S — rest and recent form, from the selected side's point of view.
  let S = 0.5;
  const notes = [];
  if (kind !== 'total') {
    const mine = sideIsHome ? ctx.homeRest : ctx.awayRest;
    const theirs = sideIsHome ? ctx.awayRest : ctx.homeRest;
    if (isNum(mine) && isNum(theirs)) {
      const diff = mine - theirs;
      if (diff >= 3) { S += 0.15; notes.push('rest_advantage'); }
      else if (diff <= -3) { S -= 0.15; notes.push('rest_disadvantage'); }
    }
    const myTrend = sideIsHome ? ctx.homeTrend : ctx.awayTrend;
    const theirTrend = sideIsHome ? ctx.awayTrend : ctx.homeTrend;
    const trendDiff = (myTrend ?? 0) - (theirTrend ?? 0);
    if (trendDiff >= 4) { S += 0.10; notes.push('form_up'); }
    else if (trendDiff <= -4) { S -= 0.10; notes.push('form_down'); }
  }
  S = clamp01(S);

  // M — is this a number worth trusting, and is the market moving with us?
  let M = ctx.booksCount > 0 ? 0.45 + 0.4 * clamp01(ctx.booksCount / 6) : 0.6;
  if (lineMoveToward === true) { M += 0.1; notes.push('line_move_with'); }
  else if (lineMoveToward === false) { M -= 0.1; notes.push('line_move_against'); }
  M = clamp01(M);

  let total = clamp01(w.edge * E + w.conf * C + w.sit * S + w.mkt * M);
  // A guarded pick is tracked, never recommended. Its size is the reason it
  // is guarded, so it must not also earn a high conviction number.
  if (guarded) total = Math.min(total, GUARDED_SCORE_CAP);
  return {
    betScore: {
      total: round3(total),
      components: {
        edgeStrength: round3(E),
        modelConfidence: round3(C),
        situationalEdge: round3(S),
        marketQuality: round3(M),
      },
      weights: { ...w },
    },
    notes,
  };
}

function convictionLabel(total) {
  if (total >= 0.85) return 'Top Play';
  if (total >= 0.70) return 'Strong';
  if (total >= 0.55) return 'Solid';
  return 'Lean';
}

function situationalBullets(notes, ctx, sideIsHome) {
  const out = [];
  const mine = sideIsHome ? ctx.homeRest : ctx.awayRest;
  const theirs = sideIsHome ? ctx.awayRest : ctx.homeRest;
  if (notes.includes('rest_advantage')) out.push(`Rest edge: ${mine} days since their last game against ${theirs} for the opponent.`);
  if (notes.includes('rest_disadvantage')) out.push(`Rest disadvantage: ${mine} days since their last game against ${theirs} for the opponent.`);
  if (notes.includes('form_up')) out.push('Recent form is running ahead of their season baseline.');
  if (notes.includes('form_down')) out.push('Recent form is running behind their season baseline.');
  if (notes.includes('line_move_with')) out.push('The line has moved toward this side since open.');
  if (notes.includes('line_move_against')) out.push('The line has moved away from this side since open.');
  return out;
}

const INFO_GAP_NOTE =
  'Model and market are more than a touchdown apart. That gap usually means news the ratings cannot see, such as an injury or a quarterback change. Tracked, not recommended.';

function makePick({ game, kind, side, line, price, probs, edgePoints, scored, flags, rationale, ctx, projection, priced }) {
  const away = teamShape(game.teams.away);
  const home = teamShape(game.teams.home);
  const team = side === 'away' ? away : side === 'home' ? home : null;

  const label = kind === 'total'
    ? `${side === 'over' ? 'Over' : 'Under'} ${line}`
    : kind === 'runline'
      ? `${team.shortName} ${fmtLine(line)}`
      : `${team.shortName} ${fmtOdds(price)}`.trim();

  const total = scored.betScore.total;
  const legacyCategory = kind === 'moneyline' ? 'pickEms' : kind === 'runline' ? 'ats' : 'totals';

  const displayMetrics = kind === 'moneyline'
    ? {
        edgeLabel: 'Edge',
        edgeValue: pct(probs.edge),
        hitProbabilityLabel: 'Win %',
        hitProbabilityValue: pct(probs.model),
        hitProbabilityDescription: 'Model win probability after weighting the market.',
      }
    : {
        edgeLabel: 'Line value',
        edgeValue: `${fmtSigned(Math.abs(edgePoints))} pts`,
        hitProbabilityLabel: kind === 'total' ? 'Model %' : 'Cover %',
        hitProbabilityValue: pct(probs.model),
        hitProbabilityDescription: 'Model probability this side of the number wins, after weighting the market.',
      };
  displayMetrics.signalQualityLabel = 'Signal Quality';
  displayMetrics.signalQualityValue = `${Math.round(scored.betScore.components.modelConfidence * 100)}%`;
  displayMetrics.signalQualityDescription =
    'Signal quality is how much data sits behind the rating, not the probability this pick wins.';
  displayMetrics.betScoreLabel = 'Bet Score';
  displayMetrics.betScoreValue = String(Math.round(total * 100));

  return {
    id: `${game.gameId}-${kind}-${side}`,
    sport: 'nfl',
    gameId: game.gameId,
    week: game.week ?? null,
    tier: null,
    pickRole: 'tracking',
    conviction: { label: convictionLabel(total), score: Math.round(total * 100) },

    market: { type: kind, line: isNum(line) ? line : null, priceAmerican: isNum(price) ? price : null },
    selection: { side, team: team?.shortName || null, label },

    matchup: {
      awayTeam: away,
      homeTeam: home,
      startTime: game.startTime,
      venue: game.venue?.name || null,
      network: game.broadcast?.network || null,
    },

    betScore: scored.betScore,
    rationale: { ...rationale, pickRole: 'tracking' },
    displayMetrics,
    flags,

    modelProb: round3(probs.model),
    impliedProb: round3(probs.implied),
    rawEdge: round3(probs.edge),
    edgePoints: isNum(edgePoints) ? Math.round(edgePoints * 10) / 10 : null,
    expectedTotal: kind === 'total' ? projection.total : null,
    isLowConviction: !!flags.informationGap || !!flags.priceGuard || !!flags.qbInjury,
    lowSignalReason: flags.qbInjury ? 'qb_injury' : flags.informationGap ? 'information_gap' : flags.priceGuard ? 'price_guard' : null,
    modelSource: ctx.ratingSource === 'results' ? 'nfl_ratings_v1' : 'nfl_standings_v1',

    result: null,

    // Back-compat mirror for legacy consumers of the v1 shape.
    category: legacyCategory,
    confidence: total >= 0.72 ? 'high' : total >= 0.62 ? 'medium' : 'low',
    confidenceScore: Math.round(total * 100) / 100,
    pick: {
      label,
      side,
      value: kind === 'moneyline' ? (price ?? null) : line,
      marketType: kind,
      explanation: rationale.headline,
      topSignals: rationale.bullets.slice(0, 3),
    },
    model: {
      awayWinProb: priced.moneyline?.awayWinProb ?? projection.awayWinProb,
      homeWinProb: priced.moneyline?.homeWinProb ?? projection.homeWinProb,
      impliedAwayWinProb: priced.moneyline?.impliedAway ?? null,
      impliedHomeWinProb: priced.moneyline?.impliedHome ?? null,
      edge: round3(Math.abs(probs.edge ?? 0)),
      dataQuality: scored.betScore.components.modelConfidence,
      signalAgreement: null,
      projectedMargin: projection.margin,
      projectedTotal: projection.total,
    },
  };
}

/**
 * @param {object} args
 * @param {Array}  args.games    — normalized NFL games (see api/nfl/live/_normalize.js)
 * @param {object} args.ratings  — output of buildNflRatings()
 * @param {object} [args.config]
 * @param {object} [args.scorecardSummary]
 * @param {Date}   [args.now]
 */
export function buildNflPicksV2({
  games = [],
  ratings = null,
  config = NFL_DEFAULT_CONFIG,
  modelVersion = NFL_MODEL_VERSION,
  scorecardSummary = null,
  now = new Date(),
} = {}) {
  const meta = {
    totalCandidates: 0, qualifiedGames: 0, skippedGames: 0, picksPublished: 0,
    flags: [], ratingSource: ratings?.source || 'none', ratingGames: ratings?.games || 0,
  };

  const upcoming = (games || []).filter(g => {
    const s = (g?.status || '').toLowerCase();
    return g && !g.gameState?.isLive && !g.gameState?.isFinal && s !== 'final' && s !== 'live';
  }).sort((a, b) => Date.parse(a.startTime || 0) - Date.parse(b.startTime || 0));

  meta.totalCandidates = upcoming.length;
  const week = upcoming.find(g => g.week != null)?.week ?? games.find(g => g?.week != null)?.week ?? null;
  const seasonType = upcoming[0]?.seasonType ?? games[0]?.seasonType ?? null;

  if (!ratings || Object.keys(ratings.teams || {}).length === 0) meta.flags.push('no_ratings');

  const candidates = [];
  const byGame = [];

  for (const game of upcoming) {
    const homeSlug = game.teams?.home?.slug;
    const awaySlug = game.teams?.away?.slug;
    const projection = homeSlug && awaySlug
      ? projectNflGame({ homeSlug, awaySlug, ratings, neutralSite: !!game.venue?.neutralSite })
      : null;
    if (!projection) { meta.skippedGames += 1; continue; }

    const mkt = game.market || {};
    const priced = priceNflGame({
      projection,
      market: {
        spreadHome: mkt.pregameSpread,
        total: mkt.pregameTotal,
        moneylineHome: mkt.moneyline?.home,
        moneylineAway: mkt.moneyline?.away,
      },
    });

    const homeR = ratings.teams[homeSlug];
    const awayR = ratings.teams[awaySlug];
    const ctx = {
      homeGames: homeR?.games || 0,
      awayGames: awayR?.games || 0,
      homeRest: restDays(homeR, game.startTime),
      awayRest: restDays(awayR, game.startTime),
      homeTrend: homeR?.formTrend ?? 0,
      awayTrend: awayR?.formTrend ?? 0,
      ratingSource: ratings.source,
      booksCount: mkt.booksCount || 0,
    };

    const homeAbbr = game.teams.home.abbrev;
    const awayAbbr = game.teams.away.abbrev;

    // The ratings come from results and do not know who starts. A
    // quarterback tagged Out or Doubtful this week is information the
    // model lacks, so every pick on the game is tracked, not recommended.
    const qbNotes = [
      ...(game.injuries?.away?.quarterbacks || []).map((q) => `${awayAbbr} QB ${q.name} (${String(q.status).toLowerCase()})`),
      ...(game.injuries?.home?.quarterbacks || []).map((q) => `${homeAbbr} QB ${q.name} (${String(q.status).toLowerCase()})`),
    ];
    const qbInjury = qbNotes.length > 0;
    const qbNote = qbInjury
      ? `Injury report: ${qbNotes.join(', ')}. The ratings do not account for who starts at quarterback, so this is tracked, not recommended.`
      : null;
    if (qbInjury) meta.qbInjuryGames = (meta.qbInjuryGames || 0) + 1;

    const ratingLine =
      `Ratings: ${awayAbbr} ${fmtSigned(awayR?.rating)} (off ${fmtSigned(awayR?.offense)}, def ${fmtSigned(awayR?.defense)}), ` +
      `${homeAbbr} ${fmtSigned(homeR?.rating)} (off ${fmtSigned(homeR?.offense)}, def ${fmtSigned(homeR?.defense)}).`;

    const picks = { moneyline: null, runline: null, total: null };
    meta.qualifiedGames += 1;

    // ── Spread ──
    if (priced.side && priced.side.edgePoints !== 0) {
      const s = priced.side;
      const sideIsHome = s.edgePoints > 0;
      const side = sideIsHome ? 'home' : 'away';
      const line = sideIsHome ? s.marketSpreadHome : -s.marketSpreadHome;
      const cover = sideIsHome ? s.homeCoverProb : s.awayCoverProb;
      const moved = isNum(mkt.openSpread) && mkt.openSpread !== s.marketSpreadHome
        ? (sideIsHome ? s.marketSpreadHome < mkt.openSpread : s.marketSpreadHome > mkt.openSpread)
        : null;
      const flags = { informationGap: s.informationGap, qbInjury };
      const scored = scoreCandidate({
        kind: 'runline', edgePoints: s.edgePoints, sideIsHome, ctx, config,
        informationGap: s.informationGap, lineMoveToward: moved,
        guarded: s.informationGap || qbInjury,
      });
      const team = sideIsHome ? game.teams.home : game.teams.away;
      const bullets = [
        `Power ratings make this ${homeAbbr} ${fmtLine(s.modelSpreadHome)}; the market is ${homeAbbr} ${fmtLine(s.marketSpreadHome)}. ` +
        `After weighting the market, the model's number is ${homeAbbr} ${fmtLine(s.blendedSpreadHome)}.`,
        ratingLine,
        ...situationalBullets(scored.notes, ctx, sideIsHome),
      ];
      if (s.informationGap) bullets.unshift(INFO_GAP_NOTE);
      if (qbNote) bullets.unshift(qbNote);
      picks.runline = makePick({
        game, kind: 'runline', side, line, price: null,
        probs: { model: cover, implied: 0.5, edge: cover - 0.5 },
        edgePoints: s.edgePoints, scored, flags, ctx, projection, priced,
        rationale: {
          headline: `${team.name} ${fmtLine(line)}: model sees ${Math.abs(s.edgePoints).toFixed(1)} points of value on the number`,
          bullets,
        },
      });
    }

    // ── Moneyline ──
    if (priced.moneyline?.priced) {
      const m = priced.moneyline;
      const sideIsHome = (m.homeEdge ?? 0) > (m.awayEdge ?? 0);
      const edge = sideIsHome ? m.homeEdge : m.awayEdge;
      if (isNum(edge) && edge > 0) {
        const side = sideIsHome ? 'home' : 'away';
        const price = sideIsHome ? mkt.moneyline.home : mkt.moneyline.away;
        const modelProb = sideIsHome ? m.homeWinProb : m.awayWinProb;
        const implied = sideIsHome ? m.impliedHome : m.impliedAway;
        const guards = config?.guards || NFL_DEFAULT_CONFIG.guards;
        const priceGuard = isNum(price) && (price < guards.mlMaxFavorite || price > guards.mlMaxUnderdog);
        const informationGap = !!priced.side?.informationGap;
        const flags = { informationGap, priceGuard, qbInjury };
        const scored = scoreCandidate({
          kind: 'moneyline', probEdge: edge, sideIsHome, ctx, config,
          informationGap, lineMoveToward: null, guarded: informationGap || priceGuard || qbInjury,
        });
        const team = sideIsHome ? game.teams.home : game.teams.away;
        const bullets = [
          `Model win probability ${pct(modelProb)} against a no-vig market price of ${pct(implied)}.`,
          ratingLine,
          ...situationalBullets(scored.notes, ctx, sideIsHome),
        ];
        if (informationGap) bullets.unshift(INFO_GAP_NOTE);
        if (qbNote) bullets.unshift(qbNote);
        if (priceGuard) bullets.push('Price is outside the range the model promotes. Tracked, not recommended.');
        picks.moneyline = makePick({
          game, kind: 'moneyline', side, line: null, price,
          probs: { model: modelProb, implied, edge },
          edgePoints: null, scored, flags, ctx, projection, priced,
          rationale: {
            headline: `${team.name} to win: model ${pct(modelProb, 0)} against a ${pct(implied, 0)} market`,
            bullets,
          },
        });
      }
    }

    // ── Total ──
    if (priced.total && priced.total.edgePoints !== 0) {
      const t = priced.total;
      const over = t.edgePoints > 0;
      const side = over ? 'over' : 'under';
      const prob = over ? t.overProb : t.underProb;
      const moved = isNum(mkt.openTotal) && mkt.openTotal !== t.marketTotal
        ? (over ? t.marketTotal > mkt.openTotal : t.marketTotal < mkt.openTotal)
        : null;
      const flags = { informationGap: t.informationGap, qbInjury };
      const scored = scoreCandidate({
        kind: 'total', edgePoints: t.edgePoints, sideIsHome: false, ctx, config,
        informationGap: t.informationGap, lineMoveToward: moved,
        guarded: t.informationGap || qbInjury,
      });
      const bullets = [
        `Ratings project ${projection.awayPoints.toFixed(1)}–${projection.homePoints.toFixed(1)}, a total of ${t.modelTotal.toFixed(1)} against a posted ${t.marketTotal}. ` +
        `After weighting the market, the model's number is ${t.blendedTotal.toFixed(1)}.`,
        ratingLine,
        ...situationalBullets(scored.notes, ctx, false),
      ];
      if (t.informationGap) bullets.unshift(INFO_GAP_NOTE);
      if (qbNote) bullets.unshift(qbNote);
      picks.total = makePick({
        game, kind: 'total', side, line: t.marketTotal, price: null,
        probs: { model: prob, implied: 0.5, edge: prob - 0.5 },
        edgePoints: t.edgePoints, scored, flags, ctx, projection, priced,
        rationale: {
          headline: `${over ? 'Over' : 'Under'} ${t.marketTotal}: model total ${t.blendedTotal.toFixed(1)}`,
          bullets,
        },
      });
    }

    for (const p of Object.values(picks)) if (p) candidates.push(p);

    byGame.push({
      gameId: game.gameId,
      week: game.week ?? null,
      startTime: game.startTime,
      awayTeam: teamShape(game.teams.away),
      homeTeam: teamShape(game.teams.home),
      network: game.broadcast?.network || null,
      projection: {
        margin: projection.margin,
        fairSpreadHome: projection.fairSpreadHome,
        total: projection.total,
        homePoints: projection.homePoints,
        awayPoints: projection.awayPoints,
        homeWinProb: priced.moneyline?.homeWinProb ?? projection.homeWinProb,
      },
      market: {
        spreadHome: isNum(mkt.pregameSpread) ? mkt.pregameSpread : null,
        total: isNum(mkt.pregameTotal) ? mkt.pregameTotal : null,
        moneyline: mkt.moneyline || null,
      },
      injuries: game.injuries || null,
      picks,
    });
  }

  // Never let a zero or invalid score reach the UI.
  const clean = candidates.filter(p => Number.isFinite(p.betScore?.total) && p.betScore.total > 0);
  meta.invalidBetScoreDropped = candidates.length - clean.length;

  // Tiers: only picks without a guard flag are eligible to be promoted.
  const eligible = clean.filter(p => !p.flags?.informationGap && !p.flags?.priceGuard && !p.flags?.qbInjury);
  const assigned = assignTiers(eligible, config);
  const heroIds = new Set(assigned.published.map(p => p.id));
  for (const p of clean) {
    if (heroIds.has(p.id)) {
      p.pickRole = 'hero';
      p.rationale.pickRole = 'hero';
    } else {
      p.tier = 'tracking';
    }
  }
  meta.picksPublished = assigned.published.length;
  if (upcoming.length > 0 && assigned.published.length === 0) meta.flags.push('no_qualified_edges');

  const guards = config?.guards || NFL_DEFAULT_CONFIG.guards;
  const coverage = eligible
    .filter(p => !heroIds.has(p.id) && p.betScore.total >= guards.coverageMinScore)
    .sort((a, b) => b.betScore.total - a.betScore.total)
    .slice(0, guards.coverageMaxPicks)
    .map(p => ({ ...p, tier: 'coverage', _coverage: true }));
  meta.coverageAvailable = coverage.length;

  const topPick = assigned.tier1[0] || assigned.tier2[0] || null;
  const trackingPicks = clean.filter(p => p.pickRole !== 'hero');

  const categories = { pickEms: [], ats: [], leans: [], totals: [] };
  for (const p of assigned.published) {
    if (p.market.type === 'total') categories.totals.push(p);
    else if (p.market.type === 'runline') categories.ats.push(p);
    else if (p.tier === 'tier3') categories.leans.push(p);
    else categories.pickEms.push(p);
  }

  return {
    sport: 'nfl',
    date: todayET(now),
    week,
    seasonType,
    slateLabel: week != null ? `Week ${week}` : null,
    modelVersion,
    configVersion: config?.version || 'nfl-picks-unknown',
    generatedAt: now.toISOString(),
    topPick,
    tiers: { tier1: assigned.tier1, tier2: assigned.tier2, tier3: assigned.tier3 },
    coverage,
    fullSlatePicks: clean,
    heroPicks: assigned.published,
    trackingPicks,
    byGame,
    scorecardSummary: scorecardSummary || null,
    meta: {
      ...meta,
      model: {
        homeField: NFL_MODEL.HOME_FIELD,
        marketWeightSide: NFL_MODEL.MARKET_WEIGHT_SIDE,
        marketWeightTotal: NFL_MODEL.MARKET_WEIGHT_TOTAL,
        leaguePpg: ratings?.leaguePpg ?? null,
      },
    },
    legacy: { categories },
    categories,
  };
}
