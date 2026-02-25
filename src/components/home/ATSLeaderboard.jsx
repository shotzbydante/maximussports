/**
 * ATS Leaderboard — Top 10 best / Top 10 worst ATS (Season, Last 30, Last 7).
 * Props: atsLeaders, atsMeta (status FULL|FALLBACK|EMPTY, reason), loading, onRetry.
 * Loading → skeleton; EMPTY → empty state + Retry; FALLBACK → optional label; FULL → normal.
 */

import { useState, useEffect, useRef } from 'react';
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

export default function ATSLeaderboard({
  atsLeaders = { best: [], worst: [] },
  atsMeta = null,
  loading = false,
  onRetry = null,
  slowLoading = false,
  atsWarming = false,
  atsLoading = false,
  atsLeadersSourceLabel = null,
}) {
  const [period, setPeriod] = useState('season');
  const best = atsLeaders.best || [];
  const worst = atsLeaders.worst || [];
  const hasData = best.length > 0 || worst.length > 0;
  const status = atsMeta?.status ?? (hasData ? 'FULL' : 'EMPTY');
  const showLoading = loading || ((slowLoading || atsWarming || atsLoading) && !hasData && status !== 'EMPTY');
  const showEmpty = status === 'EMPTY' || (!hasData && atsMeta != null);
  const isFallback = status === 'FALLBACK' || (atsLeadersSourceLabel && atsLeadersSourceLabel !== 'Full league');
  const prevCountRef = useRef(0);
  useEffect(() => {
    const count = best.length + worst.length;
    if (import.meta.env?.DEV && count > 0 && count !== prevCountRef.current) {
      console.log('[ATSLeaderboard] atsLeaders updated, re-render', { bestCount: best.length, worstCount: worst.length });
      prevCountRef.current = count;
    }
  }, [best.length, worst.length]);

  const periodKey = period;
  const isProxy = status === 'FALLBACK' && (atsMeta?.confidence === 'low' || (atsMeta?.sourceLabel && atsMeta.sourceLabel.toLowerCase().includes('fallback')));
  const best10 = best.map((r) => ({ ...r, rec: r[periodKey] ?? r.season }));
  const worst10 = worst.map((r) => ({ ...r, rec: r[periodKey] ?? r.season }));
  const showRecordAsNa = (rec) => isProxy || !rec?.total;
  const recordLabel = (r) => {
    const rec = r.rec;
    if (showRecordAsNa(rec)) return 'N/A';
    return `${rec.w}-${rec.l}${(rec.p > 0 ? `-${rec.p}` : '')}${rec.coverPct != null ? ` (${rec.coverPct}%)` : ''}`;
  };

  const headerTitle =
    status === 'FULL'
      ? 'ATS Leaders (full league)'
      : status === 'FALLBACK' && atsMeta?.confidence === 'medium' && (atsMeta?.sourceLabel?.includes('Pinned') || atsMeta?.sourceLabel?.includes('real'))
        ? 'ATS Leaders (real, Pinned + Top 25)'
        : isProxy
          ? 'ATS Leaders (Top 25 proxy)'
          : 'ATS Leaders';
  const confidenceLabel =
    status === 'FULL'
      ? 'High confidence'
      : atsMeta?.confidence === 'medium'
        ? 'Medium confidence'
        : atsMeta?.confidence === 'low'
          ? 'Low confidence'
          : null;

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>{headerTitle}</h3>
          {confidenceLabel && (
            <span className={styles.sourceLabel}>
              {confidenceLabel}
              {atsLeadersSourceLabel || atsMeta?.sourceLabel ? ` · ${atsLeadersSourceLabel || atsMeta.sourceLabel}` : ''}
            </span>
          )}
          {!confidenceLabel && (atsLeadersSourceLabel || atsMeta?.sourceLabel) && (
            <span className={styles.sourceLabel}>
              {atsLeadersSourceLabel || atsMeta.sourceLabel}
            </span>
          )}
        </div>
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
        {showLoading && <div className={styles.loading}>Loading ATS…</div>}
        {showEmpty && !showLoading && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateMessage}>ATS not available right now.</p>
            {atsMeta?.reason && <p className={styles.emptyStateReason}>{atsMeta.reason}</p>}
            {typeof onRetry === 'function' && (
              <button type="button" className={styles.retryButton} onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}
        {!showLoading && !showEmpty && hasData && (
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
                    <span className={styles.rec}>{recordLabel(r)}</span>
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
                    <span className={styles.rec}>{recordLabel(r)}</span>
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
