/**
 * GET /api/nfl/live/next-week
 *
 * The week after the one ESPN calls current: games and lines. The Content
 * Studio's daily post uses it to look ahead (on a Monday, to Thanksgiving).
 * Empty when nothing is scheduled yet.
 */
import { fetchScoreboardPage } from './_normalize.js';
import { enrichGamesWithOdds } from './_odds.js';
import { nextWeekCandidates, weekLabel } from '../../_lib/nflPublicWeek.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  try {
    const current = await fetchScoreboardPage();
    for (const args of nextWeekCandidates(current)) {
      const page = await fetchScoreboardPage(args);
      if (!page.ok || page.games.length === 0) continue;
      let games = page.games;
      try { games = await enrichGamesWithOdds(games); }
      catch (err) { console.warn('[nfl/next-week] odds enrichment failed:', err?.message); }
      return res.status(200).json({ week: page.week ?? args.week, seasonType: page.seasonType ?? args.seasonType, slateLabel: weekLabel({ week: page.week ?? args.week, seasonType: page.seasonType ?? args.seasonType }), games, generatedAt: new Date().toISOString() });
    }
    return res.status(200).json({ week: null, slateLabel: null, games: [], generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[nfl/next-week]', err?.message);
    return res.status(200).json({ week: null, slateLabel: null, games: [], _error: 'unavailable' });
  }
}
