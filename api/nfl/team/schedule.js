/**
 * GET /api/nfl/team/schedule?slug=chiefs
 * One team's season schedule from ESPN: results so far, what is left, and
 * the bye week.
 */

import { createCache } from '../../_cache.js';
import { getNflTeamBySlug, getNflTeamByEspnId, getNflLogoUrl } from '../../../src/sports/nfl/teams.js';

const cache = createCache(5 * 60 * 1000);

function scoreOf(c) {
  // The team-schedule feed wraps scores as { value, displayValue }.
  const raw = c?.score;
  if (raw == null) return null;
  if (typeof raw === 'object') {
    const v = raw.value ?? raw.displayValue;
    return v != null && v !== '' ? Number(v) : null;
  }
  return raw !== '' ? Number(raw) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const slug = (url.searchParams.get('slug') || '').toLowerCase();
  if (!slug) return res.status(400).json({ error: 'Missing slug parameter' });

  const team = getNflTeamBySlug(slug);
  if (!team) return res.status(404).json({ error: `Unknown team slug: ${slug}` });

  const cacheKey = `nfl:team:schedule:${slug}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.espnId}/schedule`;
    const r = await fetch(espnUrl, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(200).json({ events: [], teamRecord: null, byeWeek: null });

    const data = await r.json();
    const teamRecord = data.team?.recordSummary || data.team?.record?.items?.[0]?.summary || null;
    const byeWeek = data.byeWeek ?? null;

    const events = (data.events || []).map((ev) => {
      const comp = ev.competitions?.[0];
      if (!comp) return null;

      const competitors = comp.competitors || [];
      const us = competitors.find((c) => String(c.team?.id) === team.espnId);
      const them = competitors.find((c) => String(c.team?.id) !== team.espnId);
      const isHome = us?.homeAway === 'home';

      const status = comp.status || ev.status || {};
      const state = status?.type?.state;
      const isFinal = state === 'post' && status?.type?.completed !== false;

      const opp = getNflTeamByEspnId(them?.team?.id);
      const ourScore = scoreOf(us);
      const oppScore = scoreOf(them);
      let result = null;
      if (isFinal && ourScore != null && oppScore != null) {
        result = ourScore > oppScore ? 'W' : ourScore < oppScore ? 'L' : 'T';
      }

      return {
        id: ev.id,
        date: ev.date || comp.date,
        week: ev.week?.number ?? null,
        seasonType: ev.seasonType?.type ?? ev.season?.type ?? null,
        opponent: opp?.name || them?.team?.displayName || 'TBD',
        opponentAbbrev: opp?.abbrev || them?.team?.abbreviation || '',
        opponentSlug: opp?.slug || null,
        opponentLogo: (opp ? getNflLogoUrl(opp.slug) : null) || them?.team?.logos?.[0]?.href || them?.team?.logo || null,
        isHome,
        neutralSite: !!comp.neutralSite,
        ourScore,
        oppScore,
        result,
        gameStatus: isFinal ? 'final' : state === 'in' ? 'in_progress' : 'upcoming',
        isFinal,
        network: comp.broadcasts?.[0]?.media?.shortName || comp.broadcasts?.[0]?.names?.[0] || null,
        gamecastUrl: ev.links?.find((l) => l.rel?.includes('gamecast') || l.rel?.includes('summary'))?.href
          || (ev.id ? `https://www.espn.com/nfl/game/_/gameId/${ev.id}` : null),
      };
    }).filter(Boolean);

    const payload = { events, teamRecord, byeWeek };
    if (events.length > 0) cache.set(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ events: [], teamRecord: null, byeWeek: null, error: err?.message });
  }
}
