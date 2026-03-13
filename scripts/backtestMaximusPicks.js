#!/usr/bin/env node
/**
 * backtestMaximusPicks.js — before/after evaluation of picks logic changes.
 *
 * Uses ESPN scoreboard + per-event summary (pickcenter) to get real historical
 * spreads, totals, and moneylines. Runs both OLD and NEW pick-selection logic,
 * grades against actual outcomes, and produces a comparison report.
 *
 * Usage:  node scripts/backtestMaximusPicks.js [--days=14]
 */

import { getTeamSlug } from '../src/utils/teamSlug.js';

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; })
);
const DAYS_BACK = parseInt(args.days ?? '14', 10);
const CONCURRENCY = 6;

// ─── Shared constants ───────────────────────────────────────────────────────
const PE_W_ATS = 0.10, PE_W_MARKET = 0.25, PE_HOME_BUMP = 0.03;
const PE_MIN_EDGE = 0.04, PE_HIGH_EDGE = 0.12, PE_MED_EDGE = 0.07;
const TOT_OU_HIGH_EDGE = 0.14, TOT_OU_MED_EDGE = 0.10;
const PICKS_PER_SECTION = 5;

// ─── Version configs ────────────────────────────────────────────────────────
const OLD_CFG = {
  label: 'OLD',
  ATS_EDGE_MIN: 0.08, ATS_EDGE_MED: 0.11, ATS_EDGE_HIGH: 0.16,
  ATS_SPREAD_SOFT_CAP: Infinity, ATS_SPREAD_PENALTY_RATE: 0,
  ATS_BIG_FAV_SPREAD: 12, ATS_BIG_FAV_ANY_FAV: false,
  PE_CHALK_ML: -Infinity, PE_CHALK_FLOOR: 1.0,
  TOT_OU_MIN_EDGE: 0.06,
};
const NEW_CFG = {
  label: 'NEW',
  ATS_EDGE_MIN: 0.10, ATS_EDGE_MED: 0.12, ATS_EDGE_HIGH: 0.16,
  ATS_SPREAD_SOFT_CAP: 10, ATS_SPREAD_PENALTY_RATE: 0.03,
  ATS_BIG_FAV_SPREAD: 10, ATS_BIG_FAV_ANY_FAV: true,
  PE_CHALK_ML: -1000, PE_CHALK_FLOOR: 0.40,
  TOT_OU_MIN_EDGE: 0.07,
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mlToImplied = ml => ml > 0 ? 100 / (ml + 100) : Math.abs(ml) / (Math.abs(ml) + 100);
const spreadToWinProb = sp => clamp(0.5 - sp * 0.03, 0.15, 0.85);
const fmtPct = n => (n * 100).toFixed(1) + '%';
const fmtInt = n => String(Math.round(n));
const pad = (s, w) => String(s).padEnd(w);
const padR = (s, w) => String(s).padStart(w);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function dateRange(daysBack) {
  const dates = [];
  const now = new Date('2026-03-12T12:00:00Z');
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

// ─── ESPN fetching ──────────────────────────────────────────────────────────
const ESPN_BOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchScoreboard(dateStr) {
  const data = await fetchJson(`${ESPN_BOARD}?dates=${dateStr}`);
  const events = data?.events ?? [];
  return events.map(ev => {
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    const isFinal = comp?.status?.type?.name === 'STATUS_FINAL';
    return {
      eventId: ev.id,
      date: dateStr,
      homeTeam: home?.team?.displayName ?? 'TBD',
      awayTeam: away?.team?.displayName ?? 'TBD',
      homeScore: parseInt(home?.score, 10),
      awayScore: parseInt(away?.score, 10),
      isFinal,
    };
  }).filter(g => g.isFinal && !isNaN(g.homeScore) && !isNaN(g.awayScore));
}

async function fetchEventOdds(eventId) {
  try {
    const data = await fetchJson(`${ESPN_SUMMARY}?event=${eventId}`);
    const pc = data?.pickcenter?.[0];
    if (!pc) return null;
    return {
      homeSpread: pc.spread != null ? parseFloat(pc.spread) : null,
      total: pc.overUnder != null ? parseFloat(pc.overUnder) : null,
      homeML: pc.homeTeamOdds?.moneyLine != null ? parseFloat(pc.homeTeamOdds.moneyLine) : null,
      awayML: pc.awayTeamOdds?.moneyLine != null ? parseFloat(pc.awayTeamOdds.moneyLine) : null,
    };
  } catch { return null; }
}

async function batchFetchOdds(events) {
  const results = new Map();
  const queue = [...events];
  let done = 0;
  const total = queue.length;

  async function worker() {
    while (queue.length > 0) {
      const ev = queue.shift();
      const odds = await fetchEventOdds(ev.eventId);
      results.set(ev.eventId, odds);
      done++;
      if (done % 20 === 0) process.stdout.write(`    ${done}/${total} events fetched\n`);
      await sleep(150);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Build game objects with odds ───────────────────────────────────────────
function buildGames(scoreboards, oddsMap) {
  const games = [];
  for (const sb of scoreboards) {
    const odds = oddsMap.get(sb.eventId);
    const homeSpread = odds?.homeSpread ?? null;
    const total = odds?.total ?? null;
    const homeML = odds?.homeML ?? null;
    const awayML = odds?.awayML ?? null;

    const moneyline = (homeML != null && awayML != null)
      ? `${homeML > 0 ? '+' : ''}${homeML}/${awayML > 0 ? '+' : ''}${awayML}`
      : null;

    games.push({
      ...sb,
      homeSpread,
      awaySpread: homeSpread != null ? -homeSpread : null,
      spread: homeSpread != null ? (homeSpread > 0 ? `+${homeSpread}` : String(homeSpread)) : null,
      total: total != null ? String(total) : null,
      moneyline,
      homeML, awayML,
    });
  }
  return games;
}

// ─── Rolling ATS records ────────────────────────────────────────────────────
function buildAtsRecords(pastGames) {
  const records = {};
  for (const g of pastGames) {
    if (g.homeSpread == null) continue;
    const homeSlug = getTeamSlug(g.homeTeam);
    const awaySlug = getTeamSlug(g.awayTeam);

    const homeAdj = g.homeScore + g.homeSpread;
    const homeResult = Math.abs(homeAdj - g.awayScore) < 0.001 ? 'P' : homeAdj > g.awayScore ? 'W' : 'L';
    const awayResult = homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'P';

    for (const [slug, result] of [[homeSlug, homeResult], [awaySlug, awayResult]]) {
      if (!slug) continue;
      if (!records[slug]) records[slug] = { w: 0, l: 0, p: 0 };
      if (result === 'W') records[slug].w++;
      else if (result === 'L') records[slug].l++;
      else records[slug].p++;
    }
  }

  const result = {};
  for (const [slug, rec] of Object.entries(records)) {
    const decided = rec.w + rec.l;
    result[slug] = { ...rec, total: rec.w + rec.l + rec.p, coverPct: decided > 0 ? (rec.w / decided) * 100 : null, window: 'last30' };
  }
  return result;
}

// ─── Pick'Em simulation ─────────────────────────────────────────────────────
function simulatePickEm(games, atsMap, cfg) {
  const picks = [];
  for (const g of games) {
    if (g.moneyline == null && g.homeSpread == null) continue;

    const homeSlug = getTeamSlug(g.homeTeam);
    const awaySlug = getTeamSlug(g.awayTeam);
    const homeAts = atsMap[homeSlug] ?? null;
    const awayAts = atsMap[awaySlug] ?? null;
    const hAts = homeAts ? clamp(homeAts.coverPct / 100, 0.3, 0.7) : 0.5;
    const aAts = awayAts ? clamp(awayAts.coverPct / 100, 0.3, 0.7) : 0.5;

    let mktProb = null;
    if (g.homeML != null && g.awayML != null) {
      const hImp = mlToImplied(g.homeML);
      const aImp = mlToImplied(g.awayML);
      mktProb = clamp(hImp / (hImp + aImp), 0.1, 0.9);
    } else if (g.homeSpread != null) {
      mktProb = spreadToWinProb(g.homeSpread);
    }
    if (mktProb == null) continue;

    const hMkt = mktProb, aMkt = 1 - mktProb;
    const homeScore = 0.50 * 0.50 + hAts * PE_W_ATS + hMkt * PE_W_MARKET + PE_HOME_BUMP;
    const awayScore = 0.50 * 0.50 + aAts * PE_W_ATS + aMkt * PE_W_MARKET;

    const edge = homeScore - awayScore;
    if (Math.abs(edge) < PE_MIN_EDGE) continue;

    const pickHome = edge > 0;
    const pickTeam = pickHome ? g.homeTeam : g.awayTeam;
    const edgeMag = Math.abs(edge);
    const pickML = pickHome ? g.homeML : g.awayML;

    let confidence = 0;
    if (edgeMag >= PE_HIGH_EDGE) confidence = 2;
    else if (edgeMag >= PE_MED_EDGE) confidence = 1;

    let _sortEdge = edgeMag;
    if (pickML != null && pickML < cfg.PE_CHALK_ML) {
      const factor = Math.max(cfg.PE_CHALK_FLOOR, 1 - (Math.abs(pickML) - Math.abs(cfg.PE_CHALK_ML)) / 3000);
      _sortEdge = edgeMag * factor;
    }

    const won = pickHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    picks.push({
      pickTeam, pickHome, edgeMag, _sortEdge, confidence, pickML,
      game: g, won,
      isChalk: pickML != null && pickML <= -500,
      isHeavyChalk: pickML != null && pickML <= -1000,
      isSuperChalk: pickML != null && pickML <= -2000,
    });
  }

  picks.sort((a, b) => b._sortEdge - a._sortEdge);
  return picks.slice(0, PICKS_PER_SECTION);
}

// ─── ATS simulation ─────────────────────────────────────────────────────────
function simulateAts(games, atsMap, cfg) {
  const picks = [];
  const diagnostics = [];

  for (const g of games) {
    if (g.homeSpread == null) continue;
    const spreadMag = Math.abs(g.homeSpread);
    const homeSlug = getTeamSlug(g.homeTeam);
    const awaySlug = getTeamSlug(g.awayTeam);
    const homeAts = atsMap[homeSlug] ?? null;
    const awayAts = atsMap[awaySlug] ?? null;

    if (!homeAts || !awayAts || homeAts.coverPct == null || awayAts.coverPct == null) continue;

    const homePct = homeAts.coverPct / 100;
    const awayPct = awayAts.coverPct / 100;
    const rawEdge = Math.abs(homePct - awayPct);

    let spreadDiscount = 1.0;
    if (spreadMag > cfg.ATS_SPREAD_SOFT_CAP) {
      const excess = spreadMag - cfg.ATS_SPREAD_SOFT_CAP;
      spreadDiscount = Math.max(0.50, 1 - excess * cfg.ATS_SPREAD_PENALTY_RATE);
    }
    const adjustedEdge = rawEdge * spreadDiscount;

    const pickHome = (homePct - awayPct) > 0;
    const pickTeam = pickHome ? g.homeTeam : g.awayTeam;
    const teamSpread = pickHome ? g.homeSpread : -g.homeSpread;
    const homeIsFav = g.homeSpread < 0;
    const favTeam = homeIsFav ? g.homeTeam : g.awayTeam;
    const pickingFav = pickTeam === favTeam;

    const diagEntry = {
      matchup: `${g.awayTeam} @ ${g.homeTeam}`, spread: g.homeSpread, spreadMag,
      rawEdge: rawEdge.toFixed(3), spreadDiscount: spreadDiscount.toFixed(3),
      adjustedEdge: adjustedEdge.toFixed(3), pickTeam, pickingFav,
    };

    if (adjustedEdge < cfg.ATS_EDGE_MIN) {
      diagEntry.filtered = 'below_min_edge';
      diagnostics.push(diagEntry);
      continue;
    }

    const isBigFav = spreadMag >= cfg.ATS_BIG_FAV_SPREAD;
    if (isBigFav) {
      const filterApplies = cfg.ATS_BIG_FAV_ANY_FAV ? pickingFav : (pickingFav && pickHome && homeIsFav);
      if (filterApplies && adjustedEdge < cfg.ATS_EDGE_HIGH) {
        diagEntry.filtered = 'big_fav_filter';
        diagnostics.push(diagEntry);
        continue;
      }
    }

    const margin = pickHome
      ? (g.homeScore + g.homeSpread) - g.awayScore
      : (g.awayScore + (-g.homeSpread)) - g.homeScore;
    const covered = Math.abs(margin) < 0.001 ? null : margin > 0;

    let confidence = 0;
    if (adjustedEdge >= cfg.ATS_EDGE_HIGH) confidence = 2;
    else if (adjustedEdge >= cfg.ATS_EDGE_MED) confidence = 1;

    picks.push({
      pickTeam, pickHome, teamSpread, spreadMag, rawEdge, spreadDiscount,
      adjustedEdge, confidence, game: g, covered, pickingFav,
      spreadBand: spreadMag < 5 ? '0-4.5' : spreadMag < 10 ? '5-9.5' : '10+',
    });
  }

  picks.sort((a, b) => b.adjustedEdge - a.adjustedEdge);
  return { picks: picks.slice(0, PICKS_PER_SECTION), diagnostics };
}

// ─── Totals simulation ──────────────────────────────────────────────────────
function simulateTotals(games, atsMap, cfg) {
  const picks = [];
  for (const g of games) {
    if (g.total == null) continue;
    const marketTotal = parseFloat(g.total);
    if (isNaN(marketTotal)) continue;

    const homeSlug = getTeamSlug(g.homeTeam);
    const awaySlug = getTeamSlug(g.awayTeam);
    const homeAts = atsMap[homeSlug] ?? null;
    const awayAts = atsMap[awaySlug] ?? null;
    const homeCover = homeAts ? (homeAts.coverPct - 50) / 100 : 0;
    const awayCover = awayAts ? (awayAts.coverPct - 50) / 100 : 0;
    const combinedTrend = (homeCover + awayCover) / 2;
    const trendMag = Math.abs(combinedTrend);

    if (trendMag < cfg.TOT_OU_MIN_EDGE) continue;

    const isOver = combinedTrend > 0;
    const actualTotal = g.homeScore + g.awayScore;
    const push = Math.abs(actualTotal - marketTotal) < 0.001;
    const hit = push ? null : (isOver ? actualTotal > marketTotal : actualTotal < marketTotal);

    let confidence = 0;
    if (trendMag >= TOT_OU_HIGH_EDGE) confidence = 2;
    else if (trendMag >= TOT_OU_MED_EDGE) confidence = 1;

    picks.push({
      matchup: `${g.awayTeam} @ ${g.homeTeam}`, direction: isOver ? 'OVER' : 'UNDER',
      marketTotal, actualTotal, trendMag, confidence, game: g, hit,
    });
  }
  picks.sort((a, b) => b.trendMag - a.trendMag);
  return picks.slice(0, PICKS_PER_SECTION);
}

// ─── Aggregation ────────────────────────────────────────────────────────────
function aggPickEm(allPicks) {
  const total = allPicks.length;
  const wins = allPicks.filter(p => p.won).length;
  // Top-3 per day: every PICKS_PER_SECTION picks, take first 3
  const top3 = allPicks.filter((_, i) => i % PICKS_PER_SECTION < 3);
  const top3Wins = top3.filter(p => p.won).length;
  const mlValues = allPicks.filter(p => p.pickML != null).map(p => p.pickML);
  const avgML = mlValues.length > 0 ? mlValues.reduce((a, b) => a + b, 0) / mlValues.length : null;
  const chalk500 = allPicks.filter(p => p.isChalk).length;
  const chalk1000 = allPicks.filter(p => p.isHeavyChalk).length;
  const chalk2000 = allPicks.filter(p => p.isSuperChalk).length;
  const confDist = { HIGH: 0, MED: 0, LOW: 0 };
  for (const p of allPicks) {
    if (p.confidence >= 2) confDist.HIGH++; else if (p.confidence >= 1) confDist.MED++; else confDist.LOW++;
  }
  return {
    total, wins, hitRate: total > 0 ? wins / total : 0,
    top3Total: top3.length, top3Wins, top3HitRate: top3.length > 0 ? top3Wins / top3.length : 0,
    avgML, chalk500, chalk1000, chalk2000,
    chalk500Pct: total > 0 ? chalk500 / total : 0,
    chalk1000Pct: total > 0 ? chalk1000 / total : 0,
    chalk2000Pct: total > 0 ? chalk2000 / total : 0,
    confDist,
  };
}

function aggAts(allResults) {
  const picks = allResults.flatMap(r => r.picks);
  const diag = allResults.flatMap(r => r.diagnostics);
  const decided = picks.filter(p => p.covered != null);
  const wins = decided.filter(p => p.covered).length;

  const byBand = {};
  for (const band of ['0-4.5', '5-9.5', '10+']) {
    const bp = decided.filter(p => p.spreadBand === band);
    byBand[band] = { total: bp.length, wins: bp.filter(p => p.covered).length, hitRate: bp.length > 0 ? bp.filter(p => p.covered).length / bp.length : 0 };
  }

  const confDist = { HIGH: 0, MED: 0, LOW: 0 };
  for (const p of picks) {
    if (p.confidence >= 2) confDist.HIGH++; else if (p.confidence >= 1) confDist.MED++; else confDist.LOW++;
  }

  return {
    totalPicks: picks.length, decided: decided.length, wins,
    hitRate: decided.length > 0 ? wins / decided.length : 0,
    byBand, confDist,
    filtered: {
      below_min_edge: diag.filter(d => d.filtered === 'below_min_edge').length,
      big_fav_filter: diag.filter(d => d.filtered === 'big_fav_filter').length,
    },
    avgSpreadMag: picks.length > 0 ? picks.reduce((s, p) => s + p.spreadMag, 0) / picks.length : 0,
    avgEdge: picks.length > 0 ? picks.reduce((s, p) => s + p.adjustedEdge, 0) / picks.length : 0,
  };
}

function aggTotals(allPicks) {
  const decided = allPicks.filter(p => p.hit != null);
  const wins = decided.filter(p => p.hit).length;
  const confDist = { HIGH: 0, MED: 0, LOW: 0 };
  for (const p of allPicks) {
    if (p.confidence >= 2) confDist.HIGH++; else if (p.confidence >= 1) confDist.MED++; else confDist.LOW++;
  }
  return {
    totalPicks: allPicks.length, decided: decided.length, wins,
    hitRate: decided.length > 0 ? wins / decided.length : 0, confDist,
    avgEdge: allPicks.length > 0 ? allPicks.reduce((s, p) => s + p.trendMag, 0) / allPicks.length : 0,
  };
}

// ─── Report ─────────────────────────────────────────────────────────────────
function printLine(w = 72) { console.log('─'.repeat(w)); }
function printHeader(title) { console.log(); printLine(); console.log(`  ${title}`); printLine(); }

function printComp(label, oldV, newV, fmt = fmtPct, better = 'higher') {
  const ov = fmt(oldV), nv = fmt(newV);
  const dir = better === 'higher' ? (newV > oldV ? '▲' : newV < oldV ? '▼' : '═')
    : (newV < oldV ? '▲' : newV > oldV ? '▼' : '═');
  console.log(`  ${pad(label, 34)} ${padR(ov, 10)} → ${padR(nv, 10)}  ${dir}`);
}

function printReport(oldPE, newPE, oldATS, newATS, oldTOT, newTOT, meta) {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║            MAXIMUS PICKS — BACKTEST COMPARISON REPORT                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Window:             ${meta.startDate} to ${meta.endDate} (${meta.daysWithGames} days with games)`);
  console.log(`  Total games:        ${meta.totalGames}`);
  console.log(`  Games with spreads: ${meta.gamesWithSpreads} (${(meta.gamesWithSpreads / meta.totalGames * 100).toFixed(0)}%)`);
  console.log(`  Games with ML:      ${meta.gamesWithML}`);
  console.log(`  Games with totals:  ${meta.gamesWithTotals}`);

  printHeader("PICK'EM — Before/After");
  console.log(`  ${pad('', 34)} ${padR('OLD', 10)}   ${padR('NEW', 10)}`);
  printLine();
  printComp('Total qualified picks', oldPE.total, newPE.total, fmtInt);
  printComp('Overall hit rate', oldPE.hitRate, newPE.hitRate);
  printComp('Top-3 hit rate', oldPE.top3HitRate, newPE.top3HitRate);
  printComp('Avg moneyline (surfaced)', oldPE.avgML ?? 0, newPE.avgML ?? 0, n => fmtInt(n), 'higher');
  printComp('% with ML ≤ -500', oldPE.chalk500Pct, newPE.chalk500Pct, fmtPct, 'lower');
  printComp('% with ML ≤ -1000', oldPE.chalk1000Pct, newPE.chalk1000Pct, fmtPct, 'lower');
  printComp('% with ML ≤ -2000', oldPE.chalk2000Pct, newPE.chalk2000Pct, fmtPct, 'lower');
  console.log(`\n  Confidence: OLD H=${oldPE.confDist.HIGH} M=${oldPE.confDist.MED} L=${oldPE.confDist.LOW}  |  NEW H=${newPE.confDist.HIGH} M=${newPE.confDist.MED} L=${newPE.confDist.LOW}`);

  printHeader('ATS — Before/After');
  console.log(`  ${pad('', 34)} ${padR('OLD', 10)}   ${padR('NEW', 10)}`);
  printLine();
  printComp('Total picks surfaced', oldATS.totalPicks, newATS.totalPicks, fmtInt);
  printComp('Decided (non-push)', oldATS.decided, newATS.decided, fmtInt);
  printComp('Overall ATS hit rate', oldATS.hitRate, newATS.hitRate);
  printComp('Avg spread magnitude', oldATS.avgSpreadMag, newATS.avgSpreadMag, n => n.toFixed(1), 'lower');
  printComp('Avg adjusted edge', oldATS.avgEdge, newATS.avgEdge, fmtPct);
  console.log(`\n  Hit rate by spread band:`);
  for (const band of ['0-4.5', '5-9.5', '10+']) {
    const ob = oldATS.byBand[band], nb = newATS.byBand[band];
    console.log(`    ${pad(band, 8)}  OLD: ${ob.wins}/${ob.total} (${fmtPct(ob.hitRate)})   NEW: ${nb.wins}/${nb.total} (${fmtPct(nb.hitRate)})`);
  }
  console.log(`\n  Filtering impact (total games considered):`);
  console.log(`    Below min edge:   OLD=${oldATS.filtered.below_min_edge}  NEW=${newATS.filtered.below_min_edge}`);
  console.log(`    Big-fav filter:   OLD=${oldATS.filtered.big_fav_filter}  NEW=${newATS.filtered.big_fav_filter}`);
  console.log(`\n  Confidence: OLD H=${oldATS.confDist.HIGH} M=${oldATS.confDist.MED} L=${oldATS.confDist.LOW}  |  NEW H=${newATS.confDist.HIGH} M=${newATS.confDist.MED} L=${newATS.confDist.LOW}`);

  printHeader('TOTALS — Before/After');
  console.log(`  ${pad('', 34)} ${padR('OLD', 10)}   ${padR('NEW', 10)}`);
  printLine();
  printComp('Total picks surfaced', oldTOT.totalPicks, newTOT.totalPicks, fmtInt);
  printComp('Decided (non-push)', oldTOT.decided, newTOT.decided, fmtInt);
  printComp('Overall hit rate', oldTOT.hitRate, newTOT.hitRate);
  printComp('Avg edge', oldTOT.avgEdge, newTOT.avgEdge, fmtPct);
  console.log(`\n  Confidence: OLD H=${oldTOT.confDist.HIGH} M=${oldTOT.confDist.MED} L=${oldTOT.confDist.LOW}  |  NEW H=${newTOT.confDist.HIGH} M=${newTOT.confDist.MED} L=${newTOT.confDist.LOW}`);

  printHeader('PRODUCT QUALITY');
  const oldVol = oldPE.total + oldATS.totalPicks + oldTOT.totalPicks;
  const newVol = newPE.total + newATS.totalPicks + newTOT.totalPicks;
  const pctChg = oldVol > 0 ? ((newVol - oldVol) / oldVol * 100).toFixed(1) : '0.0';
  console.log(`  Total volume:     OLD=${oldVol}  NEW=${newVol}  (${pctChg}%)`);
  const d = meta.daysWithGames || 1;
  console.log(`  Per day avg:      OLD=${(oldVol / d).toFixed(1)}  NEW=${(newVol / d).toFixed(1)}`);
  console.log(`    Pick'Em/day:    OLD=${(oldPE.total / d).toFixed(1)}  NEW=${(newPE.total / d).toFixed(1)}`);
  console.log(`    ATS/day:        OLD=${(oldATS.totalPicks / d).toFixed(1)}  NEW=${(newATS.totalPicks / d).toFixed(1)}`);
  console.log(`    Totals/day:     OLD=${(oldTOT.totalPicks / d).toFixed(1)}  NEW=${(newTOT.totalPicks / d).toFixed(1)}`);
  if (newATS.totalPicks / d < 1) console.log(`  ⚠ ATS volume low (avg < 1/day)`);
  if (newTOT.totalPicks / d < 1) console.log(`  ⚠ Totals volume low (avg < 1/day)`);
  if (newPE.total / d >= 2) console.log(`  ✓ Pick'Em volume healthy`);
  printLine();
  console.log();
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const dates = dateRange(DAYS_BACK);
  console.log(`\n  Fetching ESPN scoreboards for ${dates.length} days...\n`);

  const allScoreboards = [];
  for (const d of dates) {
    try {
      const games = await fetchScoreboard(d);
      allScoreboards.push(...games);
      process.stdout.write(`    ${d}: ${games.length} final games\n`);
    } catch (err) {
      console.error(`    ${d}: ERROR ${err.message}`);
    }
    await sleep(300);
  }

  console.log(`\n  Total: ${allScoreboards.length} final games. Fetching odds (${CONCURRENCY} concurrent)...\n`);

  const oddsMap = await batchFetchOdds(allScoreboards);
  const allGames = buildGames(allScoreboards, oddsMap);

  const withSpreads = allGames.filter(g => g.homeSpread != null).length;
  const withML = allGames.filter(g => g.homeML != null).length;
  const withTotals = allGames.filter(g => g.total != null).length;
  console.log(`\n  Odds coverage: ${withSpreads} spreads, ${withML} ML, ${withTotals} totals out of ${allGames.length} games\n`);

  const meta = {
    startDate: dates[0], endDate: dates[dates.length - 1],
    daysWithGames: new Set(allGames.map(g => g.date)).size,
    totalGames: allGames.length,
    gamesWithSpreads: withSpreads, gamesWithML: withML, gamesWithTotals: withTotals,
  };

  const gamesByDate = {};
  for (const g of allGames) {
    if (!gamesByDate[g.date]) gamesByDate[g.date] = [];
    gamesByDate[g.date].push(g);
  }
  const sortedDates = Object.keys(gamesByDate).sort();

  const oldPeAll = [], newPeAll = [];
  const oldAtsAll = [], newAtsAll = [];
  const oldTotAll = [], newTotAll = [];
  let runningGames = [];

  for (const dateKey of sortedDates) {
    const dayGames = gamesByDate[dateKey];
    const atsMap = buildAtsRecords(runningGames);

    oldPeAll.push(...simulatePickEm(dayGames, atsMap, OLD_CFG));
    newPeAll.push(...simulatePickEm(dayGames, atsMap, NEW_CFG));
    oldAtsAll.push(simulateAts(dayGames, atsMap, OLD_CFG));
    newAtsAll.push(simulateAts(dayGames, atsMap, NEW_CFG));
    oldTotAll.push(...simulateTotals(dayGames, atsMap, OLD_CFG));
    newTotAll.push(...simulateTotals(dayGames, atsMap, NEW_CFG));

    runningGames.push(...dayGames);
  }

  printReport(
    aggPickEm(oldPeAll), aggPickEm(newPeAll),
    aggAts(oldAtsAll), aggAts(newAtsAll),
    aggTotals(oldTotAll), aggTotals(newTotAll), meta,
  );

  // Diagnostic: newly filtered ATS picks
  printHeader('ATS DIAGNOSTIC — Picks newly filtered by new logic');
  const newFiltered = newAtsAll.flatMap(r => r.diagnostics).filter(d => d.filtered);
  const oldFiltered = oldAtsAll.flatMap(r => r.diagnostics).filter(d => d.filtered);
  const newOnly = newFiltered.filter(nf => !oldFiltered.some(of => of.matchup === nf.matchup && of.filtered === nf.filtered));
  console.log(`  Newly filtered: ${newOnly.length}`);
  for (const d of newOnly.slice(0, 15)) {
    console.log(`    ${pad(d.matchup, 44)} spr=${padR(d.spread, 6)} raw=${d.rawEdge} adj=${d.adjustedEdge} → ${d.filtered}`);
  }
  console.log();
  printLine();
  console.log('  Backtest complete.\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
