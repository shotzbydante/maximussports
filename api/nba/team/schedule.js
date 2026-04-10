/**
 * GET /api/nba/team/schedule?slug=bos
 * NBA team schedule from ESPN.
 */

import { createCache } from '../../_cache.js';
import { NBA_ESPN_IDS, NBA_TEAMS } from '../../../src/sports/nba/teams.js';

const cache = createCache(5 * 60 * 1000);

const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(NBA_ESPN_IDS)) espnIdToSlug[eid] = slug;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const slug = url.searchParams.get('slug');
  if (!slug) return res.status(400).json({ error: 'Missing slug parameter' });

  const espnId = NBA_ESPN_IDS[slug];
  if (!espnId) return res.status(404).json({ error: `Unknown team slug: ${slug}` });

  const cacheKey = `nba:team:schedule:${slug}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnId}/schedule`;
    const r = await fetch(espnUrl);
    if (!r.ok) return res.status(200).json({ events: [], teamRecord: null });

    const data = await r.json();
    const rawEvents = data.events || [];
    const teamRecord = data.team?.record?.items?.[0]?.summary || null;

    const events = rawEvents.map((ev) => {
      const comp = ev.competitions?.[0];
      if (!comp) return null;

      const competitors = comp.competitors || [];
      const us = competitors.find(c => String(c.team?.id) === espnId);
      const them = competitors.find(c => String(c.team?.id) !== espnId);
      const isHome = us?.homeAway === 'home';

      const status = comp.status || ev.status || {};
      const state = status?.type?.state;
      const isFinal = state === 'post';

      const oppEspnId = String(them?.team?.id || '');
      const oppSlug = espnIdToSlug[oppEspnId] || null;
      const oppTeam = oppSlug ? NBA_TEAMS.find(t => t.slug === oppSlug) : null;

      return {
        id: ev.id,
        date: ev.date || comp.date,
        opponent: oppTeam?.name || them?.team?.displayName || 'TBD',
        opponentSlug: oppSlug,
        opponentLogo: them?.team?.logo || (oppEspnId ? `https://a.espncdn.com/i/teamlogos/nba/500/${oppEspnId}.png` : null),
        isHome,
        ourScore: us?.score != null ? Number(us.score) : null,
        oppScore: them?.score != null ? Number(them.score) : null,
        gameStatus: isFinal ? 'final' : state === 'in' ? 'in_progress' : 'upcoming',
        isFinal,
        network: comp.broadcasts?.[0]?.names?.[0] || null,
        gamecastUrl: ev.links?.find(l => l.rel?.includes('gamecast') || l.rel?.includes('summary'))?.href
          || (ev.id ? `https://www.espn.com/nba/game/_/gameId/${ev.id}` : null),
      };
    }).filter(Boolean);

    const payload = { events, teamRecord };
    cache.set(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ events: [], error: err?.message });
  }
}
