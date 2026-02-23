/**
 * Vercel Serverless: Dynamic Home synopsis via OpenAI (SSE streaming).
 * GET /api/summary?stream=true&force=true to bypass cache and stream.
 * Caches result in memory for 30 minutes (key: home_summary + updatedAt).
 * Requires OPENAI_API_KEY. Sends error event if key missing.
 */

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const OPENAI_MODEL = 'gpt-4o-mini';

const cache = { value: null, updatedAt: null, expires: 0 };

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

function getPstTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function fetchJson(baseUrl, path) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function send(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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

  const stream = req.query?.stream === 'true' || req.query?.stream === '1';
  const force = req.query?.force === 'true' || req.query?.force === '1';

  if (!stream) {
    return res.status(400).json({ error: 'Use ?stream=true' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    send(res, { error: true, message: 'Summary unavailable — OpenAI key not configured.' });
    return res.end();
  }

  // Cache hit: send full text and done immediately (no streaming)
  if (!force && cache.value != null && cache.updatedAt != null && Date.now() < cache.expires) {
    send(res, { text: cache.value, done: true, updatedAt: cache.updatedAt });
    return res.end();
  }

  const baseUrl = getBaseUrl(req);
  let scores = [];
  let rankings = [];
  let headlines = [];
  let oddsGames = [];

  try {
    const [scoresRes, rankingsRes, newsRes, oddsRes] = await Promise.allSettled([
      fetchJson(baseUrl, '/api/scores'),
      fetchJson(baseUrl, '/api/rankings'),
      fetchJson(baseUrl, '/api/news/aggregate?includeNational=true'),
      fetchJson(baseUrl, '/api/odds').catch(() => ({ games: [] })),
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
    if (oddsRes.status === 'fulfilled' && oddsRes.value?.games) {
      oddsGames = oddsRes.value.games;
    }
  } catch (err) {
    console.error('Summary API data fetch error:', err.message);
  }

  const pstDate = getPstDate();
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchOdds = (scoreGame, oddsList) => {
    const h = norm(scoreGame.homeTeam);
    const a = norm(scoreGame.awayTeam);
    return oddsList.find((o) => {
      const oh = norm(o.homeTeam);
      const oa = norm(o.awayTeam);
      return (h.includes(oh) || oh.includes(h)) && (a.includes(oa) || oa.includes(a));
    });
  };

  const finalGames = scores.filter((g) => {
    const s = (g.gameStatus || '').toLowerCase();
    return s === 'final' || s.includes('final');
  }).map((g) => {
    const o = matchOdds(g, oddsGames);
    return { ...g, spread: o?.spread };
  });
  const upcomingGames = scores.filter((g) => {
    const s = (g.gameStatus || '').toLowerCase();
    return s !== 'final' && !s.includes('final') && (g.homeTeam || g.awayTeam);
  }).map((g) => {
    const o = matchOdds(g, oddsGames);
    return { ...g, spread: o?.spread };
  });

  const top25List = rankings.slice(0, 25).map((r) => `#${r.rank} ${r.teamName}`).join(', ') || 'None';
  const resultsWithSpread = finalGames.map((g) => {
    const spread = g.spread != null ? ` (spread ${g.spread})` : '';
    return `${g.awayTeam} ${g.awayScore ?? '-'} @ ${g.homeTeam} ${g.homeScore ?? '-'}${spread}`;
  });
  const resultsText = resultsWithSpread.length ? resultsWithSpread.join('\n') : 'No final scores yet today.';
  const upcomingWithSpread = upcomingGames.slice(0, 10).map((g) => {
    const spread = g.spread != null ? ` — spread: ${g.spread}` : '';
    return `${g.awayTeam} @ ${g.homeTeam}${spread} (${g.gameStatus || 'Upcoming'})`;
  });
  const upcomingText = upcomingWithSpread.length ? upcomingWithSpread.join('\n') : 'No upcoming games listed.';
  const headlinesText = headlines.length
    ? headlines.map((h) => `- ${h.title} (${h.source})`).join('\n')
    : 'No headlines available.';

  const systemPrompt = `You are a friendly sports host for Maximus Sports, a March Madness / men's college basketball hub. Write a conversational daily briefing (not a bullet list). Use short paragraphs and inline highlights. Style: "Here's the rundown for today…" and "Looking ahead to tomorrow…" Mention the date (PST). Cover: (a) Top 25 games that happened today with final scores and ATS when relevant, (b) Top 25 games coming up with spreads, (c) 2–4 significant headlines tied to those teams. Keep it narrative and scannable.`;

  const userPrompt = `Today's date (PST): ${pstDate}

AP Top 25: ${top25List}

Today's final results (include spread when available for ATS context):
${resultsText}

Upcoming / in-progress games (with spread when available):
${upcomingText}

Headlines (tie 2–4 to today's/upcoming teams):
${headlinesText}

Write a conversational daily recap in 2–4 short paragraphs. Start with "Here's the rundown for today…" or similar. Then "Looking ahead to tomorrow…" for upcoming games. Weave in 2–4 headlines. No long bullet lists.`;

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
        max_tokens: 600,
        temperature: 0.5,
        stream: true,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errBody);
      send(res, { error: true, message: 'Summary unavailable — try again later.' });
      return res.end();
    }

    const reader = openaiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              send(res, { text: delta, done: false });
            }
          } catch (_) {
            // skip malformed chunk
          }
        }
      }
    }

    const updatedAt = new Date().toISOString();
    cache.value = fullContent.trim() || null;
    cache.updatedAt = updatedAt;
    cache.expires = Date.now() + CACHE_TTL_MS;

    send(res, { done: true, updatedAt });
    res.end();
  } catch (err) {
    console.error('Summary API OpenAI error:', err.message);
    send(res, { error: true, message: 'Summary unavailable — try again later.' });
    res.end();
  }
}
