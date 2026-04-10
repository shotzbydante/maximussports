/**
 * RouteGate — automatic route-level content gating.
 *
 * Wraps a page's <Outlet> or children. Based on the current route path
 * and auth state, applies the appropriate gate treatment:
 *
 *   OPEN    → render children normally
 *   PREVIEW → wrap children in GatedContent with sport-specific copy
 *   GATED   → redirect to /settings
 *
 * Usage in App.jsx:
 *   <Route element={<RouteGate />}>
 *     <Route path="games" element={<Games />} />
 *   </Route>
 *
 * Or as a wrapper:
 *   <RouteGate><SomePage /></RouteGate>
 */

import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRouteAccess, getRouteSport } from '../../hooks/useAuthGate';
import GatedContent from './GatedContent';
import GuestClickGate from './GuestClickGate';

export default function RouteGate({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  const path = location.pathname;
  const access = getRouteAccess(path);
  const sport = getRouteSport(path) || 'mlb';
  const content = children || <Outlet />;

  // Authenticated users always pass through
  if (user) return <>{content}</>;

  switch (access) {
    case 'open':
      // Open pages get click interception for deeper navigation
      return <GuestClickGate>{content}</GuestClickGate>;

    case 'preview':
      // Preview pages get the progressive content gate
      return (
        <GatedContent sport={sport} previewPercent={25}>
          {content}
        </GatedContent>
      );

    case 'gated':
      return <Navigate to="/settings" replace state={{ from: location }} />;

    default:
      return <>{content}</>;
  }
}
