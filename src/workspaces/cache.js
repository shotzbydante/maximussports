/**
 * Workspace-scoped cache key helpers.
 *
 * All client-side storage keys (localStorage, sessionStorage, in-memory)
 * should flow through these helpers to prevent cross-workspace contamination.
 */

import { DEFAULT_WORKSPACE_ID } from './config';

/**
 * Build a workspace-scoped cache key.
 * @param {string} workspaceId
 * @param  {...string} parts
 * @returns {string}
 */
export function workspaceCacheKey(workspaceId, ...parts) {
  const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
  return `workspace:${wsId}:${parts.join(':')}`;
}

/**
 * Read a workspace-scoped value from localStorage.
 */
export function getWorkspaceLocal(workspaceId, key) {
  try {
    return localStorage.getItem(workspaceCacheKey(workspaceId, key));
  } catch {
    return null;
  }
}

/**
 * Write a workspace-scoped value to localStorage.
 */
export function setWorkspaceLocal(workspaceId, key, value) {
  try {
    localStorage.setItem(workspaceCacheKey(workspaceId, key), value);
  } catch { /* quota exceeded — silent */ }
}

/**
 * Read a workspace-scoped value from sessionStorage.
 */
export function getWorkspaceSession(workspaceId, key) {
  try {
    return sessionStorage.getItem(workspaceCacheKey(workspaceId, key));
  } catch {
    return null;
  }
}

/**
 * Write a workspace-scoped value to sessionStorage.
 */
export function setWorkspaceSession(workspaceId, key, value) {
  try {
    sessionStorage.setItem(workspaceCacheKey(workspaceId, key), value);
  } catch { /* quota exceeded — silent */ }
}
