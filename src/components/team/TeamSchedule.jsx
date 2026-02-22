/**
 * Full Schedule — past + upcoming games from ESPN.
 * Uses /api/schedule/:teamId. Requires slug → ESPN team ID mapping.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchRankings } from '../../api/rankings';
import { fetchTeamIds } from '../../api/teamIds';
import { fetchTeamSchedule } from '../../api/schedule';
import { fetchOdds, fetchOddsHistory, matchOddsHistoryToEvent } from '../../api/odds';
import { computeATSForEvent } from '../../utils/ats';
import { buildSlugToIdFromRankings } from '../../utils/teamIdMap';
import { TEAMS, getTeamBySlug } from '../../data/teams';
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

function matchOddsToEvent(ev, oddsGames, teamName) {
  if (!oddsGames?.length || !teamName) return null;
  const evDate = ev.date ? new Date(ev.date).toISOString().slice(0, 10) : '';
  const norm = (s) => (s || '').toLowerCase().trim();
  const evOpp = norm(ev.opponent);
  const teamNorm = norm(teamName);
  for (const o of oddsGames) {
    const oDate = o.commenceTime ? new Date(o.commenceTime).toISOString().slice(0, 10) : '';
    if (oDate !== evDate) continue;
    const home = norm(o.homeTeam);
    const away = norm(o.awayTeam);
    const hasTeam = home.includes(teamNorm) || away.includes(teamNorm) || teamNorm.includes(home) || teamNorm.includes(away);
    const hasOpp = home.includes(evOpp) || away.includes(evOpp) || evOpp.includes(home) || evOpp.includes(away);
    if (hasTeam && hasOpp) return o;
  }
  return null;
}

export default function TeamSchedule({ slug }) {
  const [events, setEvents] = useState([]);
  const [oddsGames, setOddsGames] = useState([]);
  const [oddsHistoryGames, setOddsHistoryGames] = useState([]);
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

  useEffect(() => {
    fetchOdds()
      .then((res) => setOddsGames(res?.games ?? []))
      .catch(() => setOddsGames([]));
  }, []);

  const past = events.filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
  const pastDateRange = past.length > 0
    ? (() => {
        const dates = past.map((e) => e.date).filter(Boolean);
        const min = dates.reduce((a, b) => (a < b ? a : b));
        const max = dates.reduce((a, b) => (a > b ? a : b));
        return { from: new Date(min).toISOString().slice(0, 10), to: new Date(max).toISOString().slice(0, 10) };
      })()
    : null;

  useEffect(() => {
    if (!pastDateRange) {
      setOddsHistoryGames([]);
      return;
    }
    fetchOddsHistory(pastDateRange)
      .then((res) => setOddsHistoryGames(res?.games ?? []))
      .catch(() => setOddsHistoryGames([]));
  }, [pastDateRange?.from, pastDateRange?.to]);

  if (!slug) return null;

  const team = getTeamBySlug(slug);
  const teamName = team?.name ?? '';
  const upcoming = events.filter((e) => !e.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Full Schedule</h2>
        <div className={styles.sourceBadges}>
          <SourceBadge source="ESPN" />
          {(oddsGames.length > 0 || oddsHistoryGames.length > 0) && <SourceBadge source="Odds API" />}
        </div>
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
            <span>Spread / O/U</span>
            <span>Result</span>
            <span>Status</span>
          </div>

          {past.length > 0 && (
            <>
              <div className={styles.groupLabel}>Past</div>
              {past.slice(0, 20).map((ev) => {
                const histOdds = matchOddsHistoryToEvent(ev, oddsHistoryGames, teamName);
                const spread = histOdds?.spread ?? '—';
                const ats = computeATSForEvent(ev, histOdds, teamName);
                const scoreStr = ev.ourScore != null && ev.oppScore != null
                  ? `${ev.ourScore}–${ev.oppScore}`
                  : '—';
                return (
                  <div key={ev.id} className={`${styles.row} ${styles.rowPast}`}>
                    <span className={styles.colDate}>{formatDatePST(ev.date)}</span>
                    <span className={styles.colOpp}>
                      {ev.homeAway === 'home' ? 'vs' : '@'} {ev.opponent}
                    </span>
                    <span className={styles.colOdds}>{spread}</span>
                    <span className={styles.colResult}>
                      {scoreStr}
                      {ats && (
                        <span className={`${styles.atsBadge} ${styles[`ats${ats}`]}`} title={`ATS: ${ats === 'W' ? 'Cover' : ats === 'L' ? 'No cover' : 'Push'}`}>
                          {ats}
                        </span>
                      )}
                    </span>
                    <span className={styles.colStatus}>{ev.status}</span>
                  </div>
                );
              })}
            </>
          )}

          {upcoming.length > 0 && (
            <>
              <div className={styles.groupLabel}>Upcoming</div>
              {upcoming.map((ev) => {
                const odds = matchOddsToEvent(ev, oddsGames, teamName);
                const hasOdds = odds?.spread != null || odds?.total != null;
                return (
                  <div key={ev.id} className={styles.row}>
                    <span className={styles.colDate}>
                      {formatDatePST(ev.date)} {formatTimePST(ev.date)} PST
                    </span>
                    <span className={styles.colOpp}>
                      {ev.homeAway === 'home' ? 'vs' : '@'} {ev.opponent}
                    </span>
                    <span className={styles.colOdds}>
                      {hasOdds ? (
                        <span className={styles.oddsText}>
                          {odds.spread ?? '—'} / {odds.total != null ? `O/U ${odds.total}` : '—'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className={styles.colResult}>—</span>
                    <span className={styles.colStatus}>{ev.status}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </section>
  );
}
