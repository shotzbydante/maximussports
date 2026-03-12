/**
 * Full Schedule — past + upcoming games with ATS badges and opponent links.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchTeamPage } from '../../api/team';
import { matchOddsHistoryToEvent } from '../../api/odds';
import { computeATSForEvent } from '../../utils/ats';
import { getTeamBySlug } from '../../data/teams';
import { getTeamSlug } from '../../utils/teamSlug';
import { buildMatchupSlug } from '../../utils/matchupSlug';
import SourceBadge from '../shared/SourceBadge';
import styles from './TeamSchedule.module.css';

function formatDatePST(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch { return '—'; }
}

function formatTimePST(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return '—'; }
}

export default function TeamSchedule({ slug, initialData }) {
  const [events, setEvents] = useState([]);
  const [oddsHistoryGames, setOddsHistoryGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    if (initialData?.schedule || initialData?.oddsHistory || initialData?.teamId != null) {
      setEvents(initialData.schedule?.events || []);
      setTeamId(initialData.teamId ?? null);
      setOddsHistoryGames(initialData.oddsHistory?.games ?? []);
      setLoading(false); setError(null); return;
    }
    let cancelled = false;
    setLoading(true); setError(null);
    fetchTeamPage(slug)
      .then((data) => {
        if (cancelled) return;
        setEvents(data?.schedule?.events || []);
        setTeamId(data?.teamId ?? null);
        setOddsHistoryGames(data?.oddsHistory?.games ?? []);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load schedule'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, initialData?.schedule, initialData?.oddsHistory, initialData?.teamId]);

  if (!slug) return null;

  const team = getTeamBySlug(slug);
  const teamName = team?.name ?? '';
  const eventsList = Array.isArray(events) ? events : [];
  const pastGames = eventsList.filter((e) => e?.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
  const upcoming = eventsList.filter((e) => !e?.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date));
  const displayPast = showAll ? pastGames : pastGames.slice(0, 10);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Full Schedule</h2>
        <div className={styles.sourceBadges}>
          <SourceBadge source="ESPN" />
          {oddsHistoryGames.length > 0 && <SourceBadge source="Odds API" />}
        </div>
      </div>

      {loading && (
        <div className={styles.loading}><span className={styles.spinner} /><span>Loading schedule…</span></div>
      )}

      {!loading && !teamId && (
        <div className={styles.unavailable} role="alert">No schedule data available for this team.</div>
      )}

      {!loading && error && <div className={styles.error}>{error}</div>}

      {!loading && teamId && !error && eventsList.length === 0 && (
        <div className={styles.empty}>No games found</div>
      )}

      {!loading && teamId && !error && eventsList.length > 0 && (
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.rowHeader}`}>
            <span>Date</span>
            <span>Opponent</span>
            <span>Spread</span>
            <span>Result</span>
            <span>Status</span>
          </div>

          {pastGames.length > 0 && (
            <>
              <div className={styles.groupLabel}>Past</div>
              {displayPast.map((ev) => {
                const histOdds = matchOddsHistoryToEvent(ev, oddsHistoryGames, teamName);
                const spread = histOdds?.spread ?? '—';
                const ats = computeATSForEvent(ev, histOdds, teamName);
                const scoreStr = ev.ourScore != null && ev.oppScore != null ? `${ev.ourScore}–${ev.oppScore}` : '—';
                const oppSlug = getTeamSlug(ev.opponent);
                return (
                  <div key={ev.id} className={`${styles.row} ${styles.rowPast}`}>
                    <span className={styles.colDate}>{formatDatePST(ev.date)}</span>
                    <span className={styles.colOpp}>
                      {ev.homeAway === 'home' ? 'vs' : '@'}{' '}
                      {oppSlug ? <Link to={`/teams/${oppSlug}`} className={styles.oppLink}>{ev.opponent}</Link> : ev.opponent}
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
              {pastGames.length > 10 && (
                <button type="button" className={styles.showAllBtn} onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show recent 10' : `Show all ${pastGames.length} games`}
                </button>
              )}
            </>
          )}

          {Array.isArray(upcoming) && upcoming.length > 0 && (
            <>
              <div className={styles.groupLabel}>Upcoming</div>
              {upcoming.map((ev) => {
                const oppSlug = getTeamSlug(ev.opponent);
                const matchupLink = oppSlug ? `/games/${buildMatchupSlug(slug, oppSlug)}` : null;
                return (
                  <div key={ev.id} className={styles.row}>
                    <span className={styles.colDate}>
                      {formatDatePST(ev.date)} {formatTimePST(ev.date)} PST
                    </span>
                    <span className={styles.colOpp}>
                      {ev.homeAway === 'home' ? 'vs' : '@'}{' '}
                      {oppSlug ? <Link to={`/teams/${oppSlug}`} className={styles.oppLink}>{ev.opponent}</Link> : ev.opponent}
                    </span>
                    <span className={styles.colOdds}>—</span>
                    <span className={styles.colResult}>
                      {matchupLink && <Link to={matchupLink} className={styles.matchupLink}>Preview →</Link>}
                      {!matchupLink && '—'}
                    </span>
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
