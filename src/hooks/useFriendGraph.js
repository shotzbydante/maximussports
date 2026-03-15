/**
 * useFriendGraph — manages follow/unfollow actions, social counts,
 * and friend relationship states.
 *
 * Provides optimistic UI updates for follow button interactions.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { track } from '../analytics/index';

export function useFriendGraph() {
  const { user, session } = useAuth();
  const [socialCounts, setSocialCounts] = useState({
    followers: 0,
    following: 0,
    friends: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    if (!user) return;
    try {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb
        .from('profiles')
        .select('followers_count, following_count, friends_count')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setSocialCounts({
          followers: data.followers_count || 0,
          following: data.following_count || 0,
          friends: data.friends_count || 0,
        });
      }
    } catch {
      // silent
    }
  }, [user]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

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

      if (!res.ok) throw new Error('Follow failed');
      const data = await res.json();

      setSocialCounts(prev => ({
        ...prev,
        following: prev.following + 1,
        friends: data.followStatus === 'friends' ? prev.friends + 1 : prev.friends,
      }));

      track('user_followed', {
        target_id: targetUserId,
        result_status: data.followStatus,
      });

      return data.followStatus;
    } catch (err) {
      console.error('[useFriendGraph] follow error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [session, user]);

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

      if (!res.ok) throw new Error('Unfollow failed');
      const data = await res.json();

      setSocialCounts(prev => ({
        ...prev,
        following: Math.max(0, prev.following - 1),
        friends: data.followStatus === 'follower' ? Math.max(0, prev.friends - 1) : prev.friends,
      }));

      track('user_unfollowed', { target_id: targetUserId });

      return data.followStatus;
    } catch (err) {
      console.error('[useFriendGraph] unfollow error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [session, user]);

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
