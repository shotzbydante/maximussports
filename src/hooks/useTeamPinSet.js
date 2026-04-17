/**
 * useTeamPinSet — client hook for server-validated full-set pin replacement.
 *
 * Pairs with POST /api/teams/pin-set. Use this for onboarding bulk insert,
 * sync hydration, or anywhere the client wants to persist a full set of
 * pinned teams instead of single add/remove.
 *
 * The server validates the entire resulting set against the free-tier cap
 * (3 teams, grace window does NOT apply to bulk writes) and rejects with
 * 403 if the set is too large.
 *
 * Returns the validated team count from the server so callers can update
 * PostHog person properties from backend truth.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export function useTeamPinSet() {
  const { session } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const saveTeamSet = useCallback(async (slugs, { source = 'unknown' } = {}) => {
    if (!session?.access_token) {
      return { ok: false, error: 'Not signed in', reason: 'auth_required' };
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/teams/pin-set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slugs, source }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        console.log('[useTeamPinSet] saved', {
          source,
          attempted: slugs.length,
          persisted: data.teamCount,
          plan: data.plan_tier,
        });
        return data;
      }

      console.warn('[useTeamPinSet] rejected', {
        source,
        attempted: slugs.length,
        reason: data.reason,
        limit: data.limit,
        error: data.error,
      });

      return {
        ok: false,
        error: data.error || 'Failed to save teams.',
        reason: data.reason || null,
        limit: data.limit,
        attemptedCount: data.attemptedCount,
        teamCount: data.teamCount,
      };
    } catch (err) {
      return { ok: false, error: err.message || 'Network error', reason: null };
    } finally {
      setIsSaving(false);
    }
  }, [session?.access_token]);

  return { saveTeamSet, isSaving };
}
