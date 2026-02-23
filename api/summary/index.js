/**
 * Vercel Serverless: Dynamic Home synopsis via OpenAI (SSE streaming).
 * GET /api/summary?stream=true&force=true to bypass cache and stream.
 * Data sources: ESPN (scores, rankings), Odds API (spreads, ATS), Google/Yahoo (news).
 * Caches result 30 min. Requires OPENAI_API_KEY.
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

function getPstDateOnly() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function parseSpread(s) {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** ATS: spread is for away team. Returns { awayATS, homeATS } */
function computeATS(awayScore, homeScore, spreadStr) {
  const spread = parseSpread(spreadStr);
  if (spread == null) return { awayATS: null, homeATS: null };
  const a = parseFloat(awayScore);
  const h = parseFloat(homeScore);
  if (isNaN(a) || isNaN(h)) return { awayATS: null, homeATS: null };
  const awayAdj = a + spread;
  const margin = awayAdj - h;
  let awayATS = 'P';
  if (Math.abs(margin) > 0.001) awayATS = margin > 0 ? 'W' : 'L';
  const homeMargin = h - spread - a;
  let homeATS = 'P';
  if (Math.abs(homeMargin) > 0.001) homeATS = homeMargin > 0 ? 'W' : 'L';
  return { awayATS, homeATS };
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
  const debug = req.query?.debug === 'true' || req.query?.debug === '1';

  if (!stream && !debug) {
    return res.status(400).json({ error: 'Use ?stream=true or ?debug=true' });
  }

  if (debug) {
    res.setHeader('Content-Type', 'application/json');
  } else {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!debug && (!apiKey || apiKey.trim() === '')) {
    send(res, { error: true, message: 'Summary unavailable — OpenAI key not configured.' });
    return res.end();
  }

  if (!debug && !force && cache.value != null && cache.updatedAt != null && Date.now() < cache.expires) {
    send(res, { text: cache.value, done: true, updatedAt: cache.updatedAt });
    return res.end();
  }

  const baseUrl = getBaseUrl(req);
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

  let scoresToday = [];
  let scoresYesterday = [];
  let rankings = [];
  let headlines = [];
  let oddsGames = [];
  let oddsHistoryGames = [];

  const todayPst = getPstDateOnly();
  const todayYMD = todayPst.replace(/-/g, '');
  const yesterday = new Date(todayPst + 'T12:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yesterdayYMD = yesterdayStr.replace(/-/g, '');

  try {
    const [todayRes, yesterdayRes, rankingsRes, newsRes, oddsRes, historyRes] = await Promise.allSettled([
      fetchJson(baseUrl, '/api/scores'),
      fetchJson(baseUrl, `/api/scores?date=${yesterdayYMD}`),
      fetchJson(baseUrl, '/api/rankings'),
      fetchJson(baseUrl, '/api/news/aggregate?includeNational=true'),
      fetchJson(baseUrl, '/api/odds').catch(() => ({ games: [] })),
      fetchJson(baseUrl, `/api/odds-history?from=${yesterdayStr}&to=${todayPst}`).catch(() => ({ games: [] })),
    ]);

    if (todayRes.status === 'fulfilled') {
      const data = todayRes.value;
      scoresToday = Array.isArray(data) ? data : (data?.games || []);
    }
    if (yesterdayRes.status === 'fulfilled') {
      const data = yesterdayRes.value;
      scoresYesterday = Array.isArray(data) ? data : (data?.games || []);
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
    if (historyRes.status === 'fulfilled' && historyRes.value?.games) {
      oddsHistoryGames = historyRes.value.games;
    }
  } catch (err) {
    console.error('Summary API data fetch error:', err.message);
  }

  const allScores = [...scoresYesterday, ...scoresToday];
  const finalGames = allScores
    .filter((g) => {
      const s = (g.gameStatus || '').toLowerCase();
      return s === 'final' || s.includes('final');
    })
    .map((g) => {
      const o = matchOdds(g, oddsHistoryGames) || matchOdds(g, oddsGames);
      const spread = o?.spread;
      const { awayATS, homeATS } = computeATS(g.awayScore, g.homeScore, spread);
      return {
        ...g,
        spread,
        awayATS: awayATS || null,
        homeATS: homeATS || null,
      };
    });

  const upcomingGames = scoresToday
    .filter((g) => {
      const s = (g.gameStatus || '').toLowerCase();
      return s !== 'final' && !s.includes('final') && (g.homeTeam || g.awayTeam);
    })
    .map((g) => {
      const o = matchOdds(g, oddsGames);
      return { ...g, spread: o?.spread };
    });

  // Counts: only mark a source "unavailable" when count = 0
  const scoresCount = allScores.length;
  const rankingsCount = rankings.length;
  const oddsCount = oddsGames.length;
  const oddsHistoryCount = oddsHistoryGames.length;
  const headlinesCount = headlines.length;

  const espnOk = scoresCount > 0 || rankingsCount > 0;
  const oddsOk = oddsCount > 0 || oddsHistoryCount > 0;
  const newsOk = headlinesCount > 0;

  const dataStatusLine = [
    `ESPN: ${espnOk ? `OK (${scoresCount} scores, ${rankingsCount} ranked teams)` : 'MISSING'}`,
    `Odds: ${oddsOk ? `OK (${oddsCount} spreads, ${oddsHistoryCount} ATS)` : 'MISSING'}`,
    `News: ${newsOk ? `OK (${headlinesCount} headlines)` : 'MISSING'}`,
  ].join('. ');
  const dataStatusPrompt = `DATA STATUS — ${dataStatusLine}`;

  if (debug) {
    const sampleScore = finalGames[0] || upcomingGames[0] || allScores[0]
      ? `${(finalGames[0] || upcomingGames[0] || allScores[0]).awayTeam} @ ${(finalGames[0] || upcomingGames[0] || allScores[0]).homeTeam}`
      : null;
    const sampleHeadline = headlines[0] ? headlines[0].title : null;
    return res.status(200).json({
      scoresCount,
      rankingsCount,
      oddsCount,
      oddsHistoryCount,
      headlinesCount,
      sampleScore,
      sampleHeadline,
      dataStatusLine: dataStatusPrompt,
    });
  }

  const pstDate = getPstDate();
  const top25List = rankings.slice(0, 25).map((r) => `#${r.rank} ${r.teamName}`).join(', ') || 'None';

  const last24hLines = finalGames.map((g) => {
    const spread = g.spread != null ? ` spread ${g.spread}` : '';
    const ats = g.awayATS != null ? ` (ATS: away ${g.awayATS}, home ${g.homeATS})` : '';
    return `${g.awayTeam} ${g.awayScore ?? '-'} @ ${g.homeTeam} ${g.homeScore ?? '-'}${spread}${ats}`;
  });
  const last24hText = last24hLines.length ? last24hLines.join('\n') : 'No games in the last 24 hours with final scores.';

  const upcomingLines = upcomingGames.slice(0, 12).map((g) => {
    const spread = g.spread != null ? ` — spread: ${g.spread}` : '';
    return `${g.awayTeam} @ ${g.homeTeam}${spread} (${g.gameStatus || 'Upcoming'})`;
  });
  const upcomingText = upcomingLines.length ? upcomingLines.join('\n') : 'No upcoming games listed.';

  const headlinesText = headlines.length
    ? headlines.map((h) => `- ${h.title} (${h.source})`).join('\n')
    : 'No headlines available.';

  const dataAvailability = [
    espnOk ? 'ESPN (scores, rankings)' : 'ESPN data unavailable',
    oddsOk ? 'Odds API (spreads, ATS)' : 'Odds API data unavailable',
    newsOk ? 'Google/Yahoo news' : 'News (Google/Yahoo) unavailable',
  ].join('; ');

  const systemPrompt = `You are a friendly sports host for Maximus Sports. Write a conversational daily briefing. Use short paragraphs, not long bullet lists.

DATA SOURCES (reference explicitly when present):
- ESPN: schedules, scores, and Top 25 rankings.
- Odds API: spreads and ATS (Against The Spread) outcomes.
- Google / Yahoo: news headlines tied to teams.

RULES:
1. Use the "DATA STATUS" line in the user message: only say a source is "unavailable" or "missing" when that source is marked MISSING there. If ESPN/Odds/News show OK with counts, do NOT say they are unavailable.
2. Every game you mention MUST include its spread and ATS result (Cover/Loss/Push) where that data is available. If spread or ATS is missing for a game, say "spread/ATS unavailable" for that game.
3. Build the recap from the actual data provided: when game/headline lists are empty, briefly note that; when not empty, reference real games and headlines by name.
4. Include when data exists: (a) Games in the last 24 hours with final score and ATS outcome, (b) Upcoming games with spreads, (c) Top 25 context from ESPN, (d) 2–4 headlines tied to those teams.
5. Style: "Here's the rundown for today…" and "Looking ahead to tomorrow…" Short paragraphs, narrative tone.`;

  const userPrompt = `Today's date (PST): ${pstDate}

${dataStatusPrompt}

Data availability: ${dataAvailability}

--- ESPN: AP Top 25 (rankings) ---
${top25List}

--- ESPN: Games in the last 24 hours (final scores). Odds API: spread + ATS where available ---
${last24hText}

--- Upcoming games (Odds API: spreads when available) ---
${upcomingText}

--- Google / Yahoo: Headlines (tie 2–4 to the teams above) ---
${headlinesText}

Write a conversational daily recap. Mention ESPN for scores/rankings, Odds API for spreads and ATS, and Google/Yahoo for news. For every game you mention, include spread and ATS result where applicable. If any data source was unavailable, say so. Use 2–4 short paragraphs.`;

  // Send data status first so client can show badges (e.g. ?debug=true verification)
  send(res, {
    dataStatus: {
      scoresCount,
      rankingsCount,
      oddsCount,
      oddsHistoryCount,
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
