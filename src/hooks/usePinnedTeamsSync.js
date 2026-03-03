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
import { onPinnedChanged } from '../utils/pinnedSync';
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
        // 1. Fetch server pins
        const { data, error } = await sb
          .from('user_pins')
          .select('team_slug')
          .eq('user_id', user.id);

        if (error) {
          track('pins_sync_error', { code: error.code ?? 'fetch_failed' });
          return;
        }

        const serverSlugs = (data ?? []).map((r) => r.team_slug).filter(Boolean);

        // 2. Read local pins
        const localSlugs = getPinnedTeams();

        // 3. Merge: local order first, then server-only additions
        const serverSet = new Set(serverSlugs);
        const localSet  = new Set(localSlugs);
        const merged = [
          ...localSlugs,
          ...serverSlugs.filter((s) => !localSet.has(s)),
        ];

        // 4. Persist merged to localStorage
        setPinnedTeams(merged);

        // 5. Upsert local-only pins to server (best-effort, fire-and-forget)
        const localOnly = localSlugs.filter((s) => !serverSet.has(s));
        if (localOnly.length > 0) {
          const rows = localOnly.map((slug) => ({ user_id: user.id, team_slug: slug }));
          sb
            .from('user_pins')
            .upsert(rows, { onConflict: 'user_id,team_slug' })
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
        .from('user_pins')
        .upsert({ user_id: user.id, team_slug: slug }, { onConflict: 'user_id,team_slug' });
    } catch { /* swallow */ }
  }, [user]);

  /** Call after removePinnedTeam(slug) when user is authenticated. */
  const removeServerPin = useCallback(async (slug) => {
    if (!user?.id || !slug) return;
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb
        .from('user_pins')
        .delete()
        .eq('user_id', user.id)
        .eq('team_slug', slug);
    } catch { /* swallow */ }
  }, [user]);

  // ── Write-through: Home pin/unpin → user_teams ───────────────────────────
  // When PinnedTeamsSection dispatches a 'home' event while signed in,
  // mirror the change to the user_teams table so Settings "My Teams" is canonical.
  const prevSlugsRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;

    return onPinnedChanged(async ({ pinnedSlugs, source }) => {
      if (source !== 'home') return;  // only react to Home actions; avoid loops
      const sb = getSupabase();
      if (!sb) return;

      const prev = prevSlugsRef.current ?? [];
      prevSlugsRef.current = pinnedSlugs;

      const prevSet = new Set(prev);
      const nextSet = new Set(pinnedSlugs);

      // Slugs newly added
      const added = pinnedSlugs.filter((s) => !prevSet.has(s));
      // Slugs removed
      const removed = prev.filter((s) => !nextSet.has(s));

      try {
        if (added.length > 0) {
          const rows = added.map((slug) => ({
            user_id: user.id,
            team_slug: slug,
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
      } catch { /* swallow — best effort */ }
    });
  }, [user]);

  return { addServerPin, removeServerPin };
}
