/**
 * GET /api/admin/search-debug?users=Drake21,carlos,jochoa5405@gmail.com
 *
 * Diagnostic endpoint: checks whether each identifier exists in auth.users
 * and profiles. Returns a reconciliation table.
 *
 * Protected: requires valid Bearer token.
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
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

  const usersParam = new URL(req.url, `http://${req.headers.host}`).searchParams.get('users') || '';
  const identifiers = usersParam.split(',').map(s => s.trim()).filter(Boolean);

  if (identifiers.length === 0) {
    return res.status(400).json({ error: 'Provide ?users=comma,separated,list' });
  }

  const { data: allAuth, error: authErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authErr) {
    return res.status(500).json({ error: `GoTrue error: ${authErr.message}` });
  }

  const authUsers = allAuth?.users || [];

  const { data: allProfiles, error: profilesErr } = await sb
    .from('profiles')
    .select('id, username, display_name, plan_tier, avatar_config, followers_count');

  if (profilesErr) {
    return res.status(500).json({ error: `Profiles query error: ${profilesErr.message}` });
  }

  const profileById = new Map((allProfiles || []).map(p => [p.id, p]));
  const profileByUsername = new Map(
    (allProfiles || []).filter(p => p.username).map(p => [p.username.toLowerCase(), p])
  );

  const results = [];

  for (const identifier of identifiers) {
    const isEmail = identifier.includes('@');
    const lower = identifier.toLowerCase();

    let authUser = null;
    if (isEmail) {
      authUser = authUsers.find(u => u.email?.toLowerCase() === lower);
    } else {
      authUser = authUsers.find(u => {
        const meta = u.user_metadata || {};
        return (meta.full_name?.toLowerCase() === lower) ||
               (meta.name?.toLowerCase() === lower);
      });
    }

    let profileRow = null;
    if (authUser) {
      profileRow = profileById.get(authUser.id);
    }
    if (!profileRow && !isEmail) {
      profileRow = profileByUsername.get(lower);
      if (profileRow && !authUser) {
        authUser = authUsers.find(u => u.id === profileRow.id);
      }
    }

    results.push({
      identifier,
      existsInAuth: !!authUser,
      authId: authUser?.id?.slice(0, 8) || null,
      authEmail: authUser?.email || null,
      authProvider: authUser?.app_metadata?.provider || null,
      authCreatedAt: authUser?.created_at || null,
      existsInProfiles: !!profileRow,
      profileUsername: profileRow?.username || null,
      profileDisplayName: profileRow?.display_name || null,
      profilePlan: profileRow?.plan_tier || null,
      profileFollowers: profileRow?.followers_count || 0,
      hasAvatar: !!(profileRow?.avatar_config),
      rootCause: diagnose(authUser, profileRow, identifier),
    });
  }

  return res.status(200).json({
    totalAuthUsers: authUsers.length,
    totalProfiles: (allProfiles || []).length,
    orphanedAuthUsers: authUsers.filter(u => !profileById.has(u.id)).length,
    results,
  });
}

function diagnose(authUser, profileRow, identifier) {
  if (!authUser) return 'NOT_IN_AUTH: No auth.users entry found for this identifier';
  if (!profileRow) return 'NO_PROFILE: Auth user exists but has no profiles row — search cannot find them';
  if (!profileRow.username && !profileRow.display_name) return 'EMPTY_PROFILE: Profile exists but username AND display_name are both NULL — invisible to search';
  if (!profileRow.username) return 'NO_USERNAME: Profile exists but username is NULL — only searchable by display_name';
  if (!profileRow.display_name) return 'NO_DISPLAY_NAME: Profile exists but display_name is NULL — only searchable by username';
  return 'OK: Profile exists with searchable fields';
}
