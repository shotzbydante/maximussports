/**
 * Route-level workspace access gate.
 *
 * Wraps MLB (and future non-public workspace) routes.
 * If the user cannot access the workspace derived from the current URL,
 * they are silently redirected to the CBB home page.
 *
 * Also adds the offseason strip to a workspace whose season is completed.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WORKSPACES, SeasonState } from './config';
import { canAccessWorkspace } from './access';
import OffseasonStrip from '../components/season/OffseasonStrip';

/**
 * Screens that render their own offseason treatment (full recap or panel),
 * relative to the workspace route base. Every other screen in a completed
 * workspace gets the one-line offseason strip above its content.
 */
const OWN_OFFSEASON_VIEW = new Set(['', '/games', '/insights']);

function showsOffseasonStrip(workspace, pathname) {
  if (workspace?.seasonState !== SeasonState.COMPLETED || !workspace.championship) return false;
  const local = pathname.slice((workspace.routeBase || '').length).replace(/\/+$/, '');
  return !OWN_OFFSEASON_VIEW.has(local);
}

export default function WorkspaceGate({ workspaceId }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!canAccessWorkspace(workspaceId, user)) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  const workspace = WORKSPACES[workspaceId];

  return (
    <>
      {showsOffseasonStrip(workspace, location.pathname) && <OffseasonStrip workspace={workspace} />}
      <Outlet />
    </>
  );
}
