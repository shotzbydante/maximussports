/**
 * Backtest plumbing for the NFL picks engine: load nflverse files from a
 * local folder and replay seasons week by week, rating each week only on
 * games that had already been played.
 *
 * Used by scripts/nfl/backtest.mjs. Not imported by the app.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseGames, parseTeamWeeks, parseQbWeeks } from '../../src/features/nfl/data/nflverse.js';
import { buildRatings } from '../../src/features/nfl/picks/v2/ratings.js';
import { buildQbTable, indexQbWeeks, qbAdjustment } from '../../src/features/nfl/picks/v2/qb.js';
import { projectGame } from '../../src/features/nfl/picks/v2/project.js';

export function loadData(dir, { fromSeason = 2016, toSeason = 2026 } = {}) {
  const cacheFile = path.join(dir, `.cache-${fromSeason}-${toSeason}.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const games = parseGames(fs.readFileSync(path.join(dir, 'games.csv'), 'utf8'), { fromSeason })
    .filter((g) => g.season <= toSeason);
  const teamWeeks = [];
  const qbWeeks = [];
  for (let y = fromSeason; y <= toSeason; y++) {
    const tf = path.join(dir, `stats_team_week_${y}.csv`);
    const pf = path.join(dir, `stats_player_week_${y}.csv`);
    if (fs.existsSync(tf)) teamWeeks.push(...parseTeamWeeks(fs.readFileSync(tf, 'utf8')));
    if (fs.existsSync(pf)) qbWeeks.push(...parseQbWeeks(fs.readFileSync(pf, 'utf8')));
  }
  const data = { games, teamWeeks, qbWeeks };
  fs.writeFileSync(cacheFile, JSON.stringify(data));
  return data;
}

/**
 * Project every game in [fromSeason, toSeason] using only earlier games.
 * @returns {Array<object>} one row per game with model, market and result
 */
export function replay(data, { fromSeason, toSeason, params = {}, useQb = true, useEnv = true } = {}) {
  const { games, teamWeeks, qbWeeks } = data;
  const qbIndex = indexQbWeeks(qbWeeks);
  const out = [];
  const weeks = new Map();
  for (const g of games) {
    if (g.season < fromSeason || g.season > toSeason) continue;
    if (g.homeScore == null || g.awayScore == null) continue;
    const k = `${g.season}|${g.week}`;
    if (!weeks.has(k)) weeks.set(k, []);
    weeks.get(k).push(g);
  }
  for (const [k, list] of weeks) {
    const [season, week] = k.split('|').map(Number);
    const asOf = { season, week };
    const ratings = buildRatings({ games, teamWeeks, asOf, params: params.rating });
    const table = useQb ? buildQbTable({ qbWeeks, asOf, params: params.qb }) : null;
    for (const g of list) {
      const qbH = useQb ? qbAdjustment({ team: g.home, starterId: g.homeQbId, ratings, table, qbIndex, params: params.qb }) : null;
      const qbA = useQb ? qbAdjustment({ team: g.away, starterId: g.awayQbId, ratings, table, qbIndex, params: params.qb }) : null;
      const proj = projectGame({
        home: g.home, away: g.away, ratings, neutral: g.neutral,
        qb: { home: qbH?.points ?? 0, away: qbA?.points ?? 0 },
        rest: { home: g.homeRest, away: g.awayRest },
        env: useEnv ? { roof: g.roof, temp: g.temp, wind: g.wind } : {},
        params,
      });
      if (!proj) continue;
      out.push({
        id: g.id, season, week, type: g.type, home: g.home, away: g.away,
        modelMargin: proj.margin, modelTotal: proj.total,
        closeMargin: g.spreadHome == null ? null : -g.spreadHome,
        closeTotal: g.total,
        margin: g.homeScore - g.awayScore,
        total: g.homeScore + g.awayScore,
        spreadHomePrice: g.spreadHomePrice, spreadAwayPrice: g.spreadAwayPrice,
        overPrice: g.overPrice, underPrice: g.underPrice,
        mlHome: g.mlHome, mlAway: g.mlAway,
        qbHome: qbH?.points ?? 0, qbAway: qbA?.points ?? 0,
        qbChange: Math.abs(qbH?.points ?? 0) + Math.abs(qbA?.points ?? 0),
        roof: g.roof, temp: g.temp, wind: g.wind, parts: proj.parts,
      });
    }
  }
  return out;
}

export function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
export function mae(rows, f) { return mean(rows.map((r) => Math.abs(f(r)))); }
export function rmse(rows, f) { return Math.sqrt(mean(rows.map((r) => f(r) ** 2))); }

/** Slope of y on x through the origin, with its standard error. */
export function slope(rows, x, y) {
  let sxx = 0, sxy = 0;
  for (const r of rows) { const a = x(r), b = y(r); sxx += a * a; sxy += a * b; }
  const g = sxy / sxx;
  let sse = 0;
  for (const r of rows) sse += (y(r) - g * x(r)) ** 2;
  const se = Math.sqrt(sse / (rows.length - 1) / sxx);
  return { gamma: g, se, n: rows.length };
}

/** How much of the model's disagreement with the closing line shows up in results. */
export function marketTest(rows) {
  const s = rows.filter((r) => r.closeMargin != null);
  const t = rows.filter((r) => r.closeTotal != null);
  return {
    n: s.length,
    side: {
      maeModel: mae(s, (r) => r.margin - r.modelMargin),
      maeClose: mae(s, (r) => r.margin - r.closeMargin),
      maeModelVsClose: mae(s, (r) => r.modelMargin - r.closeMargin),
      sdResidualClose: rmse(s, (r) => r.margin - r.closeMargin),
      ...slope(s, (r) => r.modelMargin - r.closeMargin, (r) => r.margin - r.closeMargin),
    },
    total: {
      maeModel: mae(t, (r) => r.total - r.modelTotal),
      maeClose: mae(t, (r) => r.total - r.closeTotal),
      maeModelVsClose: mae(t, (r) => r.modelTotal - r.closeTotal),
      sdResidualClose: rmse(t, (r) => r.total - r.closeTotal),
      biasModel: mean(t.map((r) => r.modelTotal - r.closeTotal)),
      ...slope(t, (r) => r.modelTotal - r.closeTotal, (r) => r.total - r.closeTotal),
    },
  };
}
