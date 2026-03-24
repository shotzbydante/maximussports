/**
 * Shell-level workspace context.
 *
 * Provides the current workspace, available workspaces for the user,
 * and a method to switch workspaces. Route-aware: derives the active
 * workspace from the URL path prefix.
 */

import { createContext, useContext, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { track } from '../analytics/index';
import {
  WORKSPACES,
  WORKSPACE_LIST,
  DEFAULT_WORKSPACE_ID,
  getWorkspace,
  WorkspaceId,
} from './config';
import { getVisibleWorkspaces, canAccessWorkspace } from './access';

const WorkspaceContext = createContext(null);

/**
 * Derive workspace id from the current URL pathname.
 * `/ncaam/...` → 'cbb'; `/mlb/...` → 'mlb'; everything else → 'cbb' (default).
 */
const PREFIX_TO_WORKSPACE = { ncaam: WorkspaceId.CBB, mlb: WorkspaceId.MLB };

function deriveWorkspaceFromPath(pathname) {
  const segment = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  if (segment && PREFIX_TO_WORKSPACE[segment]) return PREFIX_TO_WORKSPACE[segment];
  return DEFAULT_WORKSPACE_ID;
}

/**
 * Strip the workspace route base from a path to get the "local" path.
 * e.g. '/mlb/games' → '/games',  '/games' → '/games'
 */
function stripWorkspacePrefix(pathname, workspaceId) {
  const ws = getWorkspace(workspaceId);
  if (ws.routeBase && pathname.startsWith(ws.routeBase)) {
    const rest = pathname.slice(ws.routeBase.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const detectedId = deriveWorkspaceFromPath(location.pathname);

  const activeId = canAccessWorkspace(detectedId, user)
    ? detectedId
    : DEFAULT_WORKSPACE_ID;

  const workspace = getWorkspace(activeId);
  const visibleWorkspaces = useMemo(
    () => getVisibleWorkspaces(user),
    [user],
  );

  // Track workspace entry (fires once per workspace per session)
  const trackedEntryRef = useRef(new Set());
  useEffect(() => {
    if (trackedEntryRef.current.has(activeId)) return;
    trackedEntryRef.current.add(activeId);
    track(`enter_${activeId}_workspace`, { workspace: activeId, path: location.pathname });
  }, [activeId, location.pathname]);

  const switchWorkspace = useCallback(
    (targetId) => {
      if (targetId === activeId) return;
      if (!canAccessWorkspace(targetId, user)) return;

      track('workspace_switch', { from: activeId, to: targetId });

      // Clear splash flags for the target workspace so the
      // loading screen re-triggers on every sport switch.
      WORKSPACE_LIST.forEach((ws) => {
        if (ws.theme?.splashKey) {
          try { sessionStorage.removeItem(ws.theme.splashKey); } catch { /* noop */ }
        }
      });

      const target = getWorkspace(targetId);
      const localPath = stripWorkspacePrefix(location.pathname, activeId);

      const newPath = target.routeBase
        ? `${target.routeBase}${localPath === '/' ? '' : localPath}`
        : localPath;

      navigate(newPath || '/');
    },
    [activeId, user, location.pathname, navigate],
  );

  /**
   * Build a workspace-scoped path.
   * e.g. buildPath('/games') → '/mlb/games' when in MLB workspace.
   */
  const buildPath = useCallback(
    (localPath) => {
      if (!workspace.routeBase) return localPath;
      return `${workspace.routeBase}${localPath === '/' ? '' : localPath}`;
    },
    [workspace.routeBase],
  );

  /**
   * Build a workspace-scoped cache key.
   * e.g. cacheKey('scores', '2026-03-20') → 'workspace:mlb:scores:2026-03-20'
   */
  const cacheKey = useCallback(
    (...parts) => `workspace:${activeId}:${parts.join(':')}`,
    [activeId],
  );

  const value = useMemo(
    () => ({
      workspace,
      workspaceId: activeId,
      visibleWorkspaces,
      switchWorkspace,
      buildPath,
      cacheKey,
      hasCapability: (cap) => !!workspace.capabilities[cap],
    }),
    [workspace, activeId, visibleWorkspaces, switchWorkspace, buildPath, cacheKey],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
