/**
 * useFriendGraph — manages follow/unfollow actions and social counts.
 *
 * DB RPCs own all persistent side effects (counters, notifications).
 * This hook only: calls the API, reads resulting state, updates local UI,
 * and invalidates the shared profile cache so all surfaces stay in sync.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { track } from '../analytics/index';
import { showToast } from '../components/common/Toast';
import { invalidateProfileCache } from './useUserProfile';

export function useFriendGraph() {
  const { user, session } = useAuth();
  const [socialCounts, setSocialCounts] = useState({
    followers: 0,
    following: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    if (!user) return;
    try {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb
        .from('profiles')
        .select('followers_count, following_count')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setSocialCounts({
          followers: data.followers_count || 0,
          following: data.following_count || 0,
        });
      }
    } catch {
      // silent — counts are non-critical display data
    }
  }, [user]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const refreshAllSurfaces = useCallback(() => {
    fetchCounts();
    if (user?.id) invalidateProfileCache(user.id);
  }, [fetchCounts, user]);

  const followUser = useCallback(async (targetUserId) => {
    if (!session || !user) return null;
    setLoading(true);

    try {
      const res = await fetch('/api/social/follow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ targetUserId, action: 'follow' }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Follow failed (${res.status})`);
      }

      const data = await res.json();

      refreshAllSurfaces();

      track('user_followed', {
        target_id: targetUserId,
        result_status: data.followStatus,
      });

      return data.followStatus;
    } catch (err) {
      console.error('[useFriendGraph] follow error:', err);
      showToast(err.message || 'Could not follow user', { type: 'error' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [session, user, refreshAllSurfaces]);

  const unfollowUser = useCallback(async (targetUserId) => {
    if (!session || !user) return null;
    setLoading(true);

    try {
      const res = await fetch('/api/social/follow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ targetUserId, action: 'unfollow' }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Unfollow failed (${res.status})`);
      }

      const data = await res.json();

      refreshAllSurfaces();

      track('user_unfollowed', { target_id: targetUserId });

      return data.followStatus;
    } catch (err) {
      console.error('[useFriendGraph] unfollow error:', err);
      showToast(err.message || 'Could not unfollow user', { type: 'error' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [session, user, refreshAllSurfaces]);

  const fetchFollowers = useCallback(async () => {
    if (!session) return [];
    try {
      const res = await fetch('/api/user/followers', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.followers || [];
    } catch {
      return [];
    }
  }, [session]);

  const fetchFollowing = useCallback(async () => {
    if (!session) return [];
    try {
      const res = await fetch('/api/user/following', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.following || [];
    } catch {
      return [];
    }
  }, [session]);

  return {
    socialCounts,
    loading,
    followUser,
    unfollowUser,
    fetchCounts,
    fetchFollowers,
    fetchFollowing,
  };
}
