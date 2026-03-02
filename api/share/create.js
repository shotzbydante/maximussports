/**
 * POST /api/share/create
 *
 * Creates a shareable link for an insight card.
 * Stores payload in KV under `share:{id}` with 30-day TTL.
 *
 * Request body (JSON):
 *   { type, title, subtitle?, meta?, teamSlug?, destinationPath }
 *
 * Response:
 *   { id, url }   — on success
 *   { error }     — on failure (fallback: client should use destinationPath directly)
 *
 * Rate limiting: 10 creates per session UUID per 60s (stored in KV, soft limit).
 * Privacy-safe: no PII accepted or stored.
 */

import { getJson, setJson } from '../_globalCache.js';

const SHARE_TTL_SEC  = 30 * 24 * 60 * 60; // 30 days
const RATE_TTL_SEC   = 60;                 // 60-second rate limit window
const RATE_MAX       = 10;                 // max creates per window per session
const ID_LENGTH      = 10;
const MAX_TITLE_LEN  = 120;
const MAX_SUB_LEN    = 200;
const MAX_META_LEN   = 80;
const MAX_PATH_LEN   = 200;
const MAX_SLUG_LEN   = 60;
const MAX_TYPE_LEN   = 40;

const ALLOWED_TYPES = new Set([
  'upset_watch', 'ats_intel', 'odds_insight', 'team_intel', 'bracket_bust', 'matchup',
]);

function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  // Use Math.random — crypto not available in all Node serverless envs.
  // IDs don't need to be cryptographically secure; they are public.
  for (let i = 0; i < ID_LENGTH; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function clamp(val, max) {
  if (!val || typeof val !== 'string') return '';
  return val.slice(0, max);
}

function sanitize(str) {
  if (!str) return '';
  // Strip control chars and potential injection
  return String(str).replace(/[\x00-\x1F\x7F<>]/g, ' ').trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    // Parse body — works for both Vercel Node.js and standard Node.js
    if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const {
    type        = '',
    title       = '',
    subtitle    = '',
    meta        = '',
    teamSlug    = '',
    destinationPath = '/',
    sessionId   = '',
  } = body;

  // Validate required fields
  const cleanTitle = sanitize(clamp(title, MAX_TITLE_LEN));
  if (!cleanTitle) {
    return res.status(400).json({ error: 'title is required' });
  }

  const cleanType = sanitize(clamp(type, MAX_TYPE_LEN));
  if (cleanType && !ALLOWED_TYPES.has(cleanType)) {
    return res.status(400).json({ error: 'invalid type' });
  }

  // Soft rate limit by session UUID (no PII — just a random browser-side UUID)
  if (sessionId && typeof sessionId === 'string' && sessionId.length < 64) {
    const rateKey = `share:rate:${sessionId.replace(/[^a-z0-9-]/gi, '')}`;
    try {
      const current = (await getJson(rateKey)) ?? 0;
      if (current >= RATE_MAX) {
        return res.status(429).json({ error: 'too_many_requests' });
      }
      // Increment — fire-and-forget (don't block response)
      setJson(rateKey, current + 1, { exSeconds: RATE_TTL_SEC }).catch(() => {});
    } catch {
      // KV failure → allow through
    }
  }

  const id = generateId();
  const origin = (() => {
    try {
      const proto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() ?? 'https';
      const host  = req.headers['x-forwarded-host']?.split(',')[0]?.trim()
                 ?? req.headers['host']?.split(',')[0]?.trim()
                 ?? 'maximussports.ai';
      return `${proto}://${host}`;
    } catch {
      return 'https://maximussports.ai';
    }
  })();

  const payload = {
    type:            sanitize(cleanType),
    title:           cleanTitle,
    subtitle:        sanitize(clamp(subtitle, MAX_SUB_LEN)),
    meta:            sanitize(clamp(meta, MAX_META_LEN)),
    teamSlug:        sanitize(clamp(teamSlug, MAX_SLUG_LEN)),
    destinationPath: sanitize(clamp(destinationPath, MAX_PATH_LEN)) || '/',
    createdAt:       new Date().toISOString(),
  };

  try {
    await setJson(`share:${id}`, payload, { exSeconds: SHARE_TTL_SEC });
  } catch {
    // KV unavailable — return fallback so client can still copy the raw destination URL
    return res.status(200).json({
      id: null,
      url: `${origin}${payload.destinationPath}`,
      fallback: true,
    });
  }

  return res.status(200).json({
    id,
    url: `${origin}/share/${id}`,
    fallback: false,
  });
}
