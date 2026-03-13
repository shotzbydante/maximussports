/**
 * GET /api/email/job-status
 *
 * Returns the latest job run status for each digest type.
 * Admin-only — requires a valid admin JWT.
 *
 * Response:
 * {
 *   ok: true,
 *   runs: {
 *     daily:      { status, started_at, completed_at, sent_count, failed_count, ... } | null,
 *     pinned:     { ... } | null,
 *     odds:       { ... } | null,
 *     news:       { ... } | null,
 *     teamDigest: { ... } | null,
 *   }
 * }
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { isAdminEmail } from '../_lib/admin.js';

const DIGEST_TYPES = ['daily', 'pinned', 'odds', 'news', 'teamDigest'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  let user;
  try {
    user = await verifyUserToken(token);
  } catch {
    return res.status(503).json({ error: 'Auth service unavailable.' });
  }

  if (!user || !isAdminEmail(user.email)) {
    return res.status(403).json({ error: 'Admin access only.' });
  }

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ error: 'Database service unavailable.' });
  }

  const runs = {};
  for (const dtype of DIGEST_TYPES) {
    try {
      const { data, error } = await sb
        .from('email_job_runs')
        .select('*')
        .eq('digest_type', dtype)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`[job-status] query error for ${dtype}:`, error.message);
        runs[dtype] = null;
      } else {
        runs[dtype] = data || null;
      }
    } catch (err) {
      console.warn(`[job-status] exception for ${dtype}:`, err.message);
      runs[dtype] = null;
    }
  }

  return res.status(200).json({ ok: true, runs });
}
