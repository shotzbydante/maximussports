/**
 * NFL team ratings, version 2. Pure and deterministic, no I/O.
 *
 * What changed from v1 (`../nflModel.js`)
 * ---------------------------------------
 * v1 solved offense and defense from this season's final scores and then
 * multiplied every team by games / (games + 4). That shrinks toward "an
 * average team", which narrows every lopsided spread and makes the model
 * like every big underdog.
 *
 * v2 rates each team on two things per game, both in points:
 *   - points scored and allowed
 *   - offensive EPA gained and allowed (nflverse), which strips out most of
 *     the bounce-of-the-ball noise in a final score
 * It reaches back into last season with a weight that decays by week, so
 * the prior for a team in September is that team a year ago, fading as this
 * season's games arrive. The ridge term sits inside the solve, so a team is
 * pulled toward average only as far as its evidence is thin.
 *
 * Every constant in `RATING_PARAMS` was set by `scripts/nfl/backtest.mjs`
 * on 2011 to 2019 and checked on 2020 to 2025. See docs/nfl-picks-engine-v2.md.
 */

export const RATING_PARAMS = Object.freeze({
  /** Home-field advantage in points. */
  hfa: 1.8,
  /** Weeks for a game's weight to fall to 1/e. */
  tauWeeks: 24,
  /** Extra weeks of decay charged for crossing an offseason. */
  offseasonWeeks: 14,
  /** Ridge strength, in games of league-average evidence. */
  ridge: 6,
  /** Weight on EPA (the rest is on points) in each game's score. */
  epaWeight: 0.3,
  /** Seasons of history read (this one plus this many before it). */
  lookbackSeasons: 2,
  /** Weeks counted per season when measuring distance across seasons. */
  seasonSpanWeeks: 22,
  iterations: 60,
  damping: 0.5,
});

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

/** Weeks between a past game and the week being rated. */
export function weeksAgo(game, asOf, p = RATING_PARAMS) {
  if (game.season === asOf.season) return asOf.week - game.week;
  const seasons = asOf.season - game.season;
  return asOf.week + (p.seasonSpanWeeks - game.week) + p.offseasonWeeks + (seasons - 1) * (p.seasonSpanWeeks + p.offseasonWeeks);
}

/** True when `game` was played strictly before the week being rated. */
export function isBefore(game, asOf) {
  return game.season < asOf.season || (game.season === asOf.season && game.week < asOf.week);
}

/**
 * @param {object} args
 * @param {Array}  args.games      nflverse games (see data/nflverse.js)
 * @param {Array}  args.teamWeeks  nflverse team-game EPA rows
 * @param {{season:number, week:number}} args.asOf  rate using games before this week
 * @param {object} [args.params]
 * @returns {{ teams: Record<string, object>, leaguePpg: number, games: number, asOf: object, epaCoverage: number }}
 */
export function buildRatings({ games = [], teamWeeks = [], asOf, params = RATING_PARAMS }) {
  const p = { ...RATING_PARAMS, ...params };
  const minSeason = asOf.season - p.lookbackSeasons;

  const epaByKey = new Map();
  for (const t of teamWeeks) {
    if (t.season < minSeason) continue;
    if (!isNum(t.passEpa) || !isNum(t.rushEpa)) continue;
    epaByKey.set(`${t.gameId}|${t.team}`, t.passEpa + t.rushEpa);
  }

  // One row per team per game, home field removed.
  const rows = [];
  let wSum = 0, ptsSum = 0, epaW = 0, epaSum = 0, withEpa = 0, finals = 0;
  for (const g of games) {
    if (g.season < minSeason || !isBefore(g, asOf)) continue;
    if (!isNum(g.homeScore) || !isNum(g.awayScore)) continue;
    const ago = weeksAgo(g, asOf, p);
    const w = Math.exp(-ago / p.tauWeeks);
    const h = g.neutral ? 0 : p.hfa;
    const homeEpa = epaByKey.get(`${g.id}|${g.home}`);
    const awayEpa = epaByKey.get(`${g.id}|${g.away}`);
    const hasEpa = isNum(homeEpa) && isNum(awayEpa);
    finals += 1;
    if (hasEpa) withEpa += 1;
    rows.push({ w, home: g.home, away: g.away, season: g.season, week: g.week,
      homePts: g.homeScore - h / 2, awayPts: g.awayScore + h / 2,
      homeEpa: hasEpa ? homeEpa : null, awayEpa: hasEpa ? awayEpa : null,
      rawHome: g.homeScore, rawAway: g.awayScore });
    wSum += 2 * w; ptsSum += w * (g.homeScore + g.awayScore);
    if (hasEpa) { epaW += 2 * w; epaSum += w * (homeEpa + awayEpa); }
  }

  if (rows.length === 0) return { teams: {}, leaguePpg: 22.5, games: 0, asOf, epaCoverage: 0 };

  const leaguePpg = ptsSum / wSum;
  const leagueEpa = epaW > 0 ? epaSum / epaW : 0;

  // Each game's score for a side: points blended with EPA put on the points scale.
  const logs = {};
  const add = (team, opp, w, sFor, sAgainst, raw) => {
    (logs[team] ||= []).push({ opp, w, sFor, sAgainst, ...raw });
  };
  for (const r of rows) {
    const a = r.homeEpa == null ? 0 : p.epaWeight;
    const homeScore = (1 - a) * r.homePts + a * (leaguePpg + (r.homeEpa ?? 0) - leagueEpa);
    const awayScore = (1 - a) * r.awayPts + a * (leaguePpg + (r.awayEpa ?? 0) - leagueEpa);
    const cur = r.season === asOf.season;
    add(r.home, r.away, r.w, homeScore, awayScore, { pf: r.rawHome, pa: r.rawAway, cur, week: r.week, season: r.season });
    add(r.away, r.home, r.w, awayScore, homeScore, { pf: r.rawAway, pa: r.rawHome, cur, week: r.week, season: r.season });
  }

  const slugs = Object.keys(logs);
  let off = {}, def = {};
  for (const s of slugs) { off[s] = 0; def[s] = 0; }
  for (let i = 0; i < p.iterations; i++) {
    const nOff = {}, nDef = {};
    for (const s of slugs) {
      let o = 0, d = 0, w = 0;
      for (const g of logs[s]) {
        o += g.w * ((g.sFor - leaguePpg) + (def[g.opp] ?? 0));
        d += g.w * ((leaguePpg - g.sAgainst) + (off[g.opp] ?? 0));
        w += g.w;
      }
      nOff[s] = o / (w + p.ridge);
      nDef[s] = d / (w + p.ridge);
    }
    const mo = mean(Object.values(nOff)), md = mean(Object.values(nDef));
    for (const s of slugs) {
      nOff[s] = (1 - p.damping) * off[s] + p.damping * (nOff[s] - mo);
      nDef[s] = (1 - p.damping) * def[s] + p.damping * (nDef[s] - md);
    }
    off = nOff; def = nDef;
  }

  const teams = {};
  for (const s of slugs) {
    const all = logs[s];
    const cur = all.filter((g) => g.cur);
    const evidence = all.reduce((a, g) => a + g.w, 0);
    teams[s] = {
      team: s,
      offense: round2(off[s]),
      defense: round2(def[s]),
      rating: round2(off[s] + def[s]),
      evidence: round2(evidence),
      games: cur.length,
      pointsForPg: cur.length ? round2(mean(cur.map((g) => g.pf))) : null,
      pointsAgainstPg: cur.length ? round2(mean(cur.map((g) => g.pa))) : null,
      lastWeek: cur.length ? Math.max(...cur.map((g) => g.week)) : null,
    };
  }

  return {
    teams, leaguePpg: round2(leaguePpg), games: finals, asOf,
    epaCoverage: finals ? round2(withEpa / finals) : 0,
    /** Per-team weighted game log, kept so the quarterback layer can reuse the same weights. */
    weights: Object.fromEntries(slugs.map((s) => [s, logs[s].map((g) => ({ season: g.season, week: g.week, w: g.w }))])),
  };
}

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function round2(v) { return isNum(v) ? Math.round(v * 100) / 100 : null; }
