/**
 * useAuthGate — centralized guest-access policy.
 *
 * Route categories:
 *   OPEN        — fully accessible to guests (home, briefings, legal)
 *   PREVIEW     — guests see top ~25% with gate CTA (sport sub-pages)
 *   GATED       — authenticated only (dashboard, settings actions)
 *
 * For PREVIEW pages, the page component wraps its content in <GatedContent>.
 * This hook just provides the policy logic and a navigation guard.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Routes fully open to guests (no gating, no preview).
 */
const OPEN_ROUTES = [
  '/',
  '/mlb',
  '/ncaam',
  '/settings',
  '/privacy',
  '/terms',
  '/contact',
];

/**
 * Route prefixes where guests get preview treatment (top 25% + gate CTA).
 * The actual GatedContent wrapping is done in the page component.
 */
const PREVIEW_PREFIXES = [
  '/mlb/games',
  '/mlb/teams',
  '/mlb/news',
  '/mlb/insights',
  '/mlb/season-model',
  '/mlb/compare',
  '/ncaam/teams',
  '/ncaam/games',
  '/ncaam/insights',
  '/ncaam/news',
  '/ncaam/alerts',
  '/ncaam/bracketology',
  '/ncaam/college-basketball-picks-today',
  '/ncaam/march-madness-betting-intelligence',
];

function normalizePath(path) {
  return (path || '/').toLowerCase().replace(/\/$/, '') || '/';
}

/**
 * Determine the access level for a given path.
 * Returns: 'open' | 'preview' | 'gated'
 */
export function getRouteAccess(path) {
  const p = normalizePath(path);
  if (OPEN_ROUTES.some(r => p === r)) return 'open';
  if (PREVIEW_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))) return 'preview';
  return 'gated';
}

/**
 * Determine which sport context a path belongs to.
 */
export function getRouteSport(path) {
  const p = normalizePath(path);
  if (p.startsWith('/mlb')) return 'mlb';
  if (p.startsWith('/ncaam')) return 'ncaam';
  if (p.startsWith('/nba')) return 'nba';
  return null;
}

export function useAuthGate() {
  const { user } = useAuth();
  const navigate = useNavigate();

  /**
   * Guard a navigation attempt. Returns true if allowed.
   * For guests on gated routes, redirects to /settings.
   * For preview routes, allows navigation (page handles gating).
   */
  const guardNavigation = useCallback((targetPath) => {
    if (user) return true;
    const access = getRouteAccess(targetPath);
    if (access === 'open' || access === 'preview') return true;
    navigate('/settings', { state: { from: targetPath } });
    return false;
  }, [user, navigate]);

  /**
   * Check if user can access a route (no side effects).
   */
  const canAccess = useCallback((path) => {
    if (user) return true;
    return getRouteAccess(path) !== 'gated';
  }, [user]);

  return {
    guardNavigation,
    canAccess,
    isAuthenticated: !!user,
    getRouteAccess,
    getRouteSport,
  };
}
