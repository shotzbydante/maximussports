/**
 * Health check. GET /api/health
 *
 * Returns 200 with deploy metadata for monitoring AND post-deploy
 * verification. Adding `git.sha` and `model.*` here makes it possible
 * to confirm a v9/v10 fix is actually live in production with a single
 * curl, instead of inspecting picks-payload internals.
 *
 * `/api/version` returns the same shape — keep them in sync.
 */

import { NBA_MODEL_VERSION } from '../src/features/nba/picks/v2/buildNbaPicksV2.js';

let MLB_MODEL_VERSION = 'mlb-picks-unknown';
try {
  const mod = await import('../src/features/picks/tuning/defaultConfig.js');
  if (mod?.MLB_MODEL_VERSION) MLB_MODEL_VERSION = mod.MLB_MODEL_VERSION;
} catch { /* fall back */ }

function readEnv(name) {
  const v = process.env?.[name];
  return v && String(v).length > 0 ? String(v) : null;
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sha = readEnv('VERCEL_GIT_COMMIT_SHA') || readEnv('GIT_COMMIT_SHA') || 'unknown';
  const branch = readEnv('VERCEL_GIT_COMMIT_REF') || readEnv('GIT_BRANCH') || 'unknown';
  const buildTime = readEnv('VERCEL_BUILD_TIME') || readEnv('BUILD_TIME') || null;

  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    git: { sha, shortSha: sha === 'unknown' ? sha : sha.slice(0, 7), branch, buildTime },
    model: { nba: NBA_MODEL_VERSION, mlb: MLB_MODEL_VERSION },
  });
}
