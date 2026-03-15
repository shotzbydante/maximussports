/**
 * POST /api/admin/backfill-profiles
 *
 * Reconciles auth.users → profiles table.
 * For each auth user, ensures a profile row exists and has a display_name.
 *
 * Protected: requires valid Bearer token of an authenticated user.
 * Uses service-role key for all DB operations (bypasses RLS).
 *
 * Returns a report of what was created/updated.
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

function extractDisplayName(authUser) {
  const meta = authUser.user_metadata || {};
  return (
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    (authUser.email ? authUser.email.split('@')[0] : null)
  );
}

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

  const report = {
    authUsersScanned: 0,
    profilesExisted: 0,
    profilesCreated: 0,
    displayNamesBackfilled: 0,
    errors: [],
    details: [],
  };

  try {
    let page = 1;
    const perPage = 50;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
      if (error) {
        report.errors.push(`listUsers page ${page}: ${error.message}`);
        break;
      }

      const users = data?.users || [];
      if (users.length === 0) break;
      hasMore = users.length === perPage;
      report.authUsersScanned += users.length;

      for (const authUser of users) {
        const derivedName = extractDisplayName(authUser);

        const { data: existing } = await sb
          .from('profiles')
          .select('id, username, display_name')
          .eq('id', authUser.id)
          .maybeSingle();

        if (existing) {
          report.profilesExisted++;

          if (!existing.display_name && derivedName) {
            const { error: updateErr } = await sb
              .from('profiles')
              .update({ display_name: derivedName, updated_at: new Date().toISOString() })
              .eq('id', authUser.id);

            if (!updateErr) {
              report.displayNamesBackfilled++;
              report.details.push({
                id: authUser.id.slice(0, 8),
                email: authUser.email,
                action: 'backfilled_display_name',
                displayName: derivedName,
                username: existing.username || null,
              });
            } else {
              report.errors.push(`backfill ${authUser.id.slice(0, 8)}: ${updateErr.message}`);
            }
          }
        } else {
          const row = {
            id: authUser.id,
            plan_tier: 'free',
            subscription_status: 'inactive',
            preferences: {},
            updated_at: new Date().toISOString(),
          };
          if (derivedName) row.display_name = derivedName;

          const { error: insertErr } = await sb
            .from('profiles')
            .insert(row, { onConflict: 'id', ignoreDuplicates: true });

          if (!insertErr || insertErr.code === '23505') {
            report.profilesCreated++;
            report.details.push({
              id: authUser.id.slice(0, 8),
              email: authUser.email,
              action: 'created_profile',
              displayName: derivedName || '(none)',
            });
          } else {
            report.errors.push(`create ${authUser.id.slice(0, 8)}: ${insertErr.message}`);
          }
        }
      }

      page++;
    }
  } catch (err) {
    report.errors.push(`fatal: ${err.message}`);
  }

  console.log(`[backfill-profiles] scanned=${report.authUsersScanned} created=${report.profilesCreated} backfilled=${report.displayNamesBackfilled} errors=${report.errors.length}`);
  return res.status(200).json(report);
}
