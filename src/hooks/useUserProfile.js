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

/**
 * Normalize a profile row so avatar_config is always populated when available,
 * even if the dedicated column doesn't exist (falls back to preferences.robotConfig).
 */
function normalizeProfileRow(row) {
  if (!row) return row;
  if (row.avatar_config) return row;
  const fromPrefs = row.preferences?.robotConfig;
  if (fromPrefs) {
    return { ...row, avatar_config: fromPrefs };
  }
  return row;
}

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
      .select('username, display_name, favorite_number, plan_tier, avatar_config, preferences')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // avatar_config column may not exist yet — retry with core columns only
          return sb.from('profiles')
            .select('username, display_name, favorite_number, plan_tier, preferences')
            .eq('id', uid)
            .maybeSingle()
            .then(({ data: fallbackData }) => {
              if (fallbackData) _cache.set(uid, normalizeProfileRow(fallbackData));
              setProfile(buildUserProfile(user, fallbackData ? normalizeProfileRow(fallbackData) : null));
              setIsLoading(false);
            });
        }
        if (data) _cache.set(uid, normalizeProfileRow(data));
        setProfile(buildUserProfile(user, data ? normalizeProfileRow(data) : null));
        setIsLoading(false);
      })
      .catch(() => {
        setProfile(buildUserProfile(user, null));
        setIsLoading(false);
      });
  }, [user?.id, user, refreshKey]);

  return { profile, isLoading };
}
