/**
 * Maximus's Insight — ATS (Against The Spread) record bubble.
 * Uses Odds API historical odds + ESPN schedule to compute real ATS.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchRankings } from '../../api/rankings';
import { fetchTeamIds } from '../../api/teamIds';
import { fetchTeamSchedule } from '../../api/schedule';
import { fetchOddsHistory, matchOddsHistoryToEvent } from '../../api/odds';
import { buildSlugToIdFromRankings } from '../../utils/teamIdMap';
import { getTeamBySlug } from '../../data/teams';
import { computeATSForEvent, aggregateATS } from '../../utils/ats';
import SourceBadge from '../shared/SourceBadge';
import styles from './MaximusInsight.module.css';

/** NCAA season start (approx) */
function getSeasonStart() {
  const d = new Date();
  const year = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-11-01`;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function RecordRow({ label, rec }) {
  if (!rec || rec.total === 0) return null;
  const { w, l, p, total, coverPct } = rec;
  const decided = w + l;
  const pctStr = coverPct != null ? ` (${coverPct}% cover)` : '';
  return (
    <div className={styles.recordRow}>
      <span className={styles.recordLabel}>{label}</span>
      <span className={styles.recordValue}>
        {w}-{l}{p > 0 ? `-${p}` : ''}{pctStr}
      </span>
    </div>
  );
}

export default function MaximusInsight({ slug }) {
  const [atsData, setAtsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    if (!slug) return;
    const team = getTeamBySlug(slug);
    if (!team) return;

    setLoading(true);
    setError(null);

    try {
      const [rankingsRes, teamIdsRes] = await Promise.allSettled([
        fetchRankings(),
        fetchTeamIds(),
      ]);
      const slugToId = {};
      if (rankingsRes.status === 'fulfilled' && rankingsRes.value?.rankings) {
        Object.assign(slugToId, buildSlugToIdFromRankings(rankingsRes.value));
      }
      if (teamIdsRes.status === 'fulfilled' && teamIdsRes.value?.slugToId) {
        Object.assign(slugToId, teamIdsRes.value.slugToId);
      }

      const teamId = slugToId[slug];
      if (!teamId) {
        setAtsData(null);
        setLoading(false);
        return;
      }

      const sched = await fetchTeamSchedule(teamId);
      const past = (sched?.events || [])
        .filter((e) => e.isFinal)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (past.length === 0) {
        setAtsData({ season: null, last30: null, last7: null });
        setLoading(false);
        return;
      }

      const minDate = toDateStr(new Date(past[0].date));
      const maxDate = toDateStr(new Date(past[past.length - 1].date));
      const from = minDate;
      const to = maxDate;

      let oddsGames = [];
      try {
        const hist = await fetchOddsHistory({ from, to });
        oddsGames = hist?.games ?? [];
      } catch (err) {
        setError(err.message);
        setAtsData(null);
        setLoading(false);
        return;
      }

      const now = new Date();
      const thirtyAgo = new Date(now);
      thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const sevenAgo = new Date(now);
      sevenAgo.setDate(sevenAgo.getDate() - 7);
      const seasonStart = getSeasonStart();

      const outcomes = past.map((ev) => {
        const odds = matchOddsHistoryToEvent(ev, oddsGames, team.name);
        return computeATSForEvent(ev, odds, team.name);
      });

      const withDate = past.map((ev, i) => ({ ev, outcome: outcomes[i], date: ev.date }));

      const seasonOutcomes = withDate
        .filter(({ date }) => date && new Date(date) >= new Date(seasonStart))
        .map(({ outcome }) => outcome)
        .filter(Boolean);

      const last30Outcomes = withDate
        .filter(({ date }) => date && new Date(date) >= thirtyAgo)
        .map(({ outcome }) => outcome)
        .filter(Boolean);

      const last7Outcomes = withDate
        .filter(({ date }) => date && new Date(date) >= sevenAgo)
        .map(({ outcome }) => outcome)
        .filter(Boolean);

      setAtsData({
        season: aggregateATS(seasonOutcomes),
        last30: aggregateATS(last30Outcomes),
        last7: aggregateATS(last7Outcomes),
      });
    } catch (err) {
      setError(err.message);
      setAtsData(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!slug) return null;

  return (
    <section className={styles.bubble}>
      <div className={styles.header}>
        <h3 className={styles.title}>Maximus&apos;s Insight</h3>
        <SourceBadge source="Odds API" />
      </div>
      <div className={styles.content}>
        <p className={styles.label}>ATS (Against The Spread)</p>

        {loading && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            <span>Loading…</span>
          </div>
        )}

        {error && (
          <p className={styles.unavailable}>
            ATS unavailable — {error}
          </p>
        )}

        {!loading && !error && atsData && (
          <div className={styles.records}>
            <RecordRow label="Season to date" rec={atsData.season} />
            <RecordRow label="Last 30 days" rec={atsData.last30} />
            <RecordRow label="Last 7 days" rec={atsData.last7} />
            {!atsData.season?.total && !atsData.last30?.total && !atsData.last7?.total && (
              <p className={styles.hint}>No ATS data — historical odds require Odds API paid plan.</p>
            )}
          </div>
        )}

        {!loading && !error && !atsData && (
          <p className={styles.hint}>No schedule data.</p>
        )}
      </div>
    </section>
  );
}
