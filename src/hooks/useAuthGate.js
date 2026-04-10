/**
 * useAuthGate — navigation guard for restricted routes.
 *
 * Returns a function that checks if the user is authenticated before
 * allowing navigation. If not authenticated, opens the AuthGateModal
 * or navigates to /settings.
 *
 * Public routes (allowed without login):
 *   /              (Home/Landing)
 *   /mlb           (MLB Home / Daily Briefing)
 *   /ncaam         (NCAAM Home)
 *   /settings      (Auth/Onboarding)
 *   /privacy       (Legal)
 *   /terms         (Legal)
 *
 * Everything else is gated.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PUBLIC_ROUTES = [
  '/',
  '/mlb',
  '/ncaam',
  '/settings',
  '/privacy',
  '/terms',
];

function isPublicRoute(path) {
  const normalized = path.toLowerCase().replace(/\/$/, '') || '/';
  return PUBLIC_ROUTES.some(r => normalized === r);
}

export function useAuthGate() {
  const { user } = useAuth();
  const navigate = useNavigate();

  /**
   * Guard a navigation attempt.
   * Returns true if navigation is allowed, false if blocked.
   * When blocked, redirects to /settings (signup).
   */
  const guardNavigation = useCallback((targetPath) => {
    if (user) return true;
    if (isPublicRoute(targetPath)) return true;

    // Block: redirect to signup
    navigate('/settings', { state: { from: targetPath } });
    return false;
  }, [user, navigate]);

  /**
   * Check if user can access a route (no side effects).
   */
  const canAccess = useCallback((path) => {
    if (user) return true;
    return isPublicRoute(path);
  }, [user]);

  return { guardNavigation, canAccess, isAuthenticated: !!user };
}
