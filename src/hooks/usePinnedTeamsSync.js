/**
 * usePinnedTeamsSync
 *
 * When the user is authenticated, syncs pinned teams between:
 *   - localStorage key "maximus-pinned-teams"  (client-side truth)
 *   - Supabase table user_pins (user_id, team_slug) (server-side truth)
 *
 * Strategy on auth:
 *   1. Fetch server pins for the user.
 *   2. Read local pins from localStorage.
 *   3. Merge (union), deduplicated, local-order preserved then server-only appended.
 *   4. Write merged list back to localStorage.
 *   5. Upsert server with any slugs present locally but absent on server (best-effort).
 *
 * Fire-and-forget helpers (addServerPin / removeServerPin) are returned so
 * callers can mirror individual pin/unpin actions to the server without
 * blocking the UI or changing existing localStorage logic.
 *
 * All errors are swallowed — anonymous browsing is never affected.
 * When Supabase is not configured, this hook is a safe no-op.
 *
 * PostHog events (via existing analytics util):
 *   pins_sync_start
 *   pins_sync_complete { mergedCount, serverCount, localCount }
 *   pins_sync_error   { code }
 */

import { useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '../lib/supabaseClient';
import { getPinnedTeams, setPinnedTeams } from '../utils/pinnedTeams';
import { addPinnedForSport } from './usePinnedTeams';
import { onPinnedChanged, slugArraysEqual } from '../utils/pinnedSync';
import { track } from '../analytics/index';
import { MLB_TEAMS } from '../sports/mlb/teams';

const _mlbSlugSet = new Set(MLB_TEAMS.map(t => t.slug));

export function usePinnedTeamsSync(user) {
  // Ensure we only run the initial full sync once per user session
  const syncedUserIdRef = useRef(null);

  // ── Initial full sync ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    if (syncedUserIdRef.current === user.id) return; // already synced this session

    syncedUserIdRef.current = user.id;

    async function sync() {
      const sb = getSupabase();
      if (!sb) return; // Supabase not configured — skip sync silently

      track('pins_sync_start', {});
      try {
        // 1. Fetch server pins from user_teams (canonical source shared with
        //    Settings and email digests). Previously this read from user_pins,
        //    which was never updated by pin/unpin actions, causing removed teams
        //    to reappear after refresh.
        const { data, error } = await sb
          .from('user_teams')
          .select('team_slug')
          .eq('user_id', user.id);

        if (error) {
          track('pins_sync_error', { code: error.code ?? 'fetch_failed' });
          return;
        }

        const serverSlugs = (data ?? []).map((r) => r.team_slug).filter(Boolean);

        // 2. Server (user_teams) is the canonical source of truth.
        //    When server has data, it wins completely — local-only pins are
        //    NOT merged back because they may have been explicitly removed
        //    from another device/session. This prevents the "Stanford bug"
        //    where a removed team reappears from stale localStorage.
        //    When server is empty (first-time auth), keep local pins and push up.
        const localSlugs = getPinnedTeams();
        const localOnly = localSlugs.filter((s) => !new Set(serverSlugs).has(s));

        let merged;
        if (serverSlugs.length > 0) {
          // Server has data — it is the canonical set. Do NOT append local-only
          // pins because they may have been removed on another device.
          merged = [...serverSlugs];
        } else {
          // Server empty — keep local pins and push them up.
          merged = localSlugs;
        }

        // 3. Split by sport and hydrate unified v2 store
        const ncaamSlugs = merged.filter(s => !_mlbSlugSet.has(s));
        const mlbSlugs = merged.filter(s => _mlbSlugSet.has(s));

        // Write NCAAM to unified v2 (setPinnedTeams now routes through v2)
        setPinnedTeams(ncaamSlugs);

        // Write MLB to unified v2
        mlbSlugs.forEach(slug => addPinnedForSport('mlb', slug));

        // 3b. Seed prevSlugsRef so the write-through listener knows the current
        //     baseline. Without this, prevSlugsRef starts at [] and the first
        //     'home' event sees ALL merged slugs as "added", re-upserting teams
        //     that should have been removed from user_teams.
        prevSlugsRef.current = merged;

        // 4. Upsert local-only pins to user_teams ONLY when server was empty
        //    (first-time authenticated session). When server has data, it is
        //    canonical and local-only pins should not be pushed back.
        if (localOnly.length > 0 && serverSlugs.length === 0) {
          const rows = localOnly.map((slug) => ({
            user_id: user.id,
            team_slug: slug,
            is_primary: false,
            created_at: new Date().toISOString(),
          }));
          sb
            .from('user_teams')
            .upsert(rows, { onConflict: 'user_id,team_slug', ignoreDuplicates: true })
            .then(({ error: upsertErr }) => {
              if (upsertErr) track('pins_sync_error', { code: upsertErr.code ?? 'upsert_failed' });
            });
        }

        track('pins_sync_complete', {
          mergedCount: merged.length,
          serverCount: serverSlugs.length,
          localCount:  localSlugs.length,
        });
      } catch {
        track('pins_sync_error', { code: 'exception' });
      }
    }

    sync();
  }, [user]);

  // ── Fire-and-forget server mirror helpers ────────────────────────────────

  /** Call after addPinnedTeam(slug) when user is authenticated. */
  const addServerPin = useCallback(async (slug) => {
    if (!user?.id || !slug) return;
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb
        .from('user_teams')
        .upsert({ user_id: user.id, team_slug: slug, is_primary: false, created_at: new Date().toISOString() }, { onConflict: 'user_id,team_slug', ignoreDuplicates: true });
    } catch { /* swallow */ }
  }, [user]);

  /** Call after removePinnedTeam(slug) when user is authenticated. */
  const removeServerPin = useCallback(async (slug) => {
    if (!user?.id || !slug) return;
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb
        .from('user_teams')
        .delete()
        .eq('user_id', user.id)
        .eq('team_slug', slug);
    } catch { /* swallow */ }
  }, [user]);

  // ── Write-through: Home pin/unpin → user_teams ───────────────────────────
  // When PinnedTeamsSection dispatches a 'home' event while signed in,
  // mirror the change to the user_teams table so Settings "My Teams" is canonical.
  // prevSlugsRef tracks the last known list so we only write deltas.
  const prevSlugsRef = useRef([]);

  useEffect(() => {
    if (!user?.id) return;

    return onPinnedChanged(async ({ slugs, source }) => {
      if (source !== 'home') return; // only react to Home actions; avoid loops

      const prev = prevSlugsRef.current;
      // Skip write-through when the set of slugs hasn't changed
      if (slugArraysEqual(prev, slugs)) return;
      prevSlugsRef.current = slugs;

      const sb = getSupabase();
      if (!sb) return;

      const prevSet = new Set(prev);
      const nextSet = new Set(slugs);

      const added   = slugs.filter((s) => !prevSet.has(s));
      const removed = prev.filter((s) => !nextSet.has(s));

      if (added.length === 0 && removed.length === 0) return;

      try {
        if (added.length > 0) {
          const rows = added.map((slug) => ({
            user_id:    user.id,
            team_slug:  slug,
            is_primary: false,
            created_at: new Date().toISOString(),
          }));
          await sb
            .from('user_teams')
            .upsert(rows, { onConflict: 'user_id,team_slug', ignoreDuplicates: true });
        }
        for (const slug of removed) {
          await sb
            .from('user_teams')
            .delete()
            .eq('user_id', user.id)
            .eq('team_slug', slug);
        }
      } catch { /* swallow — local state already correct, DB is best-effort */ }
    });
  }, [user]);

  return { addServerPin, removeServerPin };
}
