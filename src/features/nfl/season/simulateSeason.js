/**
 * NFL season simulation — pure, deterministic, no I/O.
 *
 * Plays out every remaining regular-season game many times using the power
 * ratings, then counts how often each team wins its division, earns the
 * top seed, or makes the playoffs.
 *
 * Seeding follows the NFL format: four division winners seeded 1-4 by
 * record, then three wild cards. Tiebreakers are a simplified version of
 * the league's: head-to-head (division ties only), division record,
 * conference record, then power rating. The full procedure (common games,
 * strength of victory, and so on) is not modelled, so a team on the bubble
 * can be off by a few points of probability. The page says so.
 */

import { NFL_TEAMS, NFL_GAMES_PER_SEASON } from '../../../sports/nfl/teams.js';
import { NFL_MODEL, normalCdf, pythagoreanWinPct } from '../picks/nflModel.js';

const META = Object.fromEntries(NFL_TEAMS.map((t) => [t.slug, t]));

/** Small, fast, seedable PRNG so a given week always simulates the same way. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function winProb(ratings, homeSlug, awaySlug, neutralSite) {
  const h = ratings?.teams?.[homeSlug]?.rating ?? 0;
  const a = ratings?.teams?.[awaySlug]?.rating ?? 0;
  const margin = h - a + (neutralSite ? 0 : NFL_MODEL.HOME_FIELD);
  return normalCdf(margin / NFL_MODEL.MARGIN_SD);
}

/**
 * @param {object} args
 * @param {Record<string, {wins,losses,ties,pointsFor,pointsAgainst}>} args.standings
 * @param {object} args.ratings — output of buildNflRatings()
 * @param {Array<{homeSlug,awaySlug,neutralSite?}>} args.remaining — unplayed games
 * @param {Array<{homeSlug,awaySlug,homeScore,awayScore}>} [args.results] — finals so far
 * @param {number} [args.sims=4000]
 * @param {number} [args.seed=1]
 * @returns {{ teams: Record<string, object>, sims: number, gamesRemaining: number }}
 */
export function simulateNflSeason({ standings = {}, ratings = null, remaining = [], results = [], sims = 4000, seed = 1 } = {}) {
  const slugs = NFL_TEAMS.map((t) => t.slug);
  const idx = Object.fromEntries(slugs.map((s, i) => [s, i]));
  const n = slugs.length;

  // Records to date, split the ways the tiebreakers need them.
  const baseW = new Float64Array(n), baseL = new Float64Array(n), baseT = new Float64Array(n);
  const baseDivW = new Float64Array(n), baseDivG = new Float64Array(n);
  const baseConfW = new Float64Array(n), baseConfG = new Float64Array(n);
  const baseH2H = new Map(); // "i|j" → wins by i over j

  for (const s of slugs) {
    const st = standings[s] || {};
    baseW[idx[s]] = st.wins || 0;
    baseL[idx[s]] = st.losses || 0;
    baseT[idx[s]] = st.ties || 0;
  }
  for (const g of results) {
    const hi = idx[g.homeSlug], ai = idx[g.awaySlug];
    if (hi == null || ai == null) continue;
    const hm = META[g.homeSlug], am = META[g.awaySlug];
    const homeWon = g.homeScore > g.awayScore;
    const tie = g.homeScore === g.awayScore;
    const credit = (wi, li) => {
      if (hm.conference === am.conference) { baseConfW[wi] += 1; }
      if (hm.division === am.division) {
        baseDivW[wi] += 1;
        baseH2H.set(`${wi}|${li}`, (baseH2H.get(`${wi}|${li}`) || 0) + 1);
      }
    };
    if (hm.conference === am.conference) { baseConfG[hi] += 1; baseConfG[ai] += 1; }
    if (hm.division === am.division) { baseDivG[hi] += 1; baseDivG[ai] += 1; }
    if (tie) continue;
    if (homeWon) credit(hi, ai); else credit(ai, hi);
  }

  const games = remaining
    .filter((g) => idx[g.homeSlug] != null && idx[g.awaySlug] != null)
    .map((g) => {
      const hm = META[g.homeSlug], am = META[g.awaySlug];
      return {
        hi: idx[g.homeSlug], ai: idx[g.awaySlug],
        p: winProb(ratings, g.homeSlug, g.awaySlug, g.neutralSite),
        sameConf: hm.conference === am.conference,
        sameDiv: hm.division === am.division,
      };
    });

  // Expected wins are exact (no simulation noise needed).
  const expWins = new Float64Array(n);
  for (let i = 0; i < n; i++) expWins[i] = baseW[i] + baseT[i] / 2;
  for (const g of games) { expWins[g.hi] += g.p; expWins[g.ai] += 1 - g.p; }

  // conference → { members, divisions: [[team indexes], ...] }
  const conferences = {};
  for (const t of NFL_TEAMS) {
    const conf = (conferences[t.conference] ||= { members: [], divisions: {} });
    conf.members.push(idx[t.slug]);
    (conf.divisions[t.division] ||= []).push(idx[t.slug]);
  }
  const ratingOf = slugs.map((s) => ratings?.teams?.[s]?.rating ?? 0);

  const playoff = new Float64Array(n), division = new Float64Array(n), topSeed = new Float64Array(n);
  const rand = mulberry32(seed);
  const w = new Float64Array(n), divW = new Float64Array(n), confW = new Float64Array(n);
  const jitter = new Float64Array(n);

  for (let s = 0; s < sims; s++) {
    w.set(expZero(baseW, baseT, n));
    divW.set(baseDivW); confW.set(baseConfW);
    const h2h = new Map(baseH2H);
    for (let i = 0; i < n; i++) jitter[i] = rand() * 1e-6;

    for (const g of games) {
      const homeWon = rand() < g.p;
      const wi = homeWon ? g.hi : g.ai;
      const li = homeWon ? g.ai : g.hi;
      w[wi] += 1;
      if (g.sameConf) confW[wi] += 1;
      if (g.sameDiv) {
        divW[wi] += 1;
        h2h.set(`${wi}|${li}`, (h2h.get(`${wi}|${li}`) || 0) + 1);
      }
    }

    // Order within a set of teams. Head-to-head only applies when asked
    // (division ties), and only between the two teams being compared.
    const order = (list, useH2H) => [...list].sort((a, b) => {
      if (w[b] !== w[a]) return w[b] - w[a];
      if (useH2H) {
        const ab = h2h.get(`${a}|${b}`) || 0;
        const ba = h2h.get(`${b}|${a}`) || 0;
        if (ab !== ba) return ba - ab;
        if (divW[b] !== divW[a]) return divW[b] - divW[a];
      }
      if (confW[b] !== confW[a]) return confW[b] - confW[a];
      return (ratingOf[b] + jitter[b]) - (ratingOf[a] + jitter[a]);
    });

    for (const conf of Object.values(conferences)) {
      const winners = Object.values(conf.divisions).map((members) => order(members, true)[0]);
      const seeded = order(winners, false);
      const winnerSet = new Set(winners);
      const wildCards = order(conf.members.filter((i) => !winnerSet.has(i)), false).slice(0, 3);

      for (const i of winners) { division[i] += 1; playoff[i] += 1; }
      for (const i of wildCards) playoff[i] += 1;
      topSeed[seeded[0]] += 1;
    }
  }

  const teams = {};
  for (const slug of slugs) {
    const i = idx[slug];
    const st = standings[slug] || {};
    const played = (st.wins || 0) + (st.losses || 0) + (st.ties || 0);
    const pyth = pythagoreanWinPct(st.pointsFor, st.pointsAgainst);
    const actualPct = played > 0 ? ((st.wins || 0) + (st.ties || 0) / 2) / played : null;
    teams[slug] = {
      slug,
      projectedWins: Math.round(expWins[i] * 10) / 10,
      projectedLosses: Math.round((NFL_GAMES_PER_SEASON - expWins[i]) * 10) / 10,
      gamesRemaining: games.filter((g) => g.hi === i || g.ai === i).length,
      playoffPct: Math.round((playoff[i] / sims) * 1000) / 1000,
      divisionPct: Math.round((division[i] / sims) * 1000) / 1000,
      topSeedPct: Math.round((topSeed[i] / sims) * 1000) / 1000,
      pythagoreanPct: pyth != null ? Math.round(pyth * 1000) / 1000 : null,
      // Positive = has won more than its scoring supports.
      luck: pyth != null && actualPct != null ? Math.round((actualPct - pyth) * played * 10) / 10 : null,
    };
  }

  return { teams, sims, gamesRemaining: games.length };
}

/** Wins to date, counting a tie as half a win, as a fresh Float64Array. */
function expZero(baseW, baseT, n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = baseW[i] + baseT[i] / 2;
  return out;
}
