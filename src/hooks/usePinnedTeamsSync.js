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
import { onPinnedChanged, slugArraysEqual } from '../utils/pinnedSync';
import { track } from '../analytics/index';

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
        //    Always replace localStorage with server data when available.
        //    When server is empty, push local pins up to user_teams so they
        //    are not lost (first-time authenticated session).
        const localSlugs = getPinnedTeams();
        const serverSet = new Set(serverSlugs);
        const localOnly = localSlugs.filter((s) => !serverSet.has(s));

        let merged;
        if (serverSlugs.length > 0) {
          // Server has data — it wins. Local-only pins are also pushed up.
          merged = [...serverSlugs, ...localOnly];
        } else {
          // Server empty — keep local pins and push them up.
          merged = localSlugs;
        }

        // 3. Persist to localStorage
        setPinnedTeams(merged);

        // 4. Upsert any local-only pins to user_teams so server stays canonical.
        if (localOnly.length > 0) {
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
