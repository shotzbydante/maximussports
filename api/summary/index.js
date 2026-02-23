/**
 * Vercel Serverless: Dynamic Home synopsis via OpenAI.
 * GET /api/summary?force=true to bypass cache.
 * Caches result in memory for 30 minutes (key: home_summary).
 * Requires OPENAI_API_KEY. Returns 200 with fallback text if key missing.
 */

const CACHE_KEY = 'home_summary';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const OPENAI_MODEL = 'gpt-4o-mini';

const cache = { value: null, expires: 0 };

function getBaseUrl(req) {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const host = req.headers?.host || 'localhost:3000';
  const proto = req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

function getPstDate() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function fetchJson(baseUrl, path) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
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

  const force = req.query?.force === 'true' || req.query?.force === '1';
  if (!force && cache.value != null && Date.now() < cache.expires) {
    return res.status(200).json({ summary: cache.value });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.status(200).json({
      summary: 'Summary unavailable — OpenAI key not configured.',
    });
  }

  const baseUrl = getBaseUrl(req);
  let scores = [];
  let rankings = [];
  let headlines = [];

  try {
    const [scoresRes, rankingsRes, newsRes] = await Promise.allSettled([
      fetchJson(baseUrl, '/api/scores'),
      fetchJson(baseUrl, '/api/rankings'),
      fetchJson(baseUrl, '/api/news/aggregate?includeNational=true'),
    ]);

    if (scoresRes.status === 'fulfilled') {
      const data = scoresRes.value;
      scores = Array.isArray(data) ? data : (data?.games || []);
    }
    if (rankingsRes.status === 'fulfilled') {
      rankings = rankingsRes.value?.rankings || [];
    }
    if (newsRes.status === 'fulfilled') {
      const items = newsRes.value?.items || [];
      headlines = items.slice(0, 5).map((i) => ({ title: i.title || '', source: i.source || '' }));
    }
  } catch (err) {
    console.error('Summary API data fetch error:', err.message);
  }

  const pstDate = getPstDate();
  const finalGames = scores.filter((g) => {
    const s = (g.gameStatus || '').toLowerCase();
    return s === 'final' || s.includes('final');
  });
  const upcomingGames = scores.filter((g) => {
    const s = (g.gameStatus || '').toLowerCase();
    return s !== 'final' && !s.includes('final') && (g.homeTeam || g.awayTeam);
  });

  const top25List = rankings.slice(0, 25).map((r) => `#${r.rank} ${r.teamName}`).join(', ') || 'None';
  const resultsText = finalGames.length
    ? finalGames.map((g) => `${g.awayTeam} ${g.awayScore || '-'} @ ${g.homeTeam} ${g.homeScore || '-'} (${g.gameStatus || 'Final'})`).join('\n')
    : 'No final scores yet today.';
  const upcomingText = upcomingGames.length
    ? upcomingGames.slice(0, 8).map((g) => `${g.awayTeam} @ ${g.homeTeam} — ${g.gameStatus || 'Upcoming'}`).join('\n')
    : 'No upcoming games listed.';
  const headlinesText = headlines.length
    ? headlines.map((h) => `- ${h.title} (${h.source})`).join('\n')
    : 'No headlines available.';

  const systemPrompt = `You are a sports editor for Maximus Sports, a March Madness / men's college basketball hub. Write a very short, punchy daily recap (3–6 sentences). Use 1–2 bullets or short paragraphs. Mention the date when relevant. Tone: informative, concise, no fluff.`;

  const userPrompt = `Today's date (PST): ${pstDate}

AP Top 25 (for context): ${top25List}

Today's game results (final):
${resultsText}

Upcoming / in-progress games:
${upcomingText}

Top headlines:
${headlinesText}

Write a brief home-page summary (3–6 sentences) that a fan would want to read first thing. Include the date (PST), any notable results or ranked matchups, and a nod to the headlines. Keep it scannable (bullets or short paragraphs).`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.5,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errBody);
      return res.status(200).json({
        summary: 'Summary unavailable — could not generate. Try again later.',
      });
    }

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    const summary = content || 'Summary unavailable — no response from model.';

    cache.value = summary;
    cache.expires = Date.now() + CACHE_TTL_MS;

    return res.status(200).json({ summary });
  } catch (err) {
    console.error('Summary API OpenAI error:', err.message);
    return res.status(200).json({
      summary: 'Summary unavailable — try again later.',
    });
  }
}
