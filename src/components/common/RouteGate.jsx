/**
 * RouteGate — wraps a page and applies the correct guest treatment
 * based on the route's access policy (from useAuthGate).
 *
 * - Authenticated users: renders children unchanged.
 * - Guests on OPEN routes: renders children unchanged.
 * - Guests on PREVIEW routes: wraps in <GatedContent> (faded top + CTA),
 *   unless they hold a guest pass (they gave an email at the wall): then the
 *   page is open, with a bar above it to confirm the email.
 * - Guests on GATED routes: redirects to /settings?next=<current path>.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRouteAccess, getSportFromPath } from '../../hooks/useAuthGate';
import GatedContent from './GatedContent';
import ConfirmEmailBar from './ConfirmEmailBar';
import useGuestPass from '../../hooks/useGuestPass';

export default function RouteGate({ children, previewPercent = 25 }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const pass = useGuestPass();

  if (loading) return null;
  if (user) return <>{children}</>;

  const path = location.pathname;
  const access = getRouteAccess(path);
  const next = path + location.search;

  if (access === 'gated') {
    return <Navigate to={`/settings?next=${encodeURIComponent(next)}`} replace />;
  }

  if (access === 'preview' && pass) {
    return (
      <>
        <ConfirmEmailBar email={pass.email} next={next} />
        {children}
      </>
    );
  }

  if (access === 'preview') {
    const sport = getSportFromPath(path);
    return (
      <GatedContent sport={sport} next={next} previewPercent={previewPercent}>
        {children}
      </GatedContent>
    );
  }

  return <>{children}</>;
}
