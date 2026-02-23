/**
 * Vercel Serverless: GPT team briefing for Team page (2–4 sentences).
 * POST /api/summary/team with body { slug?, teamName, upcomingGames, lastWeek, atsSummary, headlines }.
 * Uses only the provided payload; no external API calls. Cache 30 min per team slug.
 * Returns { summary, updatedAt } (ISO string when generated or from cache).
 */

const CACHE_TTL_MS = 30 * 60 * 1000;
const OPENAI_MODEL = 'gpt-4o-mini';

const teamCache = {};

function cacheKey(slug, payloadHash) {
  return slug ? `${slug}:${payloadHash}` : `anon:${payloadHash}`;
}

function hashPayload(payload) {
  const str = JSON.stringify({
    teamName: payload.teamName,
    upcomingGames: payload.upcomingGames,
    lastWeek: payload.lastWeek,
    atsSummary: payload.atsSummary,
    headlines: (payload.headlines || []).map((h) => h.title || h),
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return String(hash);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');

  let body = {};
  try {
    const raw = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const teamName = typeof body.teamName === 'string' ? body.teamName.trim() : (slug && slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) || 'Team';
  const upcomingGames = Array.isArray(body.upcomingGames) ? body.upcomingGames : [];
  const lastWeek = Array.isArray(body.lastWeek) ? body.lastWeek : [];
  const atsSummary = body.atsSummary != null ? body.atsSummary : {};
  const headlines = Array.isArray(body.headlines) ? body.headlines : [];

  const payload = { teamName, upcomingGames, lastWeek, atsSummary, headlines };
  const key = cacheKey(slug || 'team', hashPayload(payload));
  const cached = teamCache[key];
  if (cached && Date.now() < cached.expires) {
    return res.status(200).json({ summary: cached.summary, updatedAt: cached.updatedAt });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.status(200).json({ summary: null, updatedAt: null, message: 'Summary unavailable.' });
  }

  const systemPrompt = 'You are a concise sports analyst. Write a short, friendly team briefing in 2–4 sentences. Mention upcoming games with spreads, last week performance (W–L, ATS), and 1–2 key headlines. Avoid bullet points. Keep it conversational.';
  const userPrompt = `Team: ${teamName}
Upcoming games: ${JSON.stringify(upcomingGames)}
Last week: ${JSON.stringify(lastWeek)}
ATS: ${JSON.stringify(atsSummary)}
Headlines: ${JSON.stringify(headlines)}`;

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
        max_tokens: 220,
        temperature: 0.3,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI team summary error:', openaiRes.status, errBody);
      return res.status(200).json({ summary: null, updatedAt: null, message: 'Summary unavailable.' });
    }

    const data = await openaiRes.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || null;
    const updatedAt = new Date().toISOString();

    teamCache[key] = { summary, updatedAt, expires: Date.now() + CACHE_TTL_MS };

    return res.status(200).json({ summary, updatedAt });
  } catch (err) {
    console.error('Team summary API error:', err.message);
    return res.status(200).json({ summary: null, updatedAt: null, message: 'Summary unavailable.' });
  }
}
