/**
 * Full Schedule — past + upcoming games from ESPN.
 * Uses /api/schedule/:teamId. Requires slug → ESPN team ID mapping.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchRankings } from '../../api/rankings';
import { fetchTeamIds } from '../../api/teamIds';
import { fetchTeamSchedule } from '../../api/schedule';
import { buildSlugToIdFromRankings } from '../../utils/teamIdMap';
import { TEAMS } from '../../data/teams';
import SourceBadge from '../shared/SourceBadge';
import styles from './TeamSchedule.module.css';

function formatDatePST(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatTimePST(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export default function TeamSchedule({ slug }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teamId, setTeamId] = useState(null);

  const resolveTeamId = useCallback(async () => {
    const [rankingsRes, teamIdsRes] = await Promise.allSettled([
      fetchRankings(),
      fetchTeamIds(),
    ]);

    const slugToId = {};

    if (rankingsRes.status === 'fulfilled' && rankingsRes.value?.rankings) {
      const fromRankings = buildSlugToIdFromRankings(rankingsRes.value);
      Object.assign(slugToId, fromRankings);
    }

    if (teamIdsRes.status === 'fulfilled' && teamIdsRes.value?.slugToId) {
      Object.assign(slugToId, teamIdsRes.value.slugToId);
    }

    return slugToId[slug] || null;
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    resolveTeamId()
      .then((id) => {
        if (cancelled) return;
        setTeamId(id);
        if (!id) {
          setEvents([]);
          setLoading(false);
          return;
        }
        return fetchTeamSchedule(id);
      })
      .then((data) => {
        if (cancelled) return;
        if (data) setEvents(data?.events || []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug, resolveTeamId]);

  if (!slug) return null;

  const past = events.filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
  const upcoming = events.filter((e) => !e.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Full Schedule</h2>
        <SourceBadge source="ESPN" />
      </div>

      {loading && (
        <div className={styles.loading}>
          <span className={styles.spinner} />
          <span>Loading schedule…</span>
        </div>
      )}

      {!loading && !teamId && (
        <div className={styles.unavailable}>Schedule unavailable</div>
      )}

      {!loading && error && (
        <div className={styles.error}>{error}</div>
      )}

      {!loading && teamId && !error && events.length === 0 && (
        <div className={styles.empty}>No games found</div>
      )}

      {!loading && teamId && !error && events.length > 0 && (
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.rowHeader}`}>
            <span>Date</span>
            <span>Opponent</span>
            <span>Result</span>
            <span>Status</span>
          </div>

          {past.length > 0 && (
            <>
              <div className={styles.groupLabel}>Past</div>
              {past.slice(0, 20).map((ev) => (
                <div key={ev.id} className={styles.row}>
                  <span className={styles.colDate}>{formatDatePST(ev.date)}</span>
                  <span className={styles.colOpp}>
                    {ev.homeAway === 'home' ? 'vs' : '@'} {ev.opponent}
                  </span>
                  <span className={styles.colResult}>
                    {ev.ourScore}–{ev.oppScore}
                  </span>
                  <span className={styles.colStatus}>{ev.status}</span>
                </div>
              ))}
            </>
          )}

          {upcoming.length > 0 && (
            <>
              <div className={styles.groupLabel}>Upcoming</div>
              {upcoming.map((ev) => (
                <div key={ev.id} className={styles.row}>
                  <span className={styles.colDate}>
                    {formatDatePST(ev.date)} {formatTimePST(ev.date)} PST
                  </span>
                  <span className={styles.colOpp}>
                    {ev.homeAway === 'home' ? 'vs' : '@'} {ev.opponent}
                  </span>
                  <span className={styles.colResult}>—</span>
                  <span className={styles.colStatus}>{ev.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
