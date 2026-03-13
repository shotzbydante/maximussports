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
 *
 * Schema detection: on the first fetch we discover whether avatar_config
 * exists in the profiles table. The result is remembered for the lifetime
 * of the page so subsequent fetches never fire a failing exploratory query.
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

// Schema capability: null = unknown, true = column exists, false = column missing
let _hasAvatarConfigColumn = null;

/**
 * Returns whether the avatar_config column is known to exist (true),
 * known to be missing (false), or not yet determined (null).
 * Used by save paths to avoid try-fail-retry on writes.
 */
export function getAvatarConfigColumnStatus() {
  return _hasAvatarConfigColumn;
}

/**
 * Mark the avatar_config column as detected (exists or not).
 * Called by save code after a successful or schema-error write.
 */
export function setAvatarConfigColumnStatus(exists) {
  _hasAvatarConfigColumn = exists;
}

// In-flight fetch deduplication: one promise per uid at a time
const _inflight = new Map();

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

const CORE_COLS = 'username, display_name, favorite_number, plan_tier, preferences';
const FULL_COLS = CORE_COLS + ', avatar_config';

/**
 * Fetch profile for a uid. Handles schema detection + caching in one place.
 * Returns the normalized profile row (or null).
 */
async function fetchProfile(sb, uid) {
  // If we already know the schema, use the right query directly
  if (_hasAvatarConfigColumn === true) {
    const { data, error } = await sb.from('profiles').select(FULL_COLS).eq('id', uid).maybeSingle();
    if (error) {
      // Column was removed? Fall back and re-detect next time
      _hasAvatarConfigColumn = null;
      const { data: fb } = await sb.from('profiles').select(CORE_COLS).eq('id', uid).maybeSingle();
      return fb ? normalizeProfileRow(fb) : null;
    }
    return data ? normalizeProfileRow(data) : null;
  }

  if (_hasAvatarConfigColumn === false) {
    const { data } = await sb.from('profiles').select(CORE_COLS).eq('id', uid).maybeSingle();
    return data ? normalizeProfileRow(data) : null;
  }

  // Unknown schema — probe with full columns once
  const { data, error } = await sb.from('profiles').select(FULL_COLS).eq('id', uid).maybeSingle();
  if (!error) {
    _hasAvatarConfigColumn = true;
    return data ? normalizeProfileRow(data) : null;
  }

  // Column doesn't exist — remember and fall back
  _hasAvatarConfigColumn = false;
  const { data: fb } = await sb.from('profiles').select(CORE_COLS).eq('id', uid).maybeSingle();
  return fb ? normalizeProfileRow(fb) : null;
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
