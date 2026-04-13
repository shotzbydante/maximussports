/**
 * useTeamPin — client-side hook for server-validated team pin/unpin.
 *
 * Uses canonical tracking from teamPinTracking.js for consistent
 * event names and person property updates across all surfaces.
 *
 * The `surface` parameter should be passed by the calling component
 * to identify where the action originated.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { trackTeamPinAdded, trackTeamPinRemoved, trackTeamPinBlocked } from '../analytics/teamPinTracking';

export function useTeamPin() {
  const { session } = useAuth();
  const [isPinning, setIsPinning] = useState(false);

  const callPin = useCallback(async (action, slug, { surface = 'unknown', planTier, allSlugs } = {}) => {
    if (!session?.access_token) {
      return { ok: false, error: 'Not signed in', reason: 'auth_required' };
    }

    setIsPinning(true);
    try {
      const res = await fetch('/api/teams/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, slug }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        if (action === 'add') {
          trackTeamPinAdded(slug, {
            surface,
            planTier,
            teamCountAfter: data.teamCount,
            graceRemaining: data.graceRemaining,
            allSlugs,
          });
        } else {
          trackTeamPinRemoved(slug, {
            surface,
            planTier,
            teamCountAfter: data.teamCount,
            allSlugs,
          });
        }
        return data;
      }

      // Blocked by limit
      if (data.reason) {
        trackTeamPinBlocked(slug, {
          surface,
          reason: data.reason,
          planTier: planTier || 'free',
          teamCount: data.teamCount,
        });
      }

      return { ok: false, error: data.error || 'Failed', reason: data.reason || null, graceRemaining: data.graceRemaining };
    } catch (err) {
      return { ok: false, error: err.message || 'Network error', reason: null };
    } finally {
      setIsPinning(false);
    }
  }, [session?.access_token]);

  const pinTeam = useCallback((slug, opts) => callPin('add', slug, opts), [callPin]);
  const unpinTeam = useCallback((slug, opts) => callPin('remove', slug, opts), [callPin]);

  return { pinTeam, unpinTeam, isPinning };
}
