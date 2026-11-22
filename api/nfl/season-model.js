/**
 * GET /api/nfl/season-model
 *
 * Season Intelligence payload: for every team, the record and scoring to
 * date, the power rating, schedule-aware projected wins, simulated playoff
 * / division / top-seed probabilities, and the Super Bowl market price.
 * Also returns each conference's current playoff picture.
 */

import { createCache, coalesce } from '../_cache.js';
import { NFL_TEAMS, getNflLogoUrl } from '../../src/sports/nfl/teams.js';
import { getNflStandings } from '../_lib/nflStandings.js';
import { getNflRatings, fetchRemainingSchedule } from '../_lib/nflRatings.js';
import { simulateNflSeason } from '../../src/features/nfl/season/simulateSeason.js';
import { getNflChampionshipOdds } from './odds/championship.js';

const cache = createCache(15 * 60 * 1000);
const CACHE_KEY = 'nfl:season-model:v1';
const SIMS = 4000;

function impliedProb(american) {
  if (typeof american !== 'number' || american === 0) return null;
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}

async function build() {
  const [standings, ratings, schedule, champ] = await Promise.all([
    getNflStandings(),
    getNflRatings().catch(() => null),
    fetchRemainingSchedule().catch(() => ({ remaining: [], complete: false })),
    getNflChampionshipOdds().catch(() => null),
  ]);

  const week = schedule.week ?? ratings?.week ?? null;
  const sim = simulateNflSeason({
    standings: standings.teams,
    ratings,
    remaining: schedule.remaining,
    results: ratings?.results || [],
    sims: SIMS,
    // Stable within a week, different between weeks.
    seed: (ratings?.seasonYear || 2026) * 100 + (week || 0),
  });

  // Market title probabilities, normalised so the field sums to 1.
  const champOdds = champ?.odds || {};
  const rawImplied = {};
  let impliedSum = 0;
  for (const [slug, o] of Object.entries(champOdds)) {
    const p = impliedProb(o?.bestChanceAmerican);
    if (p != null) { rawImplied[slug] = p; impliedSum += p; }
  }

  const ranked = Object.values(ratings?.teams || {})
    .filter((r) => typeof r.rating === 'number')
    .sort((a, b) => b.rating - a.rating);
  const powerRank = Object.fromEntries(ranked.map((r, i) => [r.slug, i + 1]));

  const teams = NFL_TEAMS.map((t) => {
    const s = standings.teams?.[t.slug] || {};
    const r = ratings?.teams?.[t.slug] || {};
    const m = sim.teams[t.slug] || {};
    return {
      slug: t.slug,
      name: t.name,
      nickname: t.nickname,
      abbrev: t.abbrev,
      conference: t.conference,
      division: t.division,
      logo: getNflLogoUrl(t.slug),
      record: s.record || '0-0',
      wins: s.wins || 0,
      losses: s.losses || 0,
      ties: s.ties || 0,
      pct: s.pct || 0,
      pointDiff: s.pointDiff ?? null,
      streak: s.streak || null,
      playoffSeed: s.playoffSeed ?? null,
      divisionRank: s.divisionRank ?? null,
      clincher: s.clincher || null,
      rating: r.rating ?? null,
      offense: r.offense ?? null,
      defense: r.defense ?? null,
      sos: r.sos ?? null,
      powerRank: powerRank[t.slug] ?? null,
      projectedWins: m.projectedWins ?? null,
      projectedLosses: m.projectedLosses ?? null,
      gamesRemaining: m.gamesRemaining ?? null,
      playoffPct: m.playoffPct ?? null,
      divisionPct: m.divisionPct ?? null,
      topSeedPct: m.topSeedPct ?? null,
      pythagoreanPct: m.pythagoreanPct ?? null,
      luck: m.luck ?? null,
      titleOdds: champOdds[t.slug]?.bestChanceAmerican ?? null,
      titleImpliedPct: rawImplied[t.slug] != null && impliedSum > 0
        ? Math.round((rawImplied[t.slug] / impliedSum) * 1000) / 1000
        : null,
    };
  });

  // Current playoff picture straight from ESPN's seeds (full tiebreakers).
  const picture = {};
  for (const conf of ['AFC', 'NFC']) {
    const seeded = teams
      .filter((t) => t.conference === conf && t.playoffSeed != null)
      .sort((a, b) => a.playoffSeed - b.playoffSeed);
    picture[conf] = {
      in: seeded.filter((t) => t.playoffSeed <= 7).map((t) => t.slug),
      hunt: seeded.filter((t) => t.playoffSeed > 7 && t.playoffSeed <= 11).map((t) => t.slug),
    };
  }

  return {
    teams,
    picture,
    week,
    seasonType: schedule.seasonType ?? ratings?.seasonType ?? null,
    seasonYear: ratings?.seasonYear ?? standings.season ?? null,
    meta: {
      sims: sim.sims,
      gamesRemaining: sim.gamesRemaining,
      scheduleComplete: !!schedule.complete,
      ratingSource: ratings?.source || 'none',
      ratingGames: ratings?.games || 0,
      leaguePpg: ratings?.leaguePpg ?? null,
      titleOddsUpdatedAt: champ?.updatedAt || null,
    },
    generatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  try {
    const payload = await coalesce(CACHE_KEY, build);
    if (payload.teams.some((t) => t.wins + t.losses + t.ties > 0)) cache.set(CACHE_KEY, payload);
    return res.status(200).json(payload);
  } catch (err) {
    const stale = cache.getMaybeStale(CACHE_KEY);
    if (stale?.value) return res.status(200).json({ ...stale.value, stale: true });
    return res.status(200).json({ teams: [], picture: { AFC: { in: [], hunt: [] }, NFC: { in: [], hunt: [] } }, error: err?.message });
  }
}
