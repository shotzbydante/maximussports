/**
 * Vercel Serverless Function: proxy ESPN college basketball scoreboard.
 * GET /api/scores
 * No API key required — ESPN endpoints are unofficial; keep isolated for easy replacement.
 */

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

function getGameStatus(status) {
  if (!status) return 'Scheduled';
  const { type, displayClock, period } = status;
  const name = type?.name || '';
  if (name === 'STATUS_FINAL' || name === 'STATUS_POSTPONED') {
    return status.type?.description || 'Final';
  }
  if (name === 'STATUS_HALFTIME') return 'Halftime';
  if (name === 'STATUS_IN_PROGRESS' && displayClock != null && period != null) {
    const periodLabel = period === 1 ? '1st' : period === 2 ? '2nd' : `Q${period}`;
    return `${periodLabel} ${displayClock}`;
  }
  return status.type?.description || status.type?.shortDetail || 'Scheduled';
}

function getNetwork(competition) {
  const broadcasts = competition?.broadcasts;
  if (!Array.isArray(broadcasts) || broadcasts.length === 0) return null;
  const first = broadcasts[0];
  const names = first?.names;
  if (Array.isArray(names) && names.length > 0) return names[0];
  return null;
}

function getVenue(competition) {
  const venue = competition?.venue;
  if (!venue) return null;
  return venue.fullName || venue.name || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dateParam = req.query?.date;
    const url = dateParam
      ? `${ESPN_SCOREBOARD_URL}?dates=${String(dateParam).replace(/-/g, '')}`
      : ESPN_SCOREBOARD_URL;
    const espnRes = await fetch(url);
    if (!espnRes.ok) {
      throw new Error(`ESPN fetch failed: ${espnRes.status}`);
    }
    const data = await espnRes.json();
    const events = data?.events || [];
    const games = events.map((event) => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      const status = comp?.status || event?.status;

      return {
        gameId: event.id,
        homeTeam: home?.team?.displayName || home?.team?.shortDisplayName || 'TBD',
        awayTeam: away?.team?.displayName || away?.team?.shortDisplayName || 'TBD',
        homeScore: home?.score != null ? String(home.score) : null,
        awayScore: away?.score != null ? String(away.score) : null,
        gameStatus: getGameStatus(status),
        startTime: event.date || comp?.date || null,
        network: getNetwork(comp),
        venue: getVenue(comp),
      };
    });

    res.json(games);
  } catch (err) {
    console.error('Scores API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch scores' });
  }
}
