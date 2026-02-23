/**
 * ATS Leaderboard — Top 10 best / Top 10 worst ATS (Season, Last 30, Last 7).
 * Uses rankings + teamIds + schedule + odds history (existing logic).
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchRankings } from '../../api/rankings';
import { fetchTeamIds } from '../../api/teamIds';
import { fetchTeamSchedule } from '../../api/schedule';
import { fetchOddsHistory, matchOddsHistoryToEvent } from '../../api/odds';
import { buildSlugToIdFromRankings } from '../../utils/teamIdMap';
import { getSlugFromRankingsName } from '../../utils/rankingsNormalize';
import { getTeamBySlug } from '../../data/teams';
import { TEAMS } from '../../data/teams';
import { getTeamSlug } from '../../utils/teamSlug';
import { SEASON_START } from '../../utils/dateChunks';
import { computeATSForEvent, aggregateATS } from '../../utils/ats';
import SourceBadge from '../shared/SourceBadge';
import TeamLogo from '../shared/TeamLogo';
import styles from './ATSLeaderboard.module.css';

const PERIODS = [
  { key: 'season', label: 'Season' },
  { key: 'last30', label: 'Last 30' },
  { key: 'last7', label: 'Last 7' },
];

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export default function ATSLeaderboard() {
  const [period, setPeriod] = useState('season');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
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

      const rankings = rankingsRes.status === 'fulfilled' ? (rankingsRes.value?.rankings || []) : [];
      const teamSlugs = [];
      for (const r of rankings.slice(0, 18)) {
        const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, TEAMS);
        if (slug && slugToId[slug]) {
          const team = getTeamBySlug(slug);
          teamSlugs.push({ slug, name: team?.name ?? r.teamName });
        }
      }

      const now = new Date();
      const thirtyAgo = new Date(now);
      thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const sevenAgo = new Date(now);
      sevenAgo.setDate(sevenAgo.getDate() - 7);

      const from = SEASON_START;
      const to = toDateStr(now);
      let oddsGames = [];
      try {
        const hist = await fetchOddsHistory({ from, to });
        oddsGames = hist?.games ?? [];
      } catch {
        setRows([]);
        setLoading(false);
        return;
      }

      const results = [];
      for (const { slug, name } of teamSlugs) {
        const teamId = slugToId[slug];
        if (!teamId) continue;
        try {
          const sched = await fetchTeamSchedule(teamId);
          const past = (sched?.events || []).filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
          if (past.length === 0) continue;
          const outcomes = past.map((ev) => {
            const odds = matchOddsHistoryToEvent(ev, oddsGames, name);
            return computeATSForEvent(ev, odds, name);
          });
          const withDate = past.map((ev, i) => ({ ev, outcome: outcomes[i], date: ev.date }));
          const seasonOut = withDate.filter(({ date }) => date && new Date(date) >= new Date(SEASON_START)).map(({ outcome }) => outcome).filter(Boolean);
          const last30Out = withDate.filter(({ date }) => date && new Date(date) >= thirtyAgo).map(({ outcome }) => outcome).filter(Boolean);
          const last7Out = withDate.filter(({ date }) => date && new Date(date) >= sevenAgo).map(({ outcome }) => outcome).filter(Boolean);
          results.push({
            slug,
            name,
            season: aggregateATS(seasonOut),
            last30: aggregateATS(last30Out),
            last7: aggregateATS(last7Out),
          });
        } catch {
          // skip team
        }
      }

      setRows(results);
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const periodKey = period;
  const sorted = [...rows]
    .map((r) => ({ ...r, rec: r[periodKey] }))
    .filter((r) => r.rec?.total > 0)
    .sort((a, b) => (b.rec.coverPct ?? 0) - (a.rec.coverPct ?? 0));

  const best10 = sorted.slice(0, 10);
  const worst10 = sorted.slice(-10).reverse();

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>ATS Leaderboard</h3>
        <div className={styles.headerRight}>
          <div className={styles.pills}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`${styles.pill} ${period === p.key ? styles.pillActive : ''}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <SourceBadge source="Odds API" />
        </div>
      </div>
      <div className={styles.content}>
        {loading && <div className={styles.loading}>Loading ATS…</div>}
        {error && <div className={styles.error}>{error}</div>}
        {!loading && !error && (
          <div className={styles.grid}>
            <div className={styles.col}>
              <span className={styles.colLabel}>Top 10 (cover %)</span>
              <ul className={styles.list}>
                {best10.map((r, i) => (
                  <li key={r.slug} className={styles.row}>
                    <span className={styles.rank}>{i + 1}</span>
                    <span className={styles.teamCell}>
                      <span className={styles.teamLogoWrap}>
                        <TeamLogo team={getTeamBySlug(r.slug) || { slug: r.slug, name: r.name }} size={24} />
                      </span>
                      <Link to={`/teams/${r.slug}`} className={styles.teamLink}>{r.name}</Link>
                    </span>
                    <span className={styles.rec}>
                      {r.rec.w}-{r.rec.l}{r.rec.p > 0 ? `-${r.rec.p}` : ''}
                      {r.rec.coverPct != null && ` (${r.rec.coverPct}%)`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.col}>
              <span className={styles.colLabel}>Bottom 10</span>
              <ul className={styles.list}>
                {worst10.map((r, i) => (
                  <li key={r.slug} className={styles.row}>
                    <span className={styles.rank}>{sorted.length - i}</span>
                    <span className={styles.teamCell}>
                      <span className={styles.teamLogoWrap}>
                        <TeamLogo team={getTeamBySlug(r.slug) || { slug: r.slug, name: r.name }} size={24} />
                      </span>
                      <Link to={`/teams/${r.slug}`} className={styles.teamLink}>{r.name}</Link>
                    </span>
                    <span className={styles.rec}>
                      {r.rec.w}-{r.rec.l}{r.rec.p > 0 ? `-${r.rec.p}` : ''}
                      {r.rec.coverPct != null && ` (${r.rec.coverPct}%)`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
