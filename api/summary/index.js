/**
 * Vercel Serverless: Dynamic Home synopsis via OpenAI (SSE streaming).
 * POST /api/summary with body { top25, atsLeaders, recentGames, upcomingGames, headlines }.
 * No internal API calls — uses only the payload. Cache keyed by payload hash (30 min).
 * Rate limit: max 1 refresh per 60 seconds per IP; if exceeded, returns cached summary with message.
 * GET ?stream=true no longer used; use POST with body. GET ?debug=true with POST body returns counts only.
 */

import crypto from 'node:crypto';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_MS = 60 * 1000; // 1 minute
const OPENAI_MODEL = 'gpt-4o-mini';

const cacheByHash = {};
const lastRequestByIp = {};

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function getPstDate() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function send(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function getClientIp(req) {
  return req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.headers?.['x-real-ip'] || 'unknown';
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const stream = req.query?.stream === 'true' || req.query?.stream === '1';
  const force = req.query?.force === 'true' || req.query?.force === '1';
  const debug = req.query?.debug === 'true' || req.query?.debug === '1';

  if (req.method === 'GET') {
    if (debug) {
      return res.status(400).json({ error: 'Send POST with payload body for summary or debug.' });
    }
    return res.status(400).json({ error: 'Use POST with body { top25, atsLeaders, recentGames, upcomingGames, headlines } and ?stream=true' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = await parseBody(req);
  const top25 = Array.isArray(payload.top25) ? payload.top25.slice(0, 25) : [];
  const atsLeaders = payload.atsLeaders && typeof payload.atsLeaders === 'object'
    ? {
        best: Array.isArray(payload.atsLeaders.best) ? payload.atsLeaders.best.slice(0, 10) : [],
        worst: Array.isArray(payload.atsLeaders.worst) ? payload.atsLeaders.worst.slice(0, 10) : [],
      }
    : { best: [], worst: [] };
  const recentGames = Array.isArray(payload.recentGames) ? payload.recentGames.slice(0, 20) : [];
  const upcomingGames = Array.isArray(payload.upcomingGames) ? payload.upcomingGames.slice(0, 20) : [];
  const headlines = Array.isArray(payload.headlines) ? payload.headlines.slice(0, 10) : [];

  const normalized = { top25, atsLeaders, recentGames, upcomingGames, headlines };
  const hash = hashPayload(normalized);

  const top25Count = top25.length;
  const atsBestCount = atsLeaders.best.length;
  const atsWorstCount = atsLeaders.worst.length;
  const recentCount = recentGames.length;
  const upcomingCount = upcomingGames.length;
  const headlinesCount = headlines.length;

  const dataStatusLine = [
    `Top 25: ${top25Count > 0 ? `OK (${top25Count})` : 'MISSING'}`,
    `ATS leaders: ${atsBestCount + atsWorstCount > 0 ? `OK (${atsBestCount} best, ${atsWorstCount} worst)` : 'MISSING'}`,
    `Recent games: ${recentCount > 0 ? `OK (${recentCount})` : 'MISSING'}`,
    `Upcoming: ${upcomingCount > 0 ? `OK (${upcomingCount})` : 'MISSING'}`,
    `Headlines: ${headlinesCount > 0 ? `OK (${headlinesCount})` : 'MISSING'}`,
  ].join('. ');
  const dataStatusPrompt = `DATA STATUS — ${dataStatusLine}`;

  if (debug) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      scoresCount: recentCount,
      rankingsCount: top25Count,
      oddsCount: upcomingCount,
      oddsHistoryCount: 0,
      headlinesCount,
      dataStatusLine: dataStatusPrompt,
      sampleScore: recentGames[0] ? `${recentGames[0].awayTeam || ''} @ ${recentGames[0].homeTeam || ''}` : null,
      sampleHeadline: headlines[0]?.title ?? null,
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    send(res, { error: true, message: 'Summary unavailable — OpenAI key not configured.' });
    return res.end();
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const cached = cacheByHash[hash];
  const rateLimited = lastRequestByIp[ip] != null && (now - lastRequestByIp[ip]) < RATE_LIMIT_MS;

  if (cached && Date.now() < cached.expires && !force) {
    send(res, {
      dataStatus: {
        scoresCount: recentCount,
        rankingsCount: top25Count,
        oddsCount: upcomingCount,
        oddsHistoryCount: 0,
        headlinesCount,
        dataStatusLine: dataStatusPrompt,
      },
    });
    if (cached.value) {
      send(res, { text: cached.value, done: true, updatedAt: cached.updatedAt });
    } else {
      send(res, { done: true, updatedAt: cached.updatedAt });
    }
    return res.end();
  }

  if (rateLimited) {
    const cachedForHash = cacheByHash[hash];
    if (cachedForHash?.value) {
      send(res, {
        dataStatus: {
          scoresCount: recentCount,
          rankingsCount: top25Count,
          oddsCount: upcomingCount,
          oddsHistoryCount: 0,
          headlinesCount,
          dataStatusLine: dataStatusPrompt,
        },
      });
      send(res, { text: cachedForHash.value, done: true, updatedAt: cachedForHash.updatedAt, rateLimitMessage: 'Please wait a minute before refreshing again.' });
      return res.end();
    }
    send(res, { error: true, message: 'Please wait a minute before refreshing again.' });
    return res.end();
  }

  lastRequestByIp[ip] = now;

  const top25List = top25.map((r) => (r.rank != null && r.teamName != null ? `#${r.rank} ${r.teamName}` : r.teamName || r.name || '')).filter(Boolean).join(', ') || 'None';
  const recentLines = recentGames.map((g) => {
    const away = g.awayTeam || '';
    const home = g.homeTeam || '';
    const awayScore = g.awayScore ?? '-';
    const homeScore = g.homeScore ?? '-';
    const spread = g.spread != null ? ` spread ${g.spread}` : '';
    const ats = g.awayATS != null ? ` (ATS: away ${g.awayATS}, home ${g.homeATS})` : '';
    return `${away} ${awayScore} @ ${home} ${homeScore}${spread}${ats}`;
  });
  const recentText = recentLines.length ? recentLines.join('\n') : 'No recent games with final scores.';
  const upcomingLines = upcomingGames.map((g) => {
    const spread = g.spread != null ? ` — spread: ${g.spread}` : '';
    return `${g.awayTeam || ''} @ ${g.homeTeam || ''}${spread} (${g.gameStatus || 'Upcoming'})`;
  });
  const upcomingText = upcomingLines.length ? upcomingLines.join('\n') : 'No upcoming games listed.';
  const atsBestText = atsLeaders.best.length
    ? atsLeaders.best.map((r, i) => `${i + 1}. ${r.name || r.slug || ''} ${r.rec ? `${r.rec.w}-${r.rec.l}${(r.rec.p > 0 ? `-${r.rec.p}` : '')} (${r.rec.coverPct ?? ''}%)` : ''}`).join('\n')
    : 'No ATS best data.';
  const atsWorstText = atsLeaders.worst.length
    ? atsLeaders.worst.map((r, i) => `${atsLeaders.worst.length - i}. ${r.name || r.slug || ''} ${r.rec ? `${r.rec.w}-${r.rec.l}${(r.rec.p > 0 ? `-${r.rec.p}` : '')}` : ''}`).join('\n')
    : 'No ATS worst data.';
  const headlinesText = headlines.length
    ? headlines.map((h) => `- ${h.title || ''} (${h.source || 'News'})`).join('\n')
    : 'No headlines available.';

  const systemPrompt = `You are a friendly sports host for Maximus Sports. Write a conversational daily briefing. Use short paragraphs, not long bullet lists.

RULES:
1. Use ONLY the data provided below. If an array is empty, explicitly state that part is unavailable.
2. Recap must include when data exists: (a) Top 25 results from recent games, (b) Upcoming Top 25 games with spreads, (c) ATS leaderboard highlights (best and worst), (d) Headlines.
3. Every game you mention should include spread and ATS result where that data is in the payload.
4. Style: "Here's the rundown for today…" and "Looking ahead…" Short paragraphs, narrative tone.`;

  const userPrompt = `Today's date (PST): ${getPstDate()}

${dataStatusPrompt}

--- Top 25 (rankings) ---
${top25List}

--- Recent games (final scores, spread + ATS where available) ---
${recentText}

--- Upcoming games (spreads when available) ---
${upcomingText}

--- ATS leaderboard: Top 10 (best cover %) ---
${atsBestText}

--- ATS leaderboard: Bottom 10 ---
${atsWorstText}

--- Headlines ---
${headlinesText}

Write a conversational daily recap using only the data above. If any section is empty or "None", say that part is unavailable. Use 2–4 short paragraphs.`;

  send(res, {
    dataStatus: {
      scoresCount: recentCount,
      rankingsCount: top25Count,
      oddsCount: upcomingCount,
      oddsHistoryCount: 0,
      headlinesCount,
      dataStatusLine: dataStatusPrompt,
    },
  });

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
        max_tokens: 700,
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
          } catch (_) {}
        }
      }
    }

    const updatedAt = new Date().toISOString();
    cacheByHash[hash] = {
      value: fullContent.trim() || null,
      updatedAt,
      expires: Date.now() + CACHE_TTL_MS,
    };

    send(res, { done: true, updatedAt });
    res.end();
  } catch (err) {
    console.error('Summary API OpenAI error:', err.message);
    send(res, { error: true, message: 'Summary unavailable — try again later.' });
    res.end();
  }
}
