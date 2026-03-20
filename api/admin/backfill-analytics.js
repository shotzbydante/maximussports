/**
 * POST /api/admin/backfill-analytics
 *
 * Historical recovery: fires PostHog `account_created` events for all existing
 * users (auth.users + profiles) who were never tracked by PostHog.
 *
 * Idempotent: uses email_send_log rows with type='posthog_account_created' to
 * track which users have been backfilled. Safe to run multiple times.
 *
 * Preserves original timestamps: uses auth.users.created_at as the PostHog
 * event timestamp so historical analytics are accurate.
 *
 * Protected: requires valid Bearer token (same as backfill-profiles).
 *
 * Query params:
 *   ?dry_run=true   — preview what would be backfilled without sending events
 *   ?limit=N        — process at most N users (default: all)
 */

/* global process */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { captureAccountCreated, isTestEmail } from '../_lib/posthogServer.js';

const TRACKING_TYPE = 'posthog_account_created';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let caller;
  try {
    caller = await verifyUserToken(token);
  } catch {
    return res.status(503).json({ error: 'Auth unavailable' });
  }
  if (!caller?.id) return res.status(401).json({ error: 'Invalid token' });

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ error: 'DB unavailable' });
  }

  const _url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const dryRun = _url.searchParams.get('dry_run') === 'true';
  const limitParam = parseInt(_url.searchParams.get('limit'), 10);
  const maxUsers = isFinite(limitParam) && limitParam > 0 ? limitParam : Infinity;

  const report = {
    dryRun,
    authUsersScanned: 0,
    alreadyTracked: 0,
    backfilled: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  try {
    // 1. Get all auth users (paginated)
    const authUsers = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
      if (error) {
        report.errors.push(`listUsers page ${page}: ${error.message}`);
        break;
      }
      const users = data?.users || [];
      authUsers.push(...users);
      if (users.length < perPage) break;
      page++;
    }
    report.authUsersScanned = authUsers.length;
    console.log(`[backfill-analytics] Scanned ${authUsers.length} auth users`);

    if (authUsers.length === 0) {
      return res.status(200).json(report);
    }

    // 2. Get all profiles (for username lookup)
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, display_name')
      .limit(5000);
    const profileMap = {};
    for (const p of (profiles || [])) profileMap[p.id] = p;

    // 3. Get already-tracked users (idempotency)
    const { data: tracked } = await sb
      .from('email_send_log')
      .select('user_id')
      .eq('type', TRACKING_TYPE);
    const trackedSet = new Set((tracked || []).map(r => r.user_id));
    report.alreadyTracked = trackedSet.size;

    // 4. Process each user
    let processed = 0;
    for (const authUser of authUsers) {
      if (processed >= maxUsers) break;

      if (trackedSet.has(authUser.id)) {
        continue;
      }

      if (!authUser.email) {
        report.skipped++;
        continue;
      }

      const profile = profileMap[authUser.id] || null;
      const username = profile?.username || null;
      const createdAt = authUser.created_at || null;

      if (dryRun) {
        report.details.push({
          id: authUser.id.slice(0, 8),
          email: authUser.email,
          username,
          created_at: createdAt,
          is_test_user: isTestEmail(authUser.email),
          action: 'would_backfill',
        });
        report.backfilled++;
        processed++;
        continue;
      }

      try {
        const ok = await captureAccountCreated(authUser, {
          sourcePath: 'historical_backfill',
          username,
          timestamp: createdAt,
        });

        if (ok) {
          // Mark as tracked for idempotency
          await sb.from('email_send_log').insert({
            user_id: authUser.id,
            email: authUser.email,
            type: TRACKING_TYPE,
            date_key: `${TRACKING_TYPE}_${authUser.id}`,
            sent_at: new Date().toISOString(),
          }).catch(logErr => {
            console.warn(`[backfill-analytics] tracking insert failed for ${authUser.id}:`, logErr?.message);
          });

          report.backfilled++;
          report.details.push({
            id: authUser.id.slice(0, 8),
            email: authUser.email,
            username,
            created_at: createdAt,
            action: 'backfilled',
          });
        } else {
          report.failed++;
          report.errors.push(`PostHog capture failed for ${authUser.id.slice(0, 8)}`);
        }
      } catch (err) {
        report.failed++;
        report.errors.push(`${authUser.id.slice(0, 8)}: ${err.message}`);
      }

      processed++;

      // Small delay to avoid overwhelming PostHog
      if (processed % 10 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } catch (err) {
    report.errors.push(`fatal: ${err.message}`);
  }

  console.log(
    `[backfill-analytics] ${dryRun ? 'DRY RUN' : 'DONE'}: ` +
    `scanned=${report.authUsersScanned} tracked=${report.alreadyTracked} ` +
    `backfilled=${report.backfilled} failed=${report.failed} errors=${report.errors.length}`
  );
  return res.status(200).json(report);
}
