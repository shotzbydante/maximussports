/**
 * Route-level workspace access gate.
 *
 * Wraps MLB (and future non-public workspace) routes.
 * If the user cannot access the workspace derived from the current URL,
 * they are silently redirected to the CBB home page.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WORKSPACES, DEFAULT_WORKSPACE_ID } from './config';
import { canAccessWorkspace } from './access';

export default function WorkspaceGate({ workspaceId }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!canAccessWorkspace(workspaceId, user)) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
