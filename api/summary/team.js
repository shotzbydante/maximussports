/**
 * Vercel Serverless: Short ChatGPT summary for a pinned team card (1–2 sentences).
 * POST /api/summary/team with body { slug, headlines: [{ title, source? }] }.
 * Uses only the provided headlines; no external API calls. Cache ~30 min per team slug.
 */

import crypto from 'node:crypto';

const CACHE_TTL_MS = 30 * 60 * 1000;
const OPENAI_MODEL = 'gpt-4o-mini';

const teamCache = {};

function hashHeadlines(headlines) {
  const key = JSON.stringify(headlines.map((h) => h.title || '').sort());
  return crypto.createHash('sha256').update(key).digest('hex');
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
  const headlines = Array.isArray(body.headlines) ? body.headlines : [];

  if (!slug) {
    return res.status(400).json({ error: 'Missing slug' });
  }

  if (headlines.length === 0) {
    return res.status(200).json({ summary: null, message: 'Summary unavailable — no headlines for this team.' });
  }

  const cacheKey = `${slug}:${hashHeadlines(headlines)}`;
  const cached = teamCache[cacheKey];
  if (cached && Date.now() < cached.expires) {
    return res.status(200).json({ summary: cached.value });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.status(200).json({ summary: null, message: 'Summary unavailable.' });
  }

  const teamName = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').replace(/\s+/g, ' ');
  const headlinesText = headlines.map((h) => `- ${h.title || ''} (${h.source || ''})`).join('\n');

  const systemPrompt = 'You are a sports news summarizer. In 1–2 short sentences, summarize the key themes or news for this team based ONLY on the headlines below. Be concise and factual.';
  const userPrompt = `Team: ${teamName}\n\nHeadlines:\n${headlinesText}\n\nWrite 1–2 sentences summarizing this team's news.`;

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
        max_tokens: 120,
        temperature: 0.3,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI team summary error:', openaiRes.status, errBody);
      return res.status(200).json({ summary: null, message: 'Summary unavailable.' });
    }

    const data = await openaiRes.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || null;

    teamCache[cacheKey] = { value: summary, expires: Date.now() + CACHE_TTL_MS };

    return res.status(200).json({ summary });
  } catch (err) {
    console.error('Team summary API error:', err.message);
    return res.status(200).json({ summary: null, message: 'Summary unavailable.' });
  }
}
