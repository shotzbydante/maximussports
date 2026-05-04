/* global process */
/**
 * GET /api/version
 *
 * Returns the deploy fingerprint so any caller (or future audit doc) can
 * deterministically confirm what is running in production:
 *
 *   {
 *     ok: true,
 *     timestamp: ISO,
 *     git: { sha, shortSha, branch, buildTime },
 *     model: { nba, mlb }
 *   }
 *
 * Vercel auto-injects `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, and
 * `VERCEL_DEPLOYMENT_ID` into the runtime; we read those when present and
 * fall back to "unknown" locally so the endpoint is non-fatal.
 *
 * The model versions come from the actual builder modules — never hand-coded
 * — so a missed bump here can't make a stale model look fresh.
 */

import { NBA_MODEL_VERSION } from '../src/features/nba/picks/v2/buildNbaPicksV2.js';

let MLB_MODEL_VERSION = 'mlb-picks-unknown';
try {
  // Lazy-import so MLB tuning churn never breaks the version endpoint.
  const mod = await import('../src/features/picks/tuning/defaultConfig.js');
  if (mod?.MLB_MODEL_VERSION) MLB_MODEL_VERSION = mod.MLB_MODEL_VERSION;
} catch { /* keep fallback */ }

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
  const deploymentId = readEnv('VERCEL_DEPLOYMENT_ID') || null;

  return res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    git: {
      sha,
      shortSha: sha === 'unknown' ? sha : sha.slice(0, 7),
      branch,
      buildTime,
      deploymentId,
    },
    model: { nba: NBA_MODEL_VERSION, mlb: MLB_MODEL_VERSION },
  });
}
