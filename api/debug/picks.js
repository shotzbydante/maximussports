/**
 * GET /api/debug/picks
 * Temporary debug endpoint to inspect the canonical Maximus Picks pipeline.
 * Reproduces the exact same logic Dashboard uses:
 *   1. Fetch raw data (scores, odds, ATS)
 *   2. buildActivePicksGames()
 *   3. buildMaximusPicks()
 * Returns structured JSON showing counts, sample games, and full picks.
 *
 * Safe: no secrets, no mutations, sliced arrays.
 */

import {
  fetchScoresSource,
  fetchOddsSource,
} from '../_sources.js';
import { getAtsLeadersMaybeStale } from '../home/cache.js';
import { buildActivePicksGames } from '../../src/utils/activePicksGames.js';
import { buildMaximusPicks } from '../../src/utils/maximusPicksModel.js';
import { mergeGamesWithOdds } from '../../src/api/odds.js';
import { getTeamSlug } from '../../src/utils/teamSlug.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const t0 = Date.now();

  try {
    // ── Step 1: Fetch raw inputs (same sources as /api/home) ──
    const [scoresResult, oddsResult, atsResult] = await Promise.allSettled([
      fetchScoresSource(),
      fetchOddsSource().catch(() => ({ games: [] })),
      getAtsLeadersMaybeStale(),
    ]);

    const scores = scoresResult.status === 'fulfilled' ? (scoresResult.value ?? []) : [];
    const oddsData = oddsResult.status === 'fulfilled' ? (oddsResult.value ?? { games: [] }) : { games: [] };
    const oddsGames = oddsData.games ?? [];
    const atsLeadersRaw = atsResult.status === 'fulfilled' ? atsResult.value : null;
    const atsLeaders = atsLeadersRaw?.value?.atsLeaders ?? atsLeadersRaw?.atsLeaders ?? { best: [], worst: [] };

    // ── Step 2: buildActivePicksGames (same as Dashboard) ──
    let picksGames = [];
    let picksGamesError = null;
    try {
      picksGames = buildActivePicksGames({
        todayScores: scores,
        oddsGames,
        upcomingGamesWithSpreads: [],
        getSlug: getTeamSlug,
        mergeWithOdds: mergeGamesWithOdds,
      });
    } catch (err) {
      picksGamesError = { message: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') };
    }

    // ── Step 3: buildMaximusPicks (same as Dashboard) ──
    let canonicalPicks = null;
    let picksError = null;
    try {
      canonicalPicks = buildMaximusPicks({
        games: picksGames,
        atsLeaders,
      });
    } catch (err) {
      picksError = { message: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') };
    }

    // ── Build response ──
    const pe = canonicalPicks?.pickEmPicks ?? [];
    const ats = canonicalPicks?.atsPicks ?? [];
    const val = canonicalPicks?.valuePicks ?? [];
    const tot = canonicalPicks?.totalsPicks ?? [];

    return res.status(200).json({
      ok: true,
      durationMs: Date.now() - t0,
      counts: {
        rawScores: scores.length,
        rawOddsGames: oddsGames.length,
        picksGames: picksGames.length,
        pickEm: pe.length,
        ats: ats.length,
        value: val.length,
        totals: tot.length,
      },
      errors: {
        scores: scoresResult.status === 'rejected' ? scoresResult.reason?.message : null,
        odds: oddsResult.status === 'rejected' ? oddsResult.reason?.message : null,
        atsLeaders: atsResult.status === 'rejected' ? atsResult.reason?.message : null,
        picksGames: picksGamesError,
        picks: picksError,
      },
      samplePicksGames: picksGames.slice(0, 8).map(g => ({
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        homeSlug: getTeamSlug(g.homeTeam),
        awaySlug: getTeamSlug(g.awayTeam),
        spread: g.homeSpread ?? g.spread ?? null,
        total: g.total ?? null,
        gameId: g.gameId ?? null,
        startTime: g.startTime ?? g.commenceTime ?? null,
      })),
      pickEmTop3: pe.filter(p => p.itemType === 'lean').slice(0, 3).map(p => ({
        pickTeam: p.pickTeam,
        opponent: p.opponentTeam,
        pickLine: p.pickLine,
        confidence: p.confidence,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        homeSlug: p.homeSlug,
        awaySlug: p.awaySlug,
      })),
      atsTop3: ats.filter(p => p.itemType === 'lean').slice(0, 3).map(p => ({
        pickTeam: p.pickTeam,
        opponent: p.opponentTeam,
        pickLine: p.pickLine,
        confidence: p.confidence,
        spread: p.spread,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        homeSlug: p.homeSlug,
        awaySlug: p.awaySlug,
      })),
      valueTop3: val.filter(p => p.itemType === 'lean').slice(0, 3).map(p => ({
        pickTeam: p.pickTeam,
        opponent: p.opponentTeam,
        pickLine: p.pickLine,
        confidence: p.confidence,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
      })),
      totalsTop3: tot.filter(p => p.itemType === 'lean').slice(0, 3).map(p => ({
        pickTeam: p.pickTeam || `${p.homeTeam} vs ${p.awayTeam}`,
        pickLine: p.pickLine,
        confidence: p.confidence,
        total: p.total ?? null,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
      })),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 8).join('\n'),
      durationMs: Date.now() - t0,
    });
  }
}
