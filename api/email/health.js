/**
 * GET /api/email/health
 *
 * Admin-only diagnostic endpoint for the email system.
 * Checks: Resend API reachability, Supabase connectivity,
 * email_job_runs table existence, cron schedule status,
 * and latest run details per digest type.
 *
 * Auth: Authorization: Bearer <supabase-access-token>
 * Access: admin user only
 */

import { verifyUserToken, getSupabaseAdmin, getEnvStatus } from '../_lib/supabaseAdmin.js';
import { isAdminEmail } from '../_lib/admin.js';

const DIGEST_TYPES = [
  'global_briefing',
  'mlb_briefing', 'mlb_team_digest', 'mlb_picks',
  'ncaam_briefing', 'ncaam_team_digest', 'ncaam_picks',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  let user;
  try { user = await verifyUserToken(token); } catch { return res.status(503).json({ error: 'Auth unavailable.' }); }
  if (!user || !isAdminEmail(user.email)) return res.status(403).json({ error: 'Admin access only.' });

  const checks = {};

  // 1. Environment variables
  const env = getEnvStatus();
  checks.environment = {
    supabaseUrl: env.hasUrl,
    supabaseUrlHost: env.urlHost,
    supabaseAnonKey: env.hasAnonKey,
    supabaseServiceRoleKey: env.hasServiceRoleKey,
    resendApiKey: Boolean(process.env.RESEND_API_KEY),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };

  // 2. Resend API reachability
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      checks.resend = { ok: false, error: 'RESEND_API_KEY not set' };
    } else {
      const resp = await fetch('https://api.resend.com/domains', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      checks.resend = {
        ok: resp.ok,
        status: resp.status,
        ...(resp.ok ? {} : { error: `API returned ${resp.status}` }),
      };
    }
  } catch (err) {
    checks.resend = { ok: false, error: err.message };
  }

  // 3. Supabase connectivity + table existence
  let sb;
  try {
    sb = getSupabaseAdmin();
    checks.supabaseAdmin = { ok: true };
  } catch (err) {
    checks.supabaseAdmin = { ok: false, error: err.message };
  }

  if (sb) {
    // Check email_job_runs table
    try {
      const { error } = await sb.from('email_job_runs').select('id').limit(1);
      checks.emailJobRunsTable = { ok: !error, ...(error ? { error: error.message, code: error.code } : {}) };
    } catch (err) {
      checks.emailJobRunsTable = { ok: false, error: err.message };
    }

    // Check email_send_log table
    try {
      const { error } = await sb.from('email_send_log').select('id').limit(1);
      checks.emailSendLogTable = { ok: !error, ...(error ? { error: error.message, code: error.code } : {}) };
    } catch (err) {
      checks.emailSendLogTable = { ok: false, error: err.message };
    }

    // Check auth.admin works
    try {
      const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
      checks.authAdmin = { ok: !error, userCount: data?.users?.length ?? 0, ...(error ? { error: error.message } : {}) };
    } catch (err) {
      checks.authAdmin = { ok: false, error: err.message };
    }

    // Latest runs per digest type
    const latestRuns = {};
    for (const dtype of DIGEST_TYPES) {
      try {
        const { data, error } = await sb
          .from('email_job_runs')
          .select('*')
          .eq('digest_type', dtype)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        latestRuns[dtype] = error ? { error: error.message } : (data || null);
      } catch {
        latestRuns[dtype] = null;
      }
    }
    checks.latestRuns = latestRuns;
  }

  // 4. Overall health
  const allOk =
    checks.environment?.supabaseUrl &&
    checks.environment?.supabaseServiceRoleKey &&
    checks.environment?.resendApiKey &&
    checks.resend?.ok &&
    checks.supabaseAdmin?.ok &&
    checks.emailJobRunsTable?.ok &&
    checks.emailSendLogTable?.ok;

  return res.status(200).json({
    ok: allOk,
    timestamp: new Date().toISOString(),
    checks,
  });
}
