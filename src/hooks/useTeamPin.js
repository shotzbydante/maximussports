/**
 * useTeamPin — client-side hook for server-validated team pin/unpin.
 *
 * Calls POST /api/teams/pin with auth token.
 * Enforces free-tier limits server-side; returns upgrade prompt info
 * when blocked.
 *
 * Usage:
 *   const { pinTeam, unpinTeam, isPinning } = useTeamPin();
 *   const result = await pinTeam('nyy');
 *   if (!result.ok) showUpgradePrompt(result.reason);
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { track } from '../analytics';

/**
 * @returns {{ pinTeam, unpinTeam, isPinning }}
 */
export function useTeamPin() {
  const { session } = useAuth();
  const [isPinning, setIsPinning] = useState(false);

  const callPin = useCallback(async (action, slug) => {
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
        // Track successful pin/unpin
        track(action === 'add' ? 'team_pin_added' : 'team_pin_removed', {
          team_slug: slug,
          team_count: data.teamCount,
          grace_remaining: data.graceRemaining,
        });
        return data;
      }

      // Blocked by limit
      if (data.reason) {
        track('team_pin_attempt_blocked', {
          reason: data.reason,
          team_count: data.teamCount,
          team_slug: slug,
        });
      }

      return { ok: false, error: data.error || 'Failed', reason: data.reason || null, graceRemaining: data.graceRemaining };
    } catch (err) {
      return { ok: false, error: err.message || 'Network error', reason: null };
    } finally {
      setIsPinning(false);
    }
  }, [session?.access_token]);

  const pinTeam = useCallback((slug) => callPin('add', slug), [callPin]);
  const unpinTeam = useCallback((slug) => callPin('remove', slug), [callPin]);

  return { pinTeam, unpinTeam, isPinning };
}
