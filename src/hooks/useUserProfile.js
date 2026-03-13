/**
 * useUserProfile — shared hook providing user profile data for navigation,
 * sidebar, header chip, settings page, and future public profile.
 *
 * Returns a composable UserProfile shape that includes identity, plan state,
 * social counts, and pick stats. Social counts and pick stats return zeros
 * for now — they'll be wired to real data when the social backend activates.
 *
 * This hook caches profile data and shares it across components via a
 * module-level store + broadcast pattern (same approach as usePlan).
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { buildUserProfile } from '../types/social';

const _cache = new Map();
const _listeners = new Set();

function broadcast() {
  _listeners.forEach((fn) => fn());
}

/**
 * Force-refresh profile data for a user.
 * Call after profile edits (username, jersey number, etc.).
 */
export function invalidateProfileCache(userId) {
  if (userId) _cache.delete(userId);
  broadcast();
}

export function useUserProfile() {
  const { user, session } = useAuth();
  const [profile, setProfile] = useState(() => {
    if (user?.id && _cache.has(user.id)) {
      return buildUserProfile(user, _cache.get(user.id));
    }
    return user ? buildUserProfile(user, null) : null;
  });
  const [isLoading, setIsLoading] = useState(() => !!(user?.id && !_cache.has(user.id)));
  const [refreshKey, setRefreshKey] = useState(0);
  const lastFetchRef = useRef({ uid: null, refreshKey: -1 });

  useEffect(() => {
    const notify = () => setRefreshKey((k) => k + 1);
    _listeners.add(notify);
    return () => _listeners.delete(notify);
  }, []);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    if (_cache.has(uid)) {
      setProfile(buildUserProfile(user, _cache.get(uid)));
      setIsLoading(false);
      return;
    }

    if (lastFetchRef.current.uid === uid && lastFetchRef.current.refreshKey === refreshKey) {
      return;
    }
    lastFetchRef.current = { uid, refreshKey };

    const sb = getSupabase();
    if (!sb) {
      setProfile(buildUserProfile(user, null));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    sb.from('profiles')
      .select('username, display_name, favorite_number, plan_tier, avatar_config')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setProfile(buildUserProfile(user, null));
          setIsLoading(false);
          return;
        }
        if (data) _cache.set(uid, data);
        setProfile(buildUserProfile(user, data));
        setIsLoading(false);
      })
      .catch(() => {
        setProfile(buildUserProfile(user, null));
        setIsLoading(false);
      });
  }, [user?.id, user, refreshKey]);

  return { profile, isLoading };
}
