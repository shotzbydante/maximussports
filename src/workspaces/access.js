/**
 * Workspace access / entitlement helpers.
 *
 * This is the SINGLE source of truth for "can user X see workspace Y?".
 * All gating in routes, nav, and content studio should call these helpers
 * rather than doing ad-hoc email checks.
 */

import { WORKSPACE_LIST, WORKSPACES, DEFAULT_WORKSPACE_ID } from './config';

/**
 * Returns true if the user can access the given workspace.
 * @param {string} workspaceId
 * @param {{ email?: string | null } | null} user - Supabase user or null
 */
export function canAccessWorkspace(workspaceId, user) {
  const ws = WORKSPACES[workspaceId];
  if (!ws) return false;

  if (ws.access.public) return true;

  if (!user?.email) return false;

  const email = user.email.trim().toLowerCase();
  if (ws.access.allowedEmails?.length) {
    return ws.access.allowedEmails.some(
      (allowed) => allowed.trim().toLowerCase() === email,
    );
  }

  return false;
}

/**
 * Returns workspace configs visible to the current user.
 * @param {{ email?: string | null } | null} user
 * @returns {import('./config').WorkspaceConfig[]}
 */
export function getVisibleWorkspaces(user) {
  return WORKSPACE_LIST.filter((ws) => canAccessWorkspace(ws.id, user));
}

/**
 * Validates a workspace id and returns the default if invalid or inaccessible.
 * @param {string | null | undefined} workspaceId
 * @param {{ email?: string | null } | null} user
 * @returns {string}
 */
export function resolveWorkspaceId(workspaceId, user) {
  if (workspaceId && canAccessWorkspace(workspaceId, user)) {
    return workspaceId;
  }
  return DEFAULT_WORKSPACE_ID;
}
