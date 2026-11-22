/**
 * buildNflPicksV2 — canonical NFL picks builder, engine version 2.
 *
 * Same output contract as buildMlbPicksV2 / buildNbaPicksV2 so the shared
 * picks UI, persistence, settlement and scorecard code keep working:
 *
 *   { sport, date, modelVersion, configVersion, topPick,
 *     tiers: { tier1, tier2, tier3 }, coverage,
 *     fullSlatePicks, heroPicks, trackingPicks, byGame,
 *     scorecardSummary, meta, categories, legacy }
 *
 * What a recommended pick is
 * --------------------------
 * A bet is recommended only when a specific book's posted line and price
 * beat the fair number by a fixed margin of expected value. The fair number
 * is the multi-book consensus, plus the one situational adjustment that has
 * held up in backtests (strong wind on totals). See v2/engine.js for why
 * the ratings do not move it.
 *
 * Everything else is a tracking pick: the model's lean on each market,
 * recorded and graded so the ratings keep an honest record, never promoted.
 *
 * Rules
 *   - Expected value is computed at the real price, with pushes.
 *   - Tiers are fixed EV thresholds, not percentiles of the slate.
 *   - One side bet per game: a recommended moneyline and spread are the
 *     same opinion, so only the better-priced one is the pick.
 *   - The moneyline lean is a winner call (the team the market makes more
 *     likely to win), scored by that likelihood. The spread lean is still
 *     where the ratings sit against the line, so the two can disagree.
 *   - A quarterback in doubt, a stale or implausible price, or a missing
 *     feed holds the game to tracking.
 *
 * The spread market keeps the persisted key `runline` so the picks tables
 * and grader need no change. Pure and testable: no HTTP, no DB.
 */

import { priceOffers, bestOffer } from './v2/market.js';
import { impliedProb, probToAmerican, spreadProbs, totalProbs, expectedValue } from './v2/distribution.js';
import { UNIT_LABELS } from './v2/units.js';
import { ENGINE_DEFAULTS } from './v2/engine.js';
import { talentNote } from './v2/talent.js';
import { windUnderRecord } from './v2/situations.js';

// 2.2.0: the moneyline lean became a winner call (the likelier winner, scored by win chance).
export const NFL_MODEL_VERSION = 'nfl-picks-v2.2.0';

export const NFL_DEFAULT_CONFIG = Object.freeze({
  version: 'nfl-picks-v2-2026-11-22a',
  sport: 'nfl',
  /** Minimum expected value per unit staked for each tier. */
  evThresholds: Object.freeze({ tier1: 0.04, tier2: 0.025, tier3: 0.015 }),
  maxPerTier: Object.freeze({ tier1: 3, tier2: 5, tier3: 6 }),
  /** One side bet and one total at most. */
  maxPerGame: 2,
  /** Hours before kickoff inside which a pick can be recommended (and is locked). */
  lockWindowHours: 72,
  modelWeight: ENGINE_DEFAULTS.modelWeight,
  guards: Object.freeze({
    /** Moneylines outside this band are graded but never promoted. */
    mlMaxFavorite: -450,
    mlMaxUnderdog: 400,
  }),
});

const HOLD_REASONS = Object.freeze({
  no_price_edge: 'No book is offering a price that beats the market’s fair number. Tracked, not recommended.',
  qb_uncertain: 'A starting quarterback is in doubt, so prices are moving and any gap between books is unreliable. Tracked, not recommended.',
  injury_feed_down: 'The injury report could not be loaded, so quarterback status is unconfirmed. Tracked, not recommended.',
  stale_price: 'The best price on the board has not updated with the rest of the market. Tracked, not recommended.',
  price_outlier: 'This price is too far from the market to trust; it is more likely stale than a gift. Tracked, not recommended.',
  outside_window: 'Kickoff is more than three days out. Picks are recommended and locked inside that window.',
  price_guard: 'Price is outside the range the model promotes. Tracked, not recommended.',
  thin_market: 'Too few books have posted this market to form a consensus. Tracked, not recommended.',
  data_gap: 'Model data for this game is incomplete. Tracked, not recommended.',
  same_side: 'The spread and moneyline are one opinion; the better-priced of the two is the pick.',
});

/** The same reasons, as the opening of a pick's one-line "why". */
const HOLD_WHY = Object.freeze({
  qb_uncertain: 'Held back: a starting quarterback is in doubt, and prices move on that news.',
  injury_feed_down: 'Held back: the injury report did not load, so quarterback status is unconfirmed.',
  stale_price: 'Held back: the best price on the board has not moved with the rest of the market.',
  price_outlier: 'Held back: this price is too far from the market to trust.',
  outside_window: 'Too early: picks are recommended and locked inside three days of kickoff.',
  price_guard: 'Tracked only: a price this long or this short is outside the range we promote.',
  thin_market: 'Tracked only: too few books have posted this market to call a fair price.',
  data_gap: 'Tracked only: ratings data for this game is incomplete.',
  same_side: 'Same opinion as the recommended side bet on this game, so it is tracked, not doubled up.',
});

/** A few words for the same reasons, for the short "why" on small tiles and in emails. */
const HOLD_SHORT = Object.freeze({
  qb_uncertain: 'Held, quarterback in doubt',
  injury_feed_down: 'Held, no injury report',
  stale_price: 'Held, stale price',
  price_outlier: 'Held, price out of line',
  outside_window: 'Opens three days out',
  price_guard: 'Tracked, extreme price',
  thin_market: 'Tracked, few books',
  data_gap: 'Tracked, thin data',
  same_side: 'Tracked, same side as the pick',
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

/**
 * Conviction shown in the UI: a function of expected value and nothing
 * else. Recommended picks start at 62; leans stay under 50. It tops out at
 * 89 ("Strong"). The top band is left for a record that has earned it.
 */
const MAX_CONVICTION = 0.89;
/** A pick that only clears the bar because of a situational adjustment cannot be a top-tier play. */
const SITUATIONAL_MAX = Object.freeze({ tier: 'tier2', score: 0.79 });
export function convictionFromEv(ev) {
  return Math.min(MAX_CONVICTION, clamp01(0.5 + 8 * ev));
}
function leanScore(gap) {
  return Math.min(0.49, 0.25 + 0.05 * Math.abs(isNum(gap) ? gap : 0));
}
/**
 * Conviction for a moneyline winner call: how likely the team is to win,
 * on the same 25-49 band every lean uses, so no lean can outrank a
 * recommended pick. A coin flip scores 25, a 70% favorite 37, 90% or
 * better 49.
 */
function winnerScore(win) {
  return Math.min(0.49, 0.25 + 0.6 * Math.max(0, (isNum(win) ? win : 0.5) - 0.5));
}
function convictionLabel(total) {
  if (total >= 0.9) return 'Elite';
  if (total >= 0.8) return 'Strong';
  if (total >= 0.7) return 'Solid';
  return 'Lean';
}

function tierForEv(ev, t) {
  if (!isNum(ev)) return null;
  if (ev >= t.tier1) return 'tier1';
  if (ev >= t.tier2) return 'tier2';
  if (ev >= t.tier3) return 'tier3';
  return null;
}

function contextBullets(game, e) {
  const out = [];
  const homeAbbr = game.teams.home.abbrev, awayAbbr = game.teams.away.abbrev;
  if (e.projection && e.ratings) {
    out.push(
      `Maximus ratings: ${awayAbbr} ${fmtSigned(e.ratings.away.rating)}, ${homeAbbr} ${fmtSigned(e.ratings.home.rating)}; ` +
      `projection ${homeAbbr} ${fmtLine(e.projection.fairSpreadHome)}, total ${e.projection.total.toFixed(1)}.`
    );
  }
  for (const s of ['away', 'home']) {
    const q = e.quarterbacks?.[s];
    if (!q) continue;
    if (q.uncertain && q.reason) out.push(`Quarterback: ${q.reason}.`);
    else if (q.changed && q.starter && Math.abs(q.points) >= 0.5) {
      out.push(
        `Quarterback: ${q.starter} starts for ${q.team}; ${q.primary?.name || 'another quarterback'} took ${Math.round((q.primary?.share || 0) * 100)}% ` +
        `of the snaps behind the rating. Worth ${fmtSigned(q.points)} points${q.lowSample ? ' on a small sample' : ''}.`
      );
    }
  }
  const mm = e.units?.mismatches?.[0];
  if (mm) {
    const A = (c) => (c === e.teams.home ? homeAbbr : awayAbbr);
    out.push(
      `Biggest unit mismatch: ${A(mm.offenseTeam)} ${UNIT_LABELS[mm.offense].toLowerCase()} (${mm.offenseGrade}) ` +
      `against ${A(mm.defenseTeam)} ${UNIT_LABELS[mm.defense].toLowerCase()} (${mm.defenseGrade}).`
    );
  }
  const tn = talentNote(e.talent);
  if (tn) out.push(tn);
  if (e.env?.label) out.push(`Conditions: ${e.env.label}.`);
  for (const tag of (e.situations || []).slice(0, 2)) out.push(tag.note);
  return out;
}

function makePick({ game, e, kind, side, line, price, book, probs, ev, tier, role, reason, score, headline, bullets, components, modelSource, why, whyShort }) {
  const away = teamShape(game.teams.away);
  const home = teamShape(game.teams.home);
  const team = side === 'away' ? away : side === 'home' ? home : null;
  const label = kind === 'total'
    ? `${side === 'over' ? 'Over' : 'Under'} ${line}`
    : kind === 'runline'
      ? `${team.shortName} ${fmtLine(line)}`
      : `${team.shortName} ${fmtOdds(price)}`.trim();
  const priceLabel = isNum(price) ? `${fmtOdds(price)}${book?.title ? ` at ${book.title}` : ''}` : null;
  const winShare = probs && probs.win + probs.lose > 0 ? probs.win / (probs.win + probs.lose) : null;
  const legacyCategory = kind === 'moneyline' ? 'pickEms' : kind === 'runline' ? 'ats' : 'totals';
  const isHero = role === 'hero';

  const displayMetrics = {
    edgeLabel: 'Expected value',
    edgeValue: isNum(ev) ? `${fmtSigned(ev * 100)}%` : null,
    hitProbabilityLabel: kind === 'moneyline' ? 'Fair win %' : kind === 'total' ? 'Fair hit %' : 'Fair cover %',
    hitProbabilityValue: pct(winShare),
    hitProbabilityDescription: 'Chance this bet wins at this number, from the multi-book consensus, with pushes set aside.',
    signalQualityLabel: 'Price',
    signalQualityValue: priceLabel || '—',
    signalQualityDescription: isHero
      ? 'The book and price this pick is graded at. Expected value assumes you get this number or better.'
      : (HOLD_REASONS[reason] || HOLD_REASONS.no_price_edge),
    betScoreLabel: 'Conviction',
    betScoreValue: String(Math.round(score * 100)),
  };

  return {
    id: `${game.gameId}-${kind}-${side}`,
    sport: 'nfl',
    gameId: game.gameId,
    week: game.week ?? null,
    tier: isHero ? tier : 'tracking',
    pickRole: role,
    conviction: { label: convictionLabel(score), score: Math.round(score * 100) },

    market: { type: kind, line: isNum(line) ? line : null, priceAmerican: isNum(price) ? price : null },
    selection: { side, team: team?.shortName || null, label, priceLabel },
    book: book ? { key: book.key, title: book.title } : null,

    matchup: {
      awayTeam: away,
      homeTeam: home,
      startTime: game.startTime,
      venue: game.venue?.name || null,
      network: game.broadcast?.network || null,
    },

    betScore: { total: round3(score), components, weights: null },
    // `why` is the one sentence shown wherever this pick is stated: app
    // tiles, the briefing, emails. It is stored with the pick.
    why: why || headline,
    whyShort: whyShort || why || headline,
    environment: e.env ? { indoor: e.env.indoor, venue: e.env.venue, label: e.env.label, wind: e.env.wind, temp: e.env.temp } : null,
    rationale: { headline, bullets, why: why || headline, whyShort: whyShort || why || headline, pickRole: role },
    displayMetrics,
    flags: {
      informationGap: false,
      priceGuard: reason === 'price_guard',
      qbInjury: reason === 'qb_uncertain' || reason === 'injury_feed_down',
      tracking: !isHero,
    },

    ev: round3(ev),
    fair: probs ? {
      win: round3(probs.win), push: round3(probs.push), lose: round3(probs.lose),
      priceAmerican: probToAmerican(winShare),
    } : null,
    modelProb: round3(winShare),
    impliedProb: round3(impliedProb(price)),
    rawEdge: round3(ev),
    edgePoints: kind === 'total' ? e.modelGap?.total ?? null : e.modelGap?.side ?? null,
    expectedTotal: kind === 'total' ? (e.projection?.total ?? null) : null,
    isLowConviction: !isHero,
    lowSignalReason: isHero ? null : (reason || 'no_price_edge'),
    modelSource,

    result: null,

    // Back-compat mirror for legacy consumers of the v1 shape.
    category: legacyCategory,
    confidence: tier === 'tier1' ? 'high' : tier === 'tier2' ? 'medium' : 'low',
    confidenceScore: Math.round(score * 100) / 100,
    pick: {
      label,
      side,
      value: kind === 'moneyline' ? (price ?? null) : line,
      marketType: kind,
      explanation: why || headline,
      topSignals: bullets.slice(0, 3),
    },
    model: {
      awayWinProb: isNum(e.fair?.homeWin) ? round3(1 - e.fair.homeWin) : null,
      homeWinProb: isNum(e.fair?.homeWin) ? e.fair.homeWin : null,
      impliedAwayWinProb: isNum(e.consensus?.fairHomeWin) ? round3(1 - e.consensus.fairHomeWin) : null,
      impliedHomeWinProb: e.consensus?.fairHomeWin ?? null,
      edge: round3(Math.abs(ev ?? 0)),
      dataQuality: components.modelConfidence,
      signalAgreement: null,
      projectedMargin: e.projection?.margin ?? null,
      projectedTotal: e.projection?.total ?? null,
    },
  };
}

/** Best price on the board for a side at exactly the consensus line (or any moneyline). */
function priceAtConsensus(offers, line) {
  const pool = isNum(line) ? offers.filter((o) => o.line === line) : offers;
  return pool.filter((o) => !o.flags.stale).sort((a, b) => b.ev - a.ev)[0] || null;
}

/**
 * @param {object} args
 * @param {Array}  args.games   normalized NFL games with an `engine` block (api/_lib/nflSlate.js)
 * @param {object} [args.config]
 * @param {object} [args.scorecardSummary]
 * @param {Date}   [args.now]
 */
export function buildNflPicksV2({
  games = [],
  config = NFL_DEFAULT_CONFIG,
  modelVersion = NFL_MODEL_VERSION,
  scorecardSummary = null,
  now = new Date(),
  // Accepted and ignored: v1 callers passed the ratings here.
  ratings = null, // eslint-disable-line no-unused-vars
} = {}) {
  const cfg = { ...NFL_DEFAULT_CONFIG, ...(config || {}) };
  const thresholds = { ...NFL_DEFAULT_CONFIG.evThresholds, ...(cfg.evThresholds || {}) };
  const guards = { ...NFL_DEFAULT_CONFIG.guards, ...(cfg.guards || {}) };
  const nowMs = now.getTime();
  const meta = {
    totalCandidates: 0, qualifiedGames: 0, skippedGames: 0, picksPublished: 0, flags: [],
    heldByReason: {}, booksSeen: [],
  };

  const upcoming = (games || []).filter((g) => {
    const s = (g?.status || '').toLowerCase();
    return g && !g.gameState?.isLive && !g.gameState?.isFinal && s !== 'final' && s !== 'live' && s !== 'postponed';
  }).sort((a, b) => Date.parse(a.startTime || 0) - Date.parse(b.startTime || 0));

  meta.totalCandidates = upcoming.length;
  const week = upcoming.find((g) => g.week != null)?.week ?? games.find((g) => g?.week != null)?.week ?? null;
  const seasonType = upcoming[0]?.seasonType ?? games[0]?.seasonType ?? null;
  const bookSet = new Set();

  const heroCandidates = [];
  const all = [];
  const byGame = [];

  for (const game of upcoming) {
    const e = game.engine;
    if (!e || !game.teams?.home?.abbrev || !game.teams?.away?.abbrev) { meta.skippedGames += 1; continue; }
    meta.qualifiedGames += 1;
    const books = game.market?.books || [];
    for (const b of books) bookSet.add(b.key);
    const homeAbbr = game.teams.home.abbrev;
    const hoursOut = (Date.parse(game.startTime || '') - nowMs) / 3_600_000;

    // A reason that holds every pick on this game to tracking.
    let gameHold = null;
    if (e.flags?.qbUncertain) gameHold = e.flags.injuryFeedDown && !Object.values(e.quarterbacks || {}).some((q) => q.status) ? 'injury_feed_down' : 'qb_uncertain';
    else if (!(hoursOut <= cfg.lockWindowHours)) gameHold = 'outside_window';

    const fair = e.fair || {};
    const priced = (market, side) => priceOffers({ market, side, books, fair: { margin: fair.margin, total: fair.total, homeWin: fair.homeWin }, consensus: e.consensus, params: cfg.market });
    const offers = {
      runline: { home: priced('spread', 'home'), away: priced('spread', 'away') },
      moneyline: { home: priced('moneyline', 'home'), away: priced('moneyline', 'away') },
      total: { over: priced('total', 'over'), under: priced('total', 'under') },
    };

    const picks = { moneyline: null, runline: null, total: null };
    const context = () => contextBullets(game, e);
    const windTag = (e.situations || []).find((t) => t.key === 'windUnder' && t.weight !== 0);

    // ── Value candidates: the best clean offer on each side of each market ──
    const candidates = [];
    for (const kind of ['runline', 'moneyline', 'total']) {
      for (const side of Object.keys(offers[kind])) {
        const list = offers[kind][side];
        const top = list[0];
        const clean = bestOffer(list);
        let cand = clean || top;
        if (!cand) continue;
        let hold = gameHold;
        // The best number on the board is flagged and nothing clean qualifies:
        // show it, held, so the reader sees why it is not a pick.
        const flagged = top && (top.flags.stale || top.flags.implausible);
        if (flagged && tierForEv(top.ev, thresholds) && !(clean && tierForEv(clean.ev, thresholds))) {
          cand = top;
          hold = hold || (top.flags.implausible ? 'price_outlier' : 'stale_price');
        }
        if (kind === 'moneyline' && (cand.price < guards.mlMaxFavorite || cand.price > guards.mlMaxUnderdog)) hold = hold || 'price_guard';
        candidates.push({ kind, side, offer: cand, hold, tier: tierForEv(cand.ev, thresholds) });
      }
    }
    const qualifying = candidates.filter((c) => c.tier).sort((x, y) => y.offer.ev - x.offer.ev);
    const bestSide = qualifying.find((c) => c.kind !== 'total') || null;
    const bestTotal = qualifying.find((c) => c.kind === 'total') || null;

    const valuePick = (c, shadowed = false) => {
      const { kind, side, offer } = c;
      const team = side === 'home' ? game.teams.home : side === 'away' ? game.teams.away : null;
      const name = kind === 'total' ? `${side === 'over' ? 'Over' : 'Under'} ${offer.line}` : kind === 'runline' ? `${team.name} ${fmtLine(offer.line)}` : `${team.name} to win`;
      const winShare = offer.probs.win / (offer.probs.win + offer.probs.lose);
      const fairPrice = probToAmerican(winShare);
      // A wind pick is an under that only clears the bar because of the wind
      // shift. An under that qualifies on price alone is a price pick, with
      // the wind as supporting context.
      const windHelps = kind === 'total' && side === 'under' && windTag;
      const evCalm = windHelps ? expectedValue(totalProbs(fair.total - windTag.weight, offer.line, 'under'), offer.price) : null;
      const wind = windHelps && !tierForEv(evCalm, thresholds) ? windTag : null;
      const bullets = [];
      if (kind === 'total') {
        bullets.push(`${e.consensus.counts.total} books put the fair total at ${e.consensus.fairTotal.toFixed(1)}${windHelps ? `, and wind takes it to ${fair.total.toFixed(1)}` : ''}. ${offer.title} has ${side === 'over' ? 'Over' : 'Under'} ${offer.line} at ${fmtOdds(offer.price)}.`);
      } else if (kind === 'runline') {
        bullets.push(`${e.consensus.counts.spread} books make this ${homeAbbr} ${fmtLine(e.consensus.spreadHome)}. ${offer.title} has ${team.abbrev} ${fmtLine(offer.line)} at ${fmtOdds(offer.price)}.`);
      } else {
        bullets.push(`${e.consensus.counts.moneyline} books put ${team.abbrev} at ${pct(winShare)} to win with the vig removed. ${offer.title} is paying ${fmtOdds(offer.price)}.`);
      }
      bullets.push(
        `At that number the bet wins ${pct(offer.probs.win)}${offer.probs.push > 0.001 ? `, pushes ${pct(offer.probs.push)}` : ''}; ` +
        `the price needs ${pct(offer.implied)}. Fair price ${fmtOdds(fairPrice)}, expected value ${fmtSigned(offer.ev * 100)}% per unit.`
      );
      if (windHelps) bullets.push(windTag.note);
      bullets.push(...context(side).filter((b) => !windHelps || b !== windTag.note));
      const hold = c.hold || (shadowed ? 'same_side' : null);
      if (hold) bullets.unshift(HOLD_REASONS[hold]);
      const evText = `${fmtSigned(offer.ev * 100)}% expected value`;
      const consLine = kind === 'runline' ? (side === 'home' ? e.consensus.spreadHome : -e.consensus.spreadHome) : kind === 'total' ? e.consensus.total : null;
      const offMarket = isNum(consLine) && offer.line !== consLine;
      const what = kind === 'total' ? `${side === 'over' ? 'Over' : 'Under'} ${offer.line}` : kind === 'runline' ? `${team.abbrev} ${fmtLine(offer.line)}` : `${team.abbrev} to win`;
      let why;
      let whyShort;
      if (wind) {
        const rec = windUnderRecord(e.env.wind);
        const pts = Math.abs(windTag.weight).toFixed(1);
        why = `${Math.round(e.env.wind)} mph wind is forecast${e.env.venue ? ` at ${e.env.venue}` : ''}, which takes ${pts} points off our fair total. Unders have won ${rec.pct}% of games in ${rec.band} since ${rec.record.since}. ${offer.title}’s ${fmtOdds(offer.price)} on ${what} is ${evText}.`;
        whyShort = `${Math.round(e.env.wind)} mph wind takes ${pts} points off the total; unders win ${rec.pct}% in wind like this`;
      } else if (offMarket) {
        const marketLine = kind === 'total' ? consLine : fmtLine(consLine);
        why = `${offer.title} has ${what} while the market across ${e.consensus.counts[kind === 'total' ? 'total' : 'spread']} books is ${marketLine}. At ${fmtOdds(offer.price)} that is ${evText}.`;
        whyShort = `${offer.title} is at ${kind === 'total' ? offer.line : fmtLine(offer.line)}; the market is ${marketLine}`;
      } else {
        why = `${offer.title} is paying ${fmtOdds(offer.price)} on ${what}; the market’s fair price is ${fmtOdds(fairPrice)}. That gap is ${evText}.`;
        whyShort = `${offer.title} pays ${fmtOdds(offer.price)}; the fair price is ${fmtOdds(fairPrice)}`;
      }
      if (hold) {
        why = `${HOLD_WHY[hold] || 'Tracked, not recommended.'} ${why}`;
        whyShort = `${HOLD_SHORT[hold] || 'Tracked'}. ${whyShort}`;
      }
      const role = hold ? 'tracking' : 'hero';
      let score = hold ? Math.min(0.49, convictionFromEv(offer.ev) - 0.2) : convictionFromEv(offer.ev);
      if (wind && !hold) {
        // The wind shift is an estimate, shrunk from a 23-year sample and
        // applied to a forecast. It can make a pick; it cannot make a top play.
        if (c.tier === 'tier1') c.tier = SITUATIONAL_MAX.tier;
        score = Math.min(score, SITUATIONAL_MAX.score);
      }
      return makePick({
        game, e, kind, side, line: kind === 'moneyline' ? null : offer.line, price: offer.price,
        book: { key: offer.book, title: offer.title }, probs: offer.probs, ev: offer.ev,
        tier: c.tier, role, reason: hold, score,
        headline: wind
          ? `${name}: ${Math.round(e.env.wind)} mph wind and ${fmtOdds(offer.price)} at ${offer.title}`
          : `${name} at ${fmtOdds(offer.price)} (${offer.title}): the market’s fair price is ${fmtOdds(fairPrice)}`,
        bullets,
        components: {
          edgeStrength: round3(clamp01(offer.ev / 0.06)),
          modelConfidence: round3(clamp01((e.consensus.books || 0) / 10)),
          situationalEdge: wind ? 1 : 0.5,
          marketQuality: round3(clamp01((e.consensus.books || 0) / 10)),
        },
        modelSource: wind ? 'nfl_v2_wind' : 'nfl_v2_price',
        why, whyShort,
      });
    };

    if (bestSide) picks[bestSide.kind] = valuePick(bestSide);
    if (bestTotal) picks.total = valuePick(bestTotal);
    // A qualifying price on the other side market is the same opinion; show it, do not double up.
    const otherSide = bestSide && qualifying.find((c) => c.kind !== 'total' && c.kind !== bestSide.kind);
    if (otherSide && !picks[otherSide.kind]) picks[otherSide.kind] = valuePick(otherSide, true);

    // ── Model leans for every market without a value pick ──
    const leanSideHome = isNum(e.modelGap?.side) ? e.modelGap.side > 0 : null;
    const leanOver = isNum(e.modelGap?.total) ? e.modelGap.total > 0 : null;
    const baseReason = gameHold === 'qb_uncertain' || gameHold === 'injury_feed_down' ? gameHold
      : e.flags?.dataGap ? 'data_gap' : e.flags?.thinMarket ? 'thin_market' : 'no_price_edge';
    const leanComponents = (gap) => ({
      edgeStrength: round3(clamp01(Math.abs(gap ?? 0) / 10)),
      modelConfidence: round3(clamp01((e.consensus?.books || 0) / 10)),
      situationalEdge: 0.5,
      marketQuality: round3(clamp01((e.consensus?.books || 0) / 10)),
    });
    const leanBullets = (reason, lead, side) => [HOLD_REASONS[reason], lead, ...context(side)].filter(Boolean);
    const cap = (t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
    const leanWhy = (reason, text) => (reason === 'no_price_edge'
      ? `Lean only, not a recommended bet: ${text} No book’s price beats the market.`
      : `${HOLD_WHY[reason] || 'Tracked, not recommended.'} ${cap(text)}`);
    const leanShort = (reason, text) => (reason === 'no_price_edge' ? `Lean: ${text}` : `${HOLD_SHORT[reason] || 'Tracked'}. ${cap(text)}`);

    if (!picks.runline && isNum(e.consensus?.spreadHome)) {
      const sideIsHome = leanSideHome ?? ((offers.runline.home[0]?.ev ?? -1) >= (offers.runline.away[0]?.ev ?? -1));
      const side = sideIsHome ? 'home' : 'away';
      const line = sideIsHome ? e.consensus.spreadHome : -e.consensus.spreadHome;
      const at = priceAtConsensus(offers.runline[side], line);
      const probs = at?.probs || (isNum(fair.margin) ? spreadProbs(fair.margin, e.consensus.spreadHome, side) : null);
      const price = at?.price ?? -110;
      const team = sideIsHome ? game.teams.home : game.teams.away;
      const gap = e.modelGap?.side;
      picks.runline = makePick({
        game, e, kind: 'runline', side, line, price, book: at ? { key: at.book, title: at.title } : null,
        probs, ev: probs ? expectedValue(probs, price) : null, tier: null, role: 'tracking', reason: baseReason, score: leanScore(gap),
        headline: e.projection
          ? `Model lean: ${team.name} ${fmtLine(line)}. Ratings make it ${homeAbbr} ${fmtLine(e.projection.fairSpreadHome)} against a market of ${homeAbbr} ${fmtLine(e.consensus.spreadHome)}`
          : `${team.name} ${fmtLine(line)}: no model lean available`,
        bullets: leanBullets(baseReason, isNum(gap) ? `The ratings and the market are ${Math.abs(gap).toFixed(1)} points apart. Over 4,096 games since 2011, gaps like this have not predicted which side covers.` : null, side),
        components: leanComponents(gap), modelSource: 'nfl_v2_lean',
        why: leanWhy(baseReason, e.projection
          ? `the ratings make it ${homeAbbr} ${fmtLine(e.projection.fairSpreadHome)} against a market of ${homeAbbr} ${fmtLine(e.consensus.spreadHome)}.`
          : `no ratings projection is available for this game.`),
        whyShort: leanShort(baseReason, e.projection
          ? `ratings ${homeAbbr} ${fmtLine(e.projection.fairSpreadHome)}, market ${homeAbbr} ${fmtLine(e.consensus.spreadHome)}`
          : 'no ratings projection'),
      });
    }
    // The moneyline lean is a winner call: the team the market's fair price
    // makes more likely to win, scored by that likelihood. It used to follow
    // the spread lean's side, which made it the underdog in most games and
    // ranked 7% long shots as the strongest moneyline calls. Covering and
    // winning are different questions, so the two leans may now disagree.
    if (!picks.moneyline && isNum(fair.homeWin)) {
      const sideIsHome = fair.homeWin >= 0.5;
      const side = sideIsHome ? 'home' : 'away';
      const at = priceAtConsensus(offers.moneyline[side], null);
      if (at) {
        const team = sideIsHome ? game.teams.home : game.teams.away;
        const other = sideIsHome ? game.teams.away : game.teams.home;
        const win = sideIsHome ? fair.homeWin : 1 - fair.homeWin;
        const reason = (at.price < guards.mlMaxFavorite || at.price > guards.mlMaxUnderdog) && baseReason === 'no_price_edge' ? 'price_guard' : baseReason;
        const books = e.consensus?.counts?.moneyline || e.consensus?.books || null;
        const booksText = books ? `${books} books give` : 'the market gives';
        // The ratings' margin for the called team: positive when they agree.
        const ratingsMargin = isNum(e.projection?.fairSpreadHome)
          ? (sideIsHome ? -e.projection.fairSpreadHome : e.projection.fairSpreadHome)
          : null;
        const ratingsText = !isNum(ratingsMargin) ? ''
          : Math.abs(ratingsMargin) < 0.05 ? 'the ratings call it even'
            : ratingsMargin > 0 ? `the ratings make it ${team.abbrev} by ${ratingsMargin.toFixed(1)}`
              : `the ratings lean ${other.abbrev} by ${Math.abs(ratingsMargin).toFixed(1)}`;
        const priceText = `${fmtOdds(at.price)} needs ${pct(at.implied, 0)}`;
        const winnerComponents = {
          edgeStrength: round3(clamp01((win - 0.5) / 0.4)),
          modelConfidence: round3(clamp01((e.consensus?.books || 0) / 10)),
          situationalEdge: 0.5,
          marketQuality: round3(clamp01((e.consensus?.books || 0) / 10)),
        };
        picks.moneyline = makePick({
          game, e, kind: 'moneyline', side, line: null, price: at.price, book: { key: at.book, title: at.title },
          probs: at.probs, ev: at.ev, tier: null, role: 'tracking', reason, score: winnerScore(win),
          headline: `Winner call: ${team.name} to win. Market ${pct(win, 0)}, best price ${fmtOdds(at.price)}`,
          bullets: leanBullets(reason, [
            `${cap(booksText)} ${team.abbrev} a ${pct(win)} chance to win with the vig removed; ${at.title} pays ${fmtOdds(at.price)}, which needs ${pct(at.implied)}.`,
            ratingsText ? `${cap(ratingsText)}.` : null,
            'This is a call on who wins, not a recommended bet: no book’s price beats the market’s fair price.',
          ].filter(Boolean).join(' '), side),
          components: winnerComponents, modelSource: 'nfl_v2_winner',
          why: leanWhy(reason, `${booksText} ${team.abbrev} a ${pct(win, 0)} chance to win${ratingsText ? `, and ${ratingsText}` : ''}. The best price, ${fmtOdds(at.price)} at ${at.title}, needs ${pct(at.implied, 0)}.`),
          whyShort: leanShort(reason, `${booksText} ${team.abbrev} ${pct(win, 0)} to win${ratingsText ? `; ${ratingsText}` : ''}; ${priceText}`),
        });
      }
    }
    if (!picks.total && isNum(e.consensus?.total)) {
      const over = leanOver ?? ((offers.total.over[0]?.ev ?? -1) >= (offers.total.under[0]?.ev ?? -1));
      const side = over ? 'over' : 'under';
      const line = e.consensus.total;
      const at = priceAtConsensus(offers.total[side], line);
      const probs = at?.probs || (isNum(fair.total) ? totalProbs(fair.total, line, side) : null);
      const price = at?.price ?? -110;
      const gap = e.modelGap?.total;
      picks.total = makePick({
        game, e, kind: 'total', side, line, price, book: at ? { key: at.book, title: at.title } : null,
        probs, ev: probs ? expectedValue(probs, price) : null, tier: null, role: 'tracking', reason: baseReason, score: leanScore(gap),
        headline: e.projection
          ? `Model lean: ${over ? 'Over' : 'Under'} ${line}. Ratings project ${e.projection.total.toFixed(1)} against a market of ${line}`
          : `${over ? 'Over' : 'Under'} ${line}: no model lean available`,
        bullets: leanBullets(baseReason, e.projection ? `Ratings project ${e.projection.awayPoints.toFixed(1)} to ${e.projection.homePoints.toFixed(1)}. Since 2011 the ratings’ disagreements with the closing total have not reliably predicted overs or unders.` : null, null),
        components: leanComponents(gap), modelSource: 'nfl_v2_lean',
        why: leanWhy(baseReason, e.projection
          ? `the ratings project ${e.projection.total.toFixed(1)} points against a market of ${line}${e.env?.label ? ` (${e.env.label.charAt(0).toLowerCase()}${e.env.label.slice(1)})` : ''}.`
          : `no ratings projection is available for this game.`),
        whyShort: leanShort(baseReason, e.projection ? `ratings project ${e.projection.total.toFixed(1)}, market ${line}` : 'no ratings projection'),
      });
    }

    for (const p of Object.values(picks)) {
      if (!p) continue;
      all.push(p);
      if (p.pickRole === 'hero') heroCandidates.push(p);
      else meta.heldByReason[p.lowSignalReason] = (meta.heldByReason[p.lowSignalReason] || 0) + 1;
    }

    byGame.push({
      gameId: game.gameId,
      week: game.week ?? null,
      startTime: game.startTime,
      awayTeam: teamShape(game.teams.away),
      homeTeam: teamShape(game.teams.home),
      network: game.broadcast?.network || null,
      projection: e.projection ? {
        margin: e.projection.margin,
        fairSpreadHome: e.projection.fairSpreadHome,
        total: e.projection.total,
        homePoints: e.projection.homePoints,
        awayPoints: e.projection.awayPoints,
        homeWinProb: e.fair?.homeWin ?? null,
        parts: e.projection.parts,
      } : null,
      market: {
        spreadHome: e.consensus?.spreadHome ?? null,
        total: e.consensus?.total ?? null,
        moneyline: game.market?.moneyline || null,
        fairMargin: e.consensus?.fairMargin ?? null,
        fairTotal: e.consensus?.fairTotal ?? null,
        fairHomeWin: e.consensus?.fairHomeWin ?? null,
        books: e.consensus?.books ?? 0,
      },
      fair: e.fair || null,
      quarterbacks: e.quarterbacks || null,
      units: e.units || null,
      talent: e.talent || null,
      situations: e.situations || [],
      environment: e.env || null,
      coaches: e.coaches || null,
      injuries: game.injuries || null,
      flags: e.flags || {},
      picks,
    });
  }

  // ── Tiers: fixed thresholds, capped per tier and per game ──
  const caps = { ...NFL_DEFAULT_CONFIG.maxPerTier, ...(cfg.maxPerTier || {}) };
  const tiers = { tier1: [], tier2: [], tier3: [] };
  const perGame = new Map();
  for (const p of [...heroCandidates].sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))) {
    const n = perGame.get(p.gameId) || 0;
    const room = tiers[p.tier].length < caps[p.tier] && n < cfg.maxPerGame;
    if (!room) {
      p.pickRole = 'tracking'; p.rationale.pickRole = 'tracking'; p.tier = 'tracking';
      p.isLowConviction = true; p.lowSignalReason = 'no_price_edge'; p.flags.tracking = true;
      continue;
    }
    tiers[p.tier].push(p);
    perGame.set(p.gameId, n + 1);
  }
  const published = [...tiers.tier1, ...tiers.tier2, ...tiers.tier3];
  meta.picksPublished = published.length;
  meta.booksSeen = [...bookSet].sort();
  if (upcoming.length > 0 && published.length === 0) meta.flags.push('no_qualified_edges');
  if (upcoming.some((g) => g.engine?.flags?.dataGap)) meta.flags.push('model_data_gap');
  if (upcoming.some((g) => g.engine?.flags?.injuryFeedDown)) meta.flags.push('injury_feed_down');

  const trackingPicks = all.filter((p) => p.pickRole !== 'hero');
  const categories = { pickEms: [], ats: [], leans: [], totals: [] };
  for (const p of published) {
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
    configVersion: cfg.version || 'nfl-picks-unknown',
    generatedAt: now.toISOString(),
    topPick: tiers.tier1[0] || tiers.tier2[0] || tiers.tier3[0] || null,
    tiers,
    coverage: [],
    fullSlatePicks: all,
    heroPicks: published,
    trackingPicks,
    byGame,
    scorecardSummary: scorecardSummary || null,
    meta: {
      ...meta,
      model: {
        evThresholds: thresholds,
        modelWeight: cfg.modelWeight,
        lockWindowHours: cfg.lockWindowHours,
      },
    },
    legacy: { categories },
    categories,
  };
}
