/**
 * ATS Leaderboard — Top 10 best / Top 10 worst ATS (Season, Last 30, Last 7).
 * Data from /api/home (atsLeaders). When atsLeaders prop is provided, no fetch.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import SourceBadge from '../shared/SourceBadge';
import TeamLogo from '../shared/TeamLogo';
import styles from './ATSLeaderboard.module.css';

const PERIODS = [
  { key: 'season', label: 'Season' },
  { key: 'last30', label: 'Last 30' },
  { key: 'last7', label: 'Last 7' },
];

export default function ATSLeaderboard({ atsLeaders = { best: [], worst: [] }, slowLoading = false }) {
  const [period, setPeriod] = useState('season');
  const best = atsLeaders.best || [];
  const worst = atsLeaders.worst || [];
  const loading = slowLoading && best.length === 0 && worst.length === 0;
  const error = null;

  const periodKey = period;
  const best10 = best.map((r) => ({ ...r, rec: r[periodKey] })).filter((r) => r.rec?.total > 0);
  const worst10 = worst.map((r) => ({ ...r, rec: r[periodKey] })).filter((r) => r.rec?.total > 0);

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
                    <span className={styles.rank}>{worst10.length - i}</span>
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
