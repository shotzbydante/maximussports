/**
 * Vercel Serverless: ESPN team schedule.
 * GET /api/schedule/:teamId
 * Returns { events: [{ id, date, homeTeam, awayTeam, homeScore, awayScore, status, venue, homeAway }] }.
 */

const ESPN_SCHEDULE_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams';

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

  let teamId = req.query?.teamId;
  if (!teamId) {
    const url = req.url || '';
    const match = url.match(/\/api\/schedule\/([^/?]+)/);
    teamId = match ? match[1] : null;
  }
  if (!teamId) {
    return res.status(400).json({ error: 'Missing teamId' });
  }

  try {
    const url = `${ESPN_SCHEDULE_URL}/${teamId}/schedule`;
    const espnRes = await fetch(url);
    if (!espnRes.ok) {
      throw new Error(`ESPN fetch failed: ${espnRes.status}`);
    }
    const data = await espnRes.json();
    const rawEvents = data?.events || [];

    function toScore(val) {
      if (val == null) return null;
      if (typeof val === 'number' && !isNaN(val)) return String(val);
      if (typeof val === 'string') return val;
      if (typeof val === 'object' && val !== null) {
        const v = val.displayValue ?? val['#text'] ?? val.value;
        if (v != null) return String(v);
      }
      return null;
    }

    const events = rawEvents.map((ev) => {
      const comp = ev?.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      const status = comp?.status || ev?.status;
      const statusType = status?.type?.name || '';
      const statusDesc = status?.type?.description || status?.type?.shortDetail || '';
      const isFinal = statusType === 'STATUS_FINAL' || statusType === 'STATUS_POSTPONED';
      const venue = comp?.venue?.fullName || comp?.venue?.name || null;

      const homeTeam = home?.team?.displayName || home?.team?.shortDisplayName || 'TBD';
      const awayTeam = away?.team?.displayName || away?.team?.shortDisplayName || 'TBD';
      const homeScore = toScore(home?.score);
      const awayScore = toScore(away?.score);

      const homeId = home?.team?.id;
      const targetId = String(teamId);
      const homeAway = homeId === targetId ? 'home' : 'away';
      const opponent = homeAway === 'home' ? awayTeam : homeTeam;
      const ourScore = homeAway === 'home' ? homeScore : awayScore;
      const oppScore = homeAway === 'home' ? awayScore : homeScore;

      return {
        id: ev.id,
        date: ev.date || comp?.date || null,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        status: statusDesc || 'Scheduled',
        statusType,
        isFinal,
        venue,
        homeAway,
        opponent,
        ourScore,
        oppScore,
      };
    });

    res.json({ events });
  } catch (err) {
    console.error('Schedule API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch schedule' });
  }
}
