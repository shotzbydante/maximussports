/**
 * Vercel Serverless: ESPN AP Top 25 rankings.
 * GET /api/rankings
 * Returns { rankings: [{ teamName, rank }] } for AP poll (or default first poll).
 */

const ESPN_RANKINGS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings';

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
    const espnRes = await fetch(ESPN_RANKINGS_URL);
    if (!espnRes.ok) {
      throw new Error(`ESPN fetch failed: ${espnRes.status}`);
    }
    const data = await espnRes.json();

    // Prefer AP Top 25; fallback to first available poll
    const pollList = data?.rankings || [];
    const apPoll = pollList.find((p) => (p.type || '').toLowerCase() === 'ap');
    const poll = apPoll || pollList[0];

    const ranks = poll?.ranks || [];
    const rankings = ranks.map((r) => {
      const team = r.team || {};
      const teamName = [team.location, team.name].filter(Boolean).join(' ');
      return {
        teamName: teamName.trim() || 'Unknown',
        rank: r.current ?? r.rank ?? null,
        teamId: team.id ? String(team.id) : null,
      };
    });

    res.json({ rankings });
  } catch (err) {
    console.error('Rankings API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch rankings' });
  }
}
