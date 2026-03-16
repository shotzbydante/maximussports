/**
 * useUserProfile — shared hook providing user profile data for navigation,
 * sidebar, header chip, settings page, and future public profile.
 *
 * Returns a composable UserProfile shape that includes identity, plan state,
 * social counts, and pick stats.
 *
 * Uses select('*') to fetch the profile — exactly like the Settings page.
 * This ensures we never fail on missing columns and always get whatever
 * the deployed profiles table actually has.
 *
 * In-flight deduplication: concurrent hook instances share a single
 * promise so only one network request fires per uid at a time.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { buildUserProfile } from '../types/social';

const _cache = new Map();
const _listeners = new Set();

const _inflight = new Map();

function normalizeProfileRow(row) {
  if (!row) return row;
  if (!row.avatar_config) {
    const fromPrefs = row.preferences?.robotConfig;
    if (fromPrefs) {
      return { ...row, avatar_config: fromPrefs };
    }
  }
  return row;
}

function broadcast() {
  _listeners.forEach((fn) => fn());
}

async function fetchProfile(sb, uid) {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();
  if (error) return null;
  return data ? normalizeProfileRow(data) : null;
}

/**
 * Deduplicated fetch: if a request is already in-flight for this uid,
 * piggyback on it instead of starting a new one.
 */
function fetchProfileDeduped(sb, uid) {
  if (_inflight.has(uid)) return _inflight.get(uid);

  const promise = fetchProfile(sb, uid).finally(() => {
    _inflight.delete(uid);
  });
  _inflight.set(uid, promise);
  return promise;
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

    fetchProfileDeduped(sb, uid)
      .then((row) => {
        if (row) _cache.set(uid, row);
        setProfile(buildUserProfile(user, row));
        setIsLoading(false);
      })
      .catch(() => {
        setProfile(buildUserProfile(user, null));
        setIsLoading(false);
      });
  }, [user?.id, user, refreshKey]);

  return { profile, isLoading };
}
