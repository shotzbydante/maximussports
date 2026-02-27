/**
 * Shared data builder for home chat summary — no self-HTTP calls.
 * Reuses the same source helpers used by /api/home/fast and the ATS pipeline.
 */

import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getHeadlines } from '../home/cache.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getJson } from '../_globalCache.js';

const CHAMPIONSHIP_KV_KEY = 'odds:championship:ncaab:v1';

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function isFinal(status) {
  const s = (status || '').toLowerCase();
  return s === 'final' || s.includes('final');
}

/**
 * Gather all data needed for the home chat summary.
 * Returns structured payload; never throws — each section falls back to empty safely.
 */
export async function buildHomeSummaryData() {
  const today = toDateStr(new Date());
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const yesterdayParam = yesterday.replace(/-/g, '');

  const [scoresRes, scoresYestRes, rankingsRes, atsRes, champRes] = await Promise.allSettled([
    fetchScoresSource(),
    fetchScoresSource(yesterdayParam),
    fetchRankingsSource(),
    getAtsLeadersPipeline({ atsWindow: 'last30' }),
    getJson(CHAMPIONSHIP_KV_KEY),
  ]);

  const scoresToday = scoresRes.status === 'fulfilled' && Array.isArray(scoresRes.value) ? scoresRes.value : [];
  const scoresYesterday = scoresYestRes.status === 'fulfilled' && Array.isArray(scoresYestRes.value) ? scoresYestRes.value : [];
  const rankingsRaw = rankingsRes.status === 'fulfilled' ? (rankingsRes.value?.rankings ?? []) : [];
  const ats = atsRes.status === 'fulfilled' && atsRes.value ? atsRes.value : {};
  const champCached = champRes.status === 'fulfilled' && champRes.value ? champRes.value : null;

  // Headlines: in-memory cache first, then fetch.
  let headlines = getHeadlines();
  if (!Array.isArray(headlines) || headlines.length === 0) {
    try {
      const newsData = await fetchNewsAggregateSource({ includeNational: true });
      headlines = newsData?.items ?? [];
    } catch (_) {
      headlines = [];
    }
  }

  // Yesterday: prefer explicit yesterday fetch; if empty fall back to today's finals.
  const yesterdayFinals = scoresYesterday.filter((g) => isFinal(g.gameStatus));
  const todayFinals = scoresToday.filter((g) => isFinal(g.gameStatus));
  const yesterdayGames = yesterdayFinals.length > 0 ? yesterdayFinals : todayFinals;
  const todayUpcoming = scoresToday.filter((g) => !isFinal(g.gameStatus));

  return {
    yesterdayGames,          // completed games (yesterday or today's finals)
    todayGames: todayUpcoming,
    tomorrowGames: [],       // ESPN data doesn't reliably have tomorrow
    rankings: Array.isArray(rankingsRaw) ? rankingsRaw.slice(0, 25) : [],
    headlines: Array.isArray(headlines) ? headlines : [],
    atsLeaders: {
      best: Array.isArray(ats.best) ? ats.best : [],
      worst: Array.isArray(ats.worst) ? ats.worst : [],
    },
    atsMeta: ats.atsMeta ?? null,
    atsWindow: ats.atsWindow ?? 'last30',
    championshipOdds: champCached?.odds ?? {},
  };
}
