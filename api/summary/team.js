/**
 * Vercel Serverless: GPT team insight for Team page (streaming or JSON).
 * POST /api/summary/team
 *   ?stream=true  → SSE stream (chunks + done with updatedAt)
 *   ?force=true   → bypass cache (with stream=true)
 * Body: { slug?, teamName, tier?, upcomingGames, lastWeek, atsSummary, headlines }
 * Uses only the provided payload; no external API calls. Cache 30 min per team.
 * Non-stream: returns { summary, updatedAt }. Stream: sends data: { text?, done?, updatedAt?, error?, message? }.
 */

import { getQueryParam } from '../_requestUrl.js';

const CACHE_TTL_MS = 30 * 60 * 1000;
const OPENAI_MODEL = 'gpt-4o-mini';

const teamCache = {};

function cacheKey(slug, payloadHash) {
  return slug ? `${slug}:${payloadHash}` : `anon:${payloadHash}`;
}

function hashPayload(payload) {
  const str = JSON.stringify({
    teamName: payload.teamName,
    tier: payload.tier,
    seed: payload.seed,
    upcomingGames: payload.upcomingGames,
    lastWeek: payload.lastWeek,
    atsSummary: payload.atsSummary,
    headlines: (payload.headlines || []).map((h) => (h && typeof h === 'object' ? h.title : h)),
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return String(hash);
}

function send(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
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

  const streamParam = getQueryParam(req, 'stream');
  const forceParam = getQueryParam(req, 'force');
  const stream = streamParam === 'true' || streamParam === '1';
  const force = forceParam === 'true' || forceParam === '1';
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  if (isDev) console.log('[api/summary/team] parsed', { stream, force });

  let body = {};
  try {
    body = await parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const teamName = typeof body.teamName === 'string' ? body.teamName.trim() : (slug && slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) || 'Team';
  const tier = typeof body.tier === 'string' ? body.tier.trim() : (body.tier != null ? String(body.tier) : '');
  const seed = body.seed != null ? Number(body.seed) : null;
  const upcomingGames = Array.isArray(body.upcomingGames) ? body.upcomingGames : [];
  const lastWeek = Array.isArray(body.lastWeek) ? body.lastWeek : [];
  const atsSummary = body.atsSummary != null ? body.atsSummary : {};
  const headlines = Array.isArray(body.headlines) ? body.headlines : [];

  const payload = { teamName, tier, seed, upcomingGames, lastWeek, atsSummary, headlines };
  const key = cacheKey(slug || 'team', hashPayload(payload));
  const cached = teamCache[key];

  if (!stream) {
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    if (cached && Date.now() < cached.expires && !force) {
      return res.status(200).json({ summary: cached.summary, updatedAt: cached.updatedAt });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      return res.status(200).json({ summary: null, updatedAt: null, message: 'Summary unavailable.' });
    }
    const { systemPrompt, userPrompt } = buildPrompts({ teamName, tier, seed, upcomingGames, lastWeek, atsSummary, headlines });
    try {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 380,
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

  // Streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    send(res, { error: true, message: 'Summary unavailable — OpenAI key not configured.' });
    return res.end();
  }

  if (cached && Date.now() < cached.expires && !force) {
    if (cached.summary) {
      send(res, { text: cached.summary, done: true, updatedAt: cached.updatedAt });
    } else {
      send(res, { done: true, updatedAt: cached.updatedAt });
    }
    return res.end();
  }

  const { systemPrompt, userPrompt } = buildPrompts({ teamName, tier, seed, upcomingGames, lastWeek, atsSummary, headlines });

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 380,
        temperature: 0.3,
        stream: true,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI team stream error:', openaiRes.status, errBody);
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
          } catch (_) {}
        }
      }
    }

    const updatedAt = new Date().toISOString();
    teamCache[key] = {
      summary: fullContent.trim() || null,
      updatedAt,
      expires: Date.now() + CACHE_TTL_MS,
    };

    send(res, { done: true, updatedAt });
  } catch (err) {
    console.error('Team summary stream error:', err.message);
    send(res, { error: true, message: 'Summary unavailable — try again later.' });
  }
  res.end();
}

function _isInTournamentWindow() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const n = Number(d);
  return n >= 20260315 && n <= 20260407;
}

function buildPrompts({ teamName, tier, seed, upcomingGames, lastWeek, atsSummary, headlines }) {
  const isTournament = _isInTournamentWindow();

  const systemPrompt = isTournament
    ? `You are a concise March Madness analyst for Maximus Sports. Write a tournament-focused insight in 2–3 sentences. Use ONLY the data provided.

Priority order:
1) Tournament status: seed, whether they are still alive or eliminated, current round.
2) Next opponent or most recent tournament result (with score if available).
3) ATS performance or betting angle if data exists.
4) One sentence of relevant news context from headlines.

Frame everything as March Madness intel. Mention seed number when available. Be specific and current. Do NOT write generic season summaries — this is tournament time. Keep it concise and card-friendly.`
    : `You are a concise sports analyst for Maximus Sports. Write a short, friendly team insight in 2–3 sentences. Use ONLY the data provided.

Include when data exists:
1) Upcoming games (mention opponents).
2) NCAA bracket tier/tournament prospects (use the team's tier: Lock, Should be in, Work to do, Long shot).
3) Recent results and ATS performance.
4) One sentence of relevant news from headlines.

Avoid bullet points. Keep it conversational and card-friendly. If a section has no data, skip it.`;

  const seedLine = seed != null ? `Tournament seed: No. ${seed}` : '';
  const userPrompt = `Team: ${teamName}
${seedLine}
Tier (NCAA prospects): ${tier || 'Not specified'}
Upcoming games: ${JSON.stringify(upcomingGames)}
Recent results: ${JSON.stringify(lastWeek)}
ATS summary: ${JSON.stringify(atsSummary)}
Headlines: ${JSON.stringify(headlines)}

Write the team insight using only the data above.`;

  return { systemPrompt, userPrompt };
}
