/**
 * GET /api/nfl/team/board — NFL team board payload.
 * All 32 teams with record, division standing, playoff seed, scoring and
 * the model's power rating. Feeds Team Intel, pinned-team cards and the
 * team picker.
 */

import { createCache } from '../../_cache.js';
import { NFL_TEAMS, getNflLogoUrl } from '../../../src/sports/nfl/teams.js';
import { getNflStandings } from '../../_lib/nflStandings.js';
import { getNflRatings } from '../../_lib/nflRatings.js';

const cache = createCache(5 * 60 * 1000);
const CACHE_KEY = 'nfl:team:board';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  try {
    const [standings, ratings] = await Promise.all([
      getNflStandings(),
      getNflRatings().catch(() => null),
    ]);

    const ranked = Object.values(ratings?.teams || {})
      .filter((r) => typeof r.rating === 'number')
      .sort((a, b) => b.rating - a.rating);
    const powerRank = Object.fromEntries(ranked.map((r, i) => [r.slug, i + 1]));

    const board = NFL_TEAMS.map((t) => {
      const s = standings.teams?.[t.slug] || {};
      const r = ratings?.teams?.[t.slug] || null;
      return {
        slug: t.slug,
        name: t.name,
        nickname: t.nickname,
        abbrev: t.abbrev,
        conference: t.conference,
        division: t.division,
        record: s.record || '0-0',
        wins: s.wins || 0,
        losses: s.losses || 0,
        ties: s.ties || 0,
        pct: s.pct || 0,
        divisionRank: s.divisionRank ?? null,
        standing: s.standing || null,
        playoffSeed: s.playoffSeed ?? null,
        clincher: s.clincher || null,
        streak: s.streak || null,
        pointsFor: s.pointsFor ?? null,
        pointsAgainst: s.pointsAgainst ?? null,
        pointDiff: s.pointDiff ?? null,
        homeRecord: s.homeRecord || null,
        roadRecord: s.roadRecord || null,
        divisionRecord: s.divisionRecord || null,
        conferenceRecord: s.conferenceRecord || null,
        rating: r?.rating ?? null,
        offense: r?.offense ?? null,
        defense: r?.defense ?? null,
        powerRank: powerRank[t.slug] ?? null,
        logo: getNflLogoUrl(t.slug),
      };
    });

    const payload = {
      board,
      week: ratings?.week ?? null,
      seasonType: ratings?.seasonType ?? null,
      ratingSource: ratings?.source ?? 'none',
      fetchedAt: new Date().toISOString(),
    };
    if (board.some((t) => t.wins + t.losses + t.ties > 0)) cache.set(CACHE_KEY, payload);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ board: [], error: err?.message });
  }
}
