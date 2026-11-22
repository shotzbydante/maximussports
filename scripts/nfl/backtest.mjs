#!/usr/bin/env node
/**
 * NFL picks engine backtest.
 *
 *   node scripts/nfl/backtest.mjs --data ./tmp/nflverse --download
 *   node scripts/nfl/backtest.mjs --data ./tmp/nflverse --from 2011 --to 2025
 *   node scripts/nfl/backtest.mjs --data ./tmp/nflverse --situations
 *
 * Replays every game in the range, rating each week only on games already
 * played, and asks one question: when the ratings disagree with the
 * closing line, who is right? The answer sets `modelWeight` in the engine.
 *
 * --situations measures the schedule, travel, coaching and weather spots in
 * src/features/nfl/picks/v2/situations.js against closing lines.
 *
 * Data: nflverse (CC BY 4.0). --download fetches what is missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadData, replay, marketTest, mean, slope } from './backtest-lib.mjs';
import { parseCsv, csvNum } from '../../src/features/nfl/data/csv.js';
import { NFLVERSE_BASE } from '../../src/features/nfl/data/nflverse.js';
import { RATING_PARAMS } from '../../src/features/nfl/picks/v2/ratings.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dir = path.resolve(opt('data', './tmp/nflverse'));
const from = Number(opt('from', 2011));
const to = Number(opt('to', 2025));
const lookback = 3;
const f = (x, d = 3) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : String(x));

async function download() {
  fs.mkdirSync(dir, { recursive: true });
  const files = [['schedules/games.csv', 'games.csv']];
  for (let y = from - lookback; y <= to; y++) {
    files.push([`stats_team/stats_team_week_${y}.csv`, `stats_team_week_${y}.csv`]);
    files.push([`stats_player/stats_player_week_${y}.csv`, `stats_player_week_${y}.csv`]);
  }
  for (const [remote, local] of files) {
    const target = path.join(dir, local);
    if (fs.existsSync(target) && local !== 'games.csv') continue;
    const r = await fetch(`${NFLVERSE_BASE}/${remote}`);
    if (!r.ok) { console.error(`  ${remote}: HTTP ${r.status}`); continue; }
    fs.writeFileSync(target, await r.text());
    console.log(`  fetched ${local}`);
  }
}

function ats(rows, sideOf, coverOf) {
  let w = 0, l = 0;
  for (const r of rows) { const c = sideOf(r) * coverOf(r); if (c > 0) w += 1; else if (c < 0) l += 1; }
  return `${w}-${l} (${w + l ? ((100 * w) / (w + l)).toFixed(1) : '—'}%)`;
}

function report() {
  const data = loadData(dir, { fromSeason: from - lookback, toSeason: to });
  const v2 = replay(data, { fromSeason: from, toSeason: to });
  const noQb = replay(data, { fromSeason: from, toSeason: to, useQb: false });
  const v1 = replay(data, { fromSeason: from, toSeason: to, useQb: false, useEnv: false,
    params: { rating: { epaWeight: 0, lookbackSeasons: 0, tauWeeks: 1e6, ridge: 4, hfa: 1.7 } } });

  console.log(`\nNFL engine backtest, ${from} to ${to}. Closing lines from nflverse.\n`);
  console.log('Model                          games   side MAE  (close)   weight ± se     total MAE  (close)   weight ± se');
  for (const [label, rows] of [['v2 ratings + quarterbacks', v2], ['v2 without quarterbacks', noQb], ['v1-style (points, this season)', v1]]) {
    const m = marketTest(rows);
    console.log(`${label.padEnd(30)} ${String(m.n).padStart(5)}   ${f(m.side.maeModel, 2).padStart(7)}  (${f(m.side.maeClose, 2)})   ${f(m.side.gamma, 3).padStart(6)} ± ${f(m.side.se, 3)}   ${f(m.total.maeModel, 2).padStart(8)}  (${f(m.total.maeClose, 2)})   ${f(m.total.gamma, 3).padStart(6)} ± ${f(m.total.se, 3)}`);
  }
  console.log('\n"weight" is the slope of (result - close) on (model - close): the share of the model\'s');
  console.log('disagreement with the closing line that shows up in results. Zero means the line was right.');

  console.log('\nWhen the v2 model disagrees with the close, which side covers?');
  for (const [lo, hi] of [[0, 1.5], [1.5, 3], [3, 5], [5, 99]]) {
    const s = v2.filter((r) => r.closeMargin != null && Math.abs(r.modelMargin - r.closeMargin) >= lo && Math.abs(r.modelMargin - r.closeMargin) < hi);
    const t = v2.filter((r) => r.closeTotal != null && Math.abs(r.modelTotal - r.closeTotal) >= lo && Math.abs(r.modelTotal - r.closeTotal) < hi);
    console.log(`  gap ${String(lo).padStart(3)} to ${String(hi === 99 ? '+' : hi).padEnd(3)} pts   spread: n=${String(s.length).padStart(4)} model side ${ats(s, (r) => Math.sign(r.modelMargin - r.closeMargin), (r) => r.margin - r.closeMargin).padEnd(18)} total: n=${String(t.length).padStart(4)} model side ${ats(t, (r) => Math.sign(r.modelTotal - r.closeTotal), (r) => r.total - r.closeTotal)}`);
  }

  const out = v2.filter((r) => ['outdoors', 'open'].includes(r.roof) && r.wind != null && r.closeTotal != null);
  console.log('\nWind and totals, outdoor games (result minus closing total):');
  for (const [lo, hi] of [[0, 10], [10, 15], [15, 99]]) {
    const s = out.filter((r) => r.wind >= lo && r.wind < hi);
    console.log(`  wind ${String(lo).padStart(2)} to ${hi === 99 ? '+ ' : hi} mph: n=${String(s.length).padStart(4)}  mean ${f(mean(s.map((r) => r.total - r.closeTotal)), 2).padStart(6)}  unders ${ats(s, () => -1, (r) => r.total - r.closeTotal)}`);
  }
  const m = marketTest(v2);
  console.log(`\nResidual spread around the close: margin sd ${f(m.side.sdResidualClose, 2)}, total sd ${f(m.total.sdResidualClose, 2)}.`);
  console.log(`Rating parameters: ${JSON.stringify(RATING_PARAMS)}\n`);
}

const TZ = {};
for (const t of 'BUF MIA NE NYJ NYG PHI WAS BAL PIT CLE CIN IND JAX ATL CAR TB DET'.split(' ')) TZ[t] = 0;
for (const t of 'CHI GB MIN DAL HOU TEN NO KC STL'.split(' ')) TZ[t] = 1;
for (const t of 'DEN ARI'.split(' ')) TZ[t] = 2;
for (const t of 'SEA SF LA LAC LV OAK SD'.split(' ')) TZ[t] = 3;

function situations() {
  const rows = parseCsv(fs.readFileSync(path.join(dir, 'games.csv'), 'utf8'), {
    filter: (r) => Number(r.season) >= 2003 && Number(r.season) <= to && csvNum(r.result) != null && csvNum(r.spread_line) != null,
  }).map((r) => {
    const [hh, mm] = (r.gametime || '13:00').split(':').map(Number);
    const close = csvNum(r.spread_line);
    return {
      s: Number(r.season), w: Number(r.week), home: r.home_team, away: r.away_team, close,
      cover: csvNum(r.result) - close, et: hh + mm / 60, div: r.div_game === '1', neutral: r.location === 'Neutral',
      hrest: csvNum(r.home_rest), arest: csvNum(r.away_rest), hc: r.home_coach, ac: r.away_coach, weekday: r.weekday,
      total: csvNum(r.total), totalLine: csvNum(r.total_line), roof: r.roof, wind: csvNum(r.wind), res: csvNum(r.result),
    };
  });
  const site = rows.filter((r) => !r.neutral);
  const line = (label, list) => {
    for (const [a, b] of [[2003, to], [2018, to]]) {
      const v = list.filter((x) => x[0] >= a && x[0] <= b).map((x) => x[1]);
      const w = v.filter((y) => y > 0).length, l = v.filter((y) => y < 0).length;
      console.log(`  ${label.padEnd(52)} ${a}-${b}  ${String(w).padStart(4)}-${String(l).padEnd(4)} ${w + l ? ((100 * w) / (w + l)).toFixed(1) : '—'}%  mean ${f(mean(v), 2)}`);
    }
  };
  console.log(`\nSituations against the closing line, 2003 to ${to} (${rows.length} games).\n`);
  line('West-coast road team, kickoff by 1:05 PM ET', site.filter((x) => TZ[x.away] === 3 && x.et <= 13.1 && TZ[x.home] <= 1).map((x) => [x.s, -x.cover]));
  line('Division road underdog', site.filter((x) => x.div && x.close > 0).map((x) => [x.s, -x.cover]));
  line('Off a bye against normal rest', site.filter((x) => x.hrest && x.arest && (x.hrest >= 13) !== (x.arest >= 13) && Math.min(x.hrest, x.arest) >= 6).map((x) => [x.s, x.hrest >= 13 ? x.cover : -x.cover]));
  line('Thursday road team', site.filter((x) => x.weekday === 'Thursday' && x.w > 1).map((x) => [x.s, -x.cover]));

  const byTeam = new Map();
  for (const x of rows) for (const t of [x.home, x.away]) { const k = `${x.s}|${t}`; if (!byTeam.has(k)) byTeam.set(k, []); byTeam.get(k).push(x); }
  const look = [], letdown = [];
  for (const [k, list] of byTeam) {
    const t = k.split('|')[1];
    list.sort((a, b) => a.w - b.w);
    list.forEach((x, i) => {
      const home = x.home === t, fav = home ? x.close : -x.close, cv = home ? x.cover : -x.cover;
      const next = list[i + 1], prev = list[i - 1];
      if (fav >= 6 && next && next.div && !x.div) look.push([x.s, cv]);
      if (prev) {
        const ph = prev.home === t, margin = ph ? prev.res : -prev.res, pf = ph ? prev.close : -prev.close;
        if (fav >= 3 && margin > 0 && pf <= -3) letdown.push([x.s, cv]);
      }
    });
  }
  line('Favourite of 6+ with a division game next', look);
  line('Favourite of 3+ after an upset win as a 3+ dog', letdown);

  const career = new Map();
  const rookie = [], edge = [];
  for (const x of [...rows].sort((a, b) => a.s - b.s || a.w - b.w)) {
    const h = career.get(x.hc) || { sum: 0, n: 0 }, a = career.get(x.ac) || { sum: 0, n: 0 };
    if (!x.neutral) {
      if (h.n < 17 && a.n >= 48) rookie.push([x.s, x.cover]);
      if (a.n < 17 && h.n >= 48) rookie.push([x.s, -x.cover]);
      if (h.n >= 32 && a.n >= 32) edge.push({ s: x.s, d: h.sum / (h.n + 40) - a.sum / (a.n + 40), c: x.cover });
    }
    career.set(x.hc, { sum: h.sum + x.cover, n: h.n + 1 });
    career.set(x.ac, { sum: a.sum - x.cover, n: a.n + 1 });
  }
  line('First-year head coach against a 48-game veteran', rookie);
  for (const [a, b] of [[2003, to], [2018, to]]) {
    const v = edge.filter((x) => x.s >= a && x.s <= b);
    const g = slope(v, (x) => x.d, (x) => x.c);
    console.log(`  ${'Coach career cover margin → cover margin (slope)'.padEnd(52)} ${a}-${b}  ${f(g.gamma, 2)} ± ${f(g.se, 2)}  n=${g.n}`);
  }
  const tot = rows.filter((x) => x.totalLine != null && x.total != null && ['outdoors', 'open'].includes(x.roof) && x.wind != null);
  line('Under, sustained wind 15 mph or more', tot.filter((x) => x.wind >= 15).map((x) => [x.s, x.totalLine - x.total]));
  line('Under, wind below 10 mph', tot.filter((x) => x.wind < 10).map((x) => [x.s, x.totalLine - x.total]));
  line('Under, sustained wind 10 to 15 mph', tot.filter((x) => x.wind >= 10 && x.wind < 15).map((x) => [x.s, x.totalLine - x.total]));
  // The wind ramp: points to the under per mph above 10, levelling off at 20,
  // with nothing below 10. Fitted through zero on games with wind of 10+.
  {
    const windy = tot.filter((x) => x.wind >= 10);
    const xs = windy.map((x) => Math.min(x.wind, 20) - 10), ys = windy.map((x) => x.totalLine - x.total);
    const sxx = xs.reduce((a, x) => a + x * x, 0);
    const b = xs.reduce((a, x, i) => a + x * ys[i], 0) / sxx;
    const rss = ys.reduce((a, y, i) => a + (y - b * xs[i]) ** 2, 0);
    const se = Math.sqrt(rss / (xs.length - 1) / sxx);
    console.log(`  ${'Wind ramp: points to the under per mph above 10 (cap 20)'.padEnd(52)} 2003-${to}  ${f(b, 3)} ± ${f(se, 3)}  n=${xs.length}`);
  }
  console.log('');
}

if (flag('download')) await download();
if (!fs.existsSync(path.join(dir, 'games.csv'))) {
  console.error(`No data in ${dir}. Run with --download.`);
  process.exit(1);
}
if (flag('situations')) situations(); else report();
