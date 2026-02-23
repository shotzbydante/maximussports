/**
 * Maximus's Insight — ATS (Against The Spread) record bubble.
 * Uses Odds API historical odds + ESPN schedule to compute real ATS.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchTeamPage } from '../../api/team';
import { matchOddsHistoryToEvent } from '../../api/odds';
import { getTeamBySlug } from '../../data/teams';
import { SEASON_START } from '../../utils/dateChunks';
import { computeATSForEvent, aggregateATS } from '../../utils/ats';
import { getAtsCache, setAtsCache } from '../../utils/atsCache';
import SourceBadge from '../shared/SourceBadge';
import styles from './MaximusInsight.module.css';

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

export function computeAtsFromScheduleAndHistory(schedule, oddsHistory, teamName) {
  const past = (schedule?.events || [])
    .filter((e) => e.isFinal)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (past.length === 0) return { season: null, last30: null, last7: null };
  const oddsGames = oddsHistory?.games ?? [];
  const now = new Date();
  const thirtyAgo = new Date(now);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const sevenAgo = new Date(now);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const outcomes = past.map((ev) => {
    const odds = matchOddsHistoryToEvent(ev, oddsGames, teamName);
    return computeATSForEvent(ev, odds, teamName);
  });
  const withDate = past.map((ev, i) => ({ ev, outcome: outcomes[i], date: ev.date }));
  const seasonOutcomes = withDate
    .filter(({ date }) => date && new Date(date) >= new Date(SEASON_START))
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
  return {
    season: aggregateATS(seasonOutcomes),
    last30: aggregateATS(last30Outcomes),
    last7: aggregateATS(last7Outcomes),
  };
}

export default function MaximusInsight({ slug, initialData, atsOnly = false }) {
  const [atsData, setAtsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug || !initialData?.schedule || !initialData?.oddsHistory) return;
    const team = getTeamBySlug(slug);
    if (!team) return;
    try {
      const data = computeAtsFromScheduleAndHistory(initialData.schedule, initialData.oddsHistory, team.name);
      setAtsData(data);
      setAtsCache(slug, data);
      setLoading(false);
      setError(null);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [slug, initialData]);

  const loadData = useCallback(async (skipLoadingState = false) => {
    if (!slug) return;
    const team = getTeamBySlug(slug);
    if (!team) return;

    if (!skipLoadingState) {
      setLoading(true);
      setError(null);
    }

    try {
      const data = await fetchTeamPage(slug);
      const past = (data?.schedule?.events || [])
        .filter((e) => e.isFinal)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (past.length === 0) {
        setAtsData({ season: null, last30: null, last7: null });
        setLoading(false);
        return;
      }

      const oddsGames = data?.oddsHistory?.games ?? [];
      const now = new Date();
      const thirtyAgo = new Date(now);
      thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const sevenAgo = new Date(now);
      sevenAgo.setDate(sevenAgo.getDate() - 7);

      const outcomes = past.map((ev) => {
        const odds = matchOddsHistoryToEvent(ev, oddsGames, team.name);
        return computeATSForEvent(ev, odds, team.name);
      });

      const withDate = past.map((ev, i) => ({ ev, outcome: outcomes[i], date: ev.date }));

      const seasonOutcomes = withDate
        .filter(({ date }) => date && new Date(date) >= new Date(SEASON_START))
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

      const atsResult = {
        season: aggregateATS(seasonOutcomes),
        last30: aggregateATS(last30Outcomes),
        last7: aggregateATS(last7Outcomes),
      };
      setAtsData(atsResult);
      setAtsCache(slug, atsResult);
    } catch (err) {
      setError(err.message);
      setAtsData(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    if (initialData?.schedule && initialData?.oddsHistory) return;
    const cached = getAtsCache(slug);
    if (cached) {
      setAtsData(cached);
      setLoading(false);
      loadData(true);
    } else {
      loadData(false);
    }
  }, [slug, loadData, initialData]);

  if (!slug) return null;

  return (
    <section className={styles.bubble}>
      {atsOnly ? (
        <div className={styles.header}>
          <h3 className={styles.title}>ATS</h3>
          <SourceBadge source="Odds API" />
        </div>
      ) : (
        <div className={styles.header}>
          <img src="/mascot.png" alt="" className={styles.headerMascot} aria-hidden />
          <h3 className={styles.title}>Maximus&apos;s Insight</h3>
          <SourceBadge source="Odds API" />
        </div>
      )}
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

        {!loading && !error && !atsData && slug && (
          <p className={styles.hint}>No schedule or team ID — check if team is in ESPN MBB.</p>
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
