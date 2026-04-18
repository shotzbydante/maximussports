/**
 * buildMlbPicksV2 — canonical v2 MLB picks builder.
 *
 * Contract:
 *   input:  { games: [enrichedMlbGame], config }
 *   output: canonical v2 payload (see docs/mlb-picks-v2-architecture.md §2)
 *           with `legacy.categories` for back-compat consumers.
 *
 * This function is pure and testable: no HTTP, no DB.
 */

import { normalizeMlbMatchup } from '../normalizeMlbMatchup.js';
import { scoreMlbMatchup } from '../scoreMlbMatchup.js';
import { computeBetScore } from './betScore.js';
import { assignTiers } from './tier.js';
import { MLB_DEFAULT_CONFIG, MLB_MODEL_VERSION } from '../../../picks/tuning/defaultConfig.js';

function isNum(v) { return v != null && isFinite(v); }
function round3(v) { return isNum(v) ? Math.round(v * 1000) / 1000 : null; }
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
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
function gameDateET(iso) {
  if (!iso) return '';
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date(iso));
  } catch { return ''; }
}

/**
 * Build v2 canonical payload from enriched games.
 *
 * @param {object} args
 * @param {Array}  args.games
 * @param {object} [args.config]
 * @param {string} [args.modelVersion]
 * @param {object} [args.scorecardSummary] — optional precomputed scorecard
 */
export function buildMlbPicksV2({
  games = [],
  config = MLB_DEFAULT_CONFIG,
  modelVersion = MLB_MODEL_VERSION,
  scorecardSummary = null,
} = {}) {
  const today = todayET();
  const meta = { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0, picksPublished: 0, flags: [] };

  const upcoming = games.filter(g => {
    const isLive = g.gameState?.isLive;
    const isFinal = g.gameState?.isFinal;
    const s = (g.status || '').toLowerCase();
    return !isLive && !isFinal && s !== 'final' && s !== 'in_progress';
  });

  // Restrict to today + tomorrow ET window; candidates ordered by date
  const todayGames = upcoming.filter(g => gameDateET(g.startTime) === today);
  const tomorrowGames = upcoming.filter(g => gameDateET(g.startTime) !== today);
  const candidates = [...todayGames, ...tomorrowGames].slice(0, 30);
  meta.totalCandidates = candidates.length;
  if (candidates.length < 4) meta.flags.push('low_slate');

  const allPickCandidates = [];

  for (const g of candidates) {
    let matchup, score;
    try {
      const norm = normalizeMlbMatchup(g);
      if (!norm.ok || !norm.matchup) { meta.skippedGames += 1; continue; }
      matchup = norm.matchup;
      score = scoreMlbMatchup(matchup);
    } catch { meta.skippedGames += 1; continue; }

    if (score.dataQuality < 0.20) { meta.skippedGames += 1; continue; }

    meta.qualifiedGames += 1;

    // Derive per-market candidates
    const m = matchup.market || {};
    const implAway = moneylineToImplied(m.moneyline?.away);
    const implHome = moneylineToImplied(m.moneyline?.home);

    // ── Moneyline: pick the side with positive raw edge ──
    const mlSides = [
      { side: 'away', modelProb: score.awayWinProb, implied: implAway, price: m.moneyline?.away },
      { side: 'home', modelProb: score.homeWinProb, implied: implHome, price: m.moneyline?.home },
    ];
    for (const s of mlSides) {
      if (!isNum(s.modelProb) || !isNum(s.implied)) continue;
      const rawEdge = s.modelProb - s.implied;
      if (rawEdge <= 0) continue;
      const bs = computeBetScore({
        matchup, score, marketType: 'moneyline', side: s.side,
        rawEdge, totalDelta: null, config,
      });
      allPickCandidates.push(makePick(matchup, score, {
        marketType: 'moneyline', side: s.side, lineValue: null,
        priceAmerican: s.price ?? null, rawEdge, modelProb: s.modelProb, impliedProb: s.implied,
      }, bs));
    }

    // ── Run line ──
    if (isNum(m.runLine?.homeLine)) {
      // For each side: use win-prob edge × 0.9 as runline proxy, gate on probSpread
      const probSpread = Math.abs(score.awayWinProb - score.homeWinProb);
      if (probSpread >= (config?.marketGates?.runline?.minProbSpread ?? 0.05)) {
        const rlSides = [
          { side: 'away', line: -m.runLine.homeLine, rawEdge: (score.awayWinProb - (implAway ?? 0.5)) * 0.9 },
          { side: 'home', line:  m.runLine.homeLine, rawEdge: (score.homeWinProb - (implHome ?? 0.5)) * 0.9 },
        ];
        for (const s of rlSides) {
          if (!isNum(s.rawEdge) || s.rawEdge <= 0) continue;
          const bs = computeBetScore({
            matchup, score, marketType: 'runline', side: s.side,
            rawEdge: s.rawEdge, totalDelta: null, config,
          });
          allPickCandidates.push(makePick(matchup, score, {
            marketType: 'runline', side: s.side, lineValue: s.line,
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
      const passConf = modelConfidenceGate(score, gate.minConfidence ?? 0.55);
      const passDelta = Math.abs(delta) >= (gate.minExpectedDelta ?? 0.35);
      if (passConf && passDelta) {
        const side = delta > 0 ? 'over' : 'under';
        const bs = computeBetScore({
          matchup, score, marketType: 'total', side,
          rawEdge: null, totalDelta: delta, config,
        });
        allPickCandidates.push(makePick(matchup, score, {
          marketType: 'total', side, lineValue: m.total.points,
          priceAmerican: null, rawEdge: null, modelProb: null, impliedProb: null,
          expectedTotal: score.expectedTotal, totalDelta: delta,
        }, bs));
      }
    }
  }

  // Sort + assign tiers
  const assigned = assignTiers(allPickCandidates, config);
  meta.picksPublished = assigned.published.length;
  const topPick = assigned.tier1[0] || assigned.tier2[0] || null;

  // Build legacy.categories for back-compat
  const legacy = buildLegacyCategories(assigned.published);

  return {
    sport: 'mlb',
    date: today,
    modelVersion,
    configVersion: config?.version || 'mlb-picks-unknown',
    generatedAt: new Date().toISOString(),
    topPick,
    tiers: {
      tier1: assigned.tier1,
      tier2: assigned.tier2,
      tier3: assigned.tier3,
    },
    scorecardSummary: scorecardSummary || null,
    meta,
    // Back-compat — mirror of v1 shape driven from the same picks.
    legacy: { categories: legacy },
    // v1 payload had `categories` at the top. Keep it too for email/IG paths
    // that read `payload.categories` directly.
    categories: legacy,
  };
}

function modelConfidenceGate(score, minConfidence) {
  const dq = score?.dataQuality ?? 0;
  const sa = score?.signalAgreement ?? 0.5;
  return (dq * sa) >= minConfidence || dq >= minConfidence + 0.1; // OR gate for high-DQ cases
}

function makePick(matchup, score, info, bs) {
  const teamFor = side => {
    if (side === 'away') return matchup.awayTeam;
    if (side === 'home') return matchup.homeTeam;
    return null;
  };
  const team = teamFor(info.side);
  const label = info.marketType === 'total'
    ? `${info.side === 'over' ? 'Over' : 'Under'} ${info.lineValue}`
    : info.marketType === 'runline'
      ? `${team?.shortName || info.side.toUpperCase()} ${info.lineValue > 0 ? '+' : ''}${info.lineValue}`
      : `${team?.shortName || info.side.toUpperCase()} ${info.priceAmerican != null ? (info.priceAmerican > 0 ? '+' + info.priceAmerican : info.priceAmerican) : ''}`.trim();

  // Legacy-compatible fields (category, confidence tier, confidenceScore)
  const legacyCategory =
    info.marketType === 'moneyline' ? 'pickEms' :
    info.marketType === 'runline'   ? 'ats' :
    info.marketType === 'total'     ? 'totals' : 'leans';
  const confidence = bs.total >= 0.75 ? 'high' : bs.total >= 0.60 ? 'medium' : 'low';

  const pickKey = `${matchup.gameId}-${info.marketType}-${info.side}`;
  const rationale = buildRationale({ marketType: info.marketType, side: info.side, team, score, info, bs });

  return {
    id: pickKey,
    sport: 'mlb',
    gameId: matchup.gameId,
    date: undefined, // filled upstream if needed
    tier: null,      // assigned later
    conviction: { label: convictionLabel(bs.total), score: Math.round(bs.total * 100) },

    market: { type: info.marketType, line: info.lineValue ?? null, priceAmerican: info.priceAmerican ?? null },
    selection: { side: info.side, team: team?.shortName || null, label },

    matchup: {
      awayTeam: pickTeamShape(matchup.awayTeam),
      homeTeam: pickTeamShape(matchup.homeTeam),
      startTime: matchup.startTime,
      venue: matchup.venue || null,
      dayNight: null,
    },

    betScore: bs,

    rationale,

    modelProb: round3(info.modelProb),
    impliedProb: round3(info.impliedProb),
    rawEdge: round3(info.rawEdge),
    expectedTotal: round3(info.expectedTotal),

    result: null,

    // ── Back-compat mirror: v1 consumers read these ──
    category: legacyCategory,
    confidence,
    confidenceScore: Math.round(bs.total * 100) / 100,
    pick: {
      label,
      side: info.side,
      value: info.marketType === 'total' ? info.lineValue : (info.priceAmerican ?? info.lineValue ?? null),
      marketType: info.marketType === 'runline' ? 'runline' : info.marketType,
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

function convictionLabel(total) {
  if (total >= 0.85) return 'Top Play';
  if (total >= 0.70) return 'Strong';
  if (total >= 0.55) return 'Solid';
  return 'Lean';
}

function pickTeamShape(t) {
  if (!t) return null;
  return { slug: t.slug, name: t.name, shortName: t.shortName, logo: t.logo, record: t.record };
}

function buildRationale({ marketType, side, team, score, info, bs }) {
  const tName = team?.name || side;
  const pct = v => `${(v * 100).toFixed(1)}%`;
  const bullets = [];

  if (marketType === 'moneyline' && isFinite(info.rawEdge)) {
    bullets.push(`Model probability ${pct(info.modelProb)} vs market-implied ${pct(info.impliedProb)} — raw edge ${pct(info.rawEdge)}.`);
  }
  if (marketType === 'runline') {
    bullets.push(`Model win-probability delta and run-line pricing favor ${tName}.`);
  }
  if (marketType === 'total') {
    const dir = info.totalDelta > 0 ? 'over' : 'under';
    bullets.push(`Expected total ${info.expectedTotal?.toFixed(1)} vs line ${info.lineValue} — model leans ${dir}.`);
  }
  // Surface up to 2 top signals
  for (const s of (score?.topSignals || []).slice(0, 2)) bullets.push(String(s));
  // Confidence statement
  bullets.push(`Bet-score components — E ${(bs.components.edgeStrength * 100 | 0)}, C ${(bs.components.modelConfidence * 100 | 0)}, S ${(bs.components.situationalEdge * 100 | 0)}, M ${(bs.components.marketQuality * 100 | 0)}.`);

  let headline;
  if (marketType === 'moneyline') headline = `${tName} priced below model`;
  else if (marketType === 'runline') headline = `${tName} to cover — situational edge`;
  else headline = info.totalDelta > 0
    ? `Model leans Over ${info.lineValue}`
    : `Model leans Under ${info.lineValue}`;

  return { headline, bullets };
}

function buildLegacyCategories(published) {
  const out = { pickEms: [], ats: [], leans: [], totals: [] };
  // Split ML picks into pickEms (tier1/2) vs leans (tier3)
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
