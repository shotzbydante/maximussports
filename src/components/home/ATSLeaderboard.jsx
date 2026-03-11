/**
 * ATS Leaderboard — Top 10 best / Top 10 worst ATS (Season, Last 30, Last 7).
 * Props: atsLeaders, atsMeta (status FULL|FALLBACK|EMPTY, reason, stage, elapsedMs), loading, onRetry.
 * Loading → progress bar + status line; EMPTY → empty state + Retry; after 20s waiting → "Still working… Retry".
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { shouldShowAtsLoading, shouldShowAtsEmptyState } from '../../utils/atsLeaderboardUI';
import SourceBadge from '../shared/SourceBadge';
import TeamLogo from '../shared/TeamLogo';
import styles from './ATSLeaderboard.module.css';

const PERIODS = [
  { key: 'last30', label: 'Last 30' },
  { key: 'last7', label: 'Last 7' },
  { key: 'season', label: 'Season' },
];

const ATS_LOADING_SLOW_MS = 20000;

function statusMessageFromStage(stage, isProxy) {
  if (stage === 'kv_stale') return 'refreshing cache';
  if (stage === 'kv_last_known') return 'refreshing cache';
  if (stage === 'cache_hit_real') return null;
  if (stage === 'done' && isProxy) return 'upgrading to full league';
  if (stage === 'done') return null;
  return 'warming cache / computing league ATS';
}

export default function ATSLeaderboard({
  atsLeaders = { best: [], worst: [] },
  atsMeta = null,
  loading = false,
  onRetry = null,
  slowLoading = false,
  atsWarming = false,
  atsLoading = false,
  atsLeadersSourceLabel = null,
  atsWindow = 'last30',
  seasonWarming = false,
  onPeriodChange = null,
  teaserMode = false,
}) {
  const [period, setPeriod] = useState(atsWindow || 'last30');
  const [now, setNow] = useState(() => Date.now());
  const loadStartRef = useRef(null);
  useEffect(() => {
    setPeriod(atsWindow || 'last30');
  }, [atsWindow]);
  const best = atsLeaders.best || [];
  const worst = atsLeaders.worst || [];
  const hasData = best.length > 0 || worst.length > 0;
  const status = atsMeta?.status ?? (hasData ? 'FULL' : 'EMPTY');
  const showLoading = loading || ((slowLoading || atsWarming || atsLoading) && !hasData && status !== 'EMPTY');
  const showProgressFromHelper = shouldShowAtsLoading(atsLeaders, atsMeta);
  const isFallback = status === 'FALLBACK' || (atsLeadersSourceLabel && atsLeadersSourceLabel !== 'Full league');
  const isRealTeamAts = atsMeta?.cacheNote === 'computed_recent_team_ats' || (atsMeta?.sourceLabel && atsMeta.sourceLabel.includes('recent ATS'));
  const isProxy = !isRealTeamAts && status === 'FALLBACK' && (atsMeta?.confidence === 'low' || (atsMeta?.sourceLabel && atsMeta.sourceLabel.toLowerCase().includes('fallback')));
  // Don't show progress UI when serving from lastKnown — show data with a stale badge instead.
  const isLastKnown = atsMeta?.source === 'kv_last_known' || atsMeta?.stage === 'kv_last_known';
  const showProgressUI = !isLastKnown && (showLoading || showProgressFromHelper || (hasData && isProxy));
  // Show a subtle stale badge when data came from lastKnown cache or a kv_stale hit with data.
  const showStaleBadge = hasData && (isLastKnown || (atsMeta?.stage === 'kv_stale' && !showLoading));
  const showEmpty = shouldShowAtsEmptyState(atsLeaders, atsMeta);
  if (showProgressUI && loadStartRef.current == null) loadStartRef.current = Date.now();
  if (!showProgressUI) loadStartRef.current = null;
  useEffect(() => {
    if (!showProgressUI) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showProgressUI]);
  const waitingElapsedMs = loadStartRef.current != null ? now - loadStartRef.current : 0;
  const showSlowMessage = showProgressUI && waitingElapsedMs >= ATS_LOADING_SLOW_MS;
  const progressPercent = (atsMeta?.teamCountAttempted != null && atsMeta?.teamCountCompleted != null && atsMeta.teamCountAttempted > 0)
    ? Math.round((100 * atsMeta.teamCountCompleted) / atsMeta.teamCountAttempted)
    : null;
  const prevCountRef = useRef(0);
  useEffect(() => {
    const count = best.length + worst.length;
    if (import.meta.env?.DEV && count > 0 && count !== prevCountRef.current) {
      console.log('[ATSLeaderboard] atsLeaders updated, re-render', { bestCount: best.length, worstCount: worst.length });
      prevCountRef.current = count;
    }
  }, [best.length, worst.length]);

  const periodKey = period;
  const teaserCap = teaserMode ? 3 : 10;
  const mapRec = (r) => ({ ...r, rec: r[periodKey] ?? r.rec ?? r.season });
  const best10 = best.map(mapRec)
    .filter((r) => r.rec?.total > 0)
    .sort((a, b) => (b.rec?.coverPct ?? 0) - (a.rec?.coverPct ?? 0))
    .slice(0, teaserCap);
  const worst10 = worst.map(mapRec)
    .filter((r) => r.rec?.total > 0)
    .sort((a, b) => (a.rec?.coverPct ?? 100) - (b.rec?.coverPct ?? 100))
    .slice(0, teaserCap);
  const showRecordAsNa = (rec) => isProxy || !rec || rec.total == null || (rec.total === 0 && (rec.w ?? 0) === 0 && (rec.l ?? 0) === 0);
  const recordLabel = (r) => {
    const rec = r.rec;
    if (showRecordAsNa(rec)) return 'N/A';
    const decided = (rec.w ?? 0) + (rec.l ?? 0);
    if (decided === 0) return 'N/A';
    const wl = `${rec.w ?? 0}-${rec.l ?? 0}`;
    const push = (rec.p ?? 0) > 0 ? `-${rec.p}` : '';
    const pct = rec.coverPct != null ? ` (${rec.coverPct}%)` : '';
    return `${wl}${push}${pct}`;
  };

  const showSeasonWarming = seasonWarming && period === 'season';
  const headerTitle =
    status === 'FULL'
      ? 'ATS Leaders (full league)'
      : isRealTeamAts || (status === 'FALLBACK' && (atsMeta?.confidence === 'medium' || atsMeta?.confidence === 'high') && (atsMeta?.sourceLabel?.includes('Pinned') || atsMeta?.sourceLabel?.includes('recent ATS')))
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

  const loadingStatusMsg = statusMessageFromStage(atsMeta?.stage, isProxy);

  return (
    <section className={styles.card}>
      {showProgressUI && (
        <div className={styles.progressWrap} role="progressbar" aria-valuenow={progressPercent ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label="Loading ATS Leaders">
          <div className={styles.progressTrack}>
            {progressPercent != null ? (
              <div className={styles.progressBar} style={{ width: `${Math.min(100, progressPercent)}%` }} />
            ) : (
              <div className={styles.progressBarIndeterminate} />
            )}
          </div>
        </div>
      )}
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>{headerTitle}</h3>
          {showProgressUI && loadingStatusMsg && (
            <span className={styles.loadingStatus}>Loading ATS Leaders… ({loadingStatusMsg})</span>
          )}
          {showStaleBadge && !showProgressUI && (
            <span className={styles.staleBadge}>Stale</span>
          )}
          {showSeasonWarming && (
            <span className={styles.sourceLabel}>Season warming — showing Last 30</span>
          )}
          {confidenceLabel && !showSeasonWarming && !showProgressUI && !showStaleBadge && (
            <span className={styles.sourceLabel}>
              {confidenceLabel}
              {atsMeta?.reason === 'client_last_known_fallback' || atsMeta?.reason === 'last_known_fallback'
                ? ' · Stale data'
                : (atsLeadersSourceLabel || atsMeta?.sourceLabel ? ` · ${atsLeadersSourceLabel || atsMeta.sourceLabel}` : '')}
            </span>
          )}
          {!confidenceLabel && (atsLeadersSourceLabel || atsMeta?.sourceLabel) && !showProgressUI && !showStaleBadge && (
            <span className={styles.sourceLabel}>
              {atsLeadersSourceLabel || atsMeta.sourceLabel}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          {!teaserMode && (
            <div className={styles.pills}>
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`${styles.pill} ${period === p.key ? styles.pillActive : ''}`}
                  onClick={() => {
                    setPeriod(p.key);
                    if (typeof onPeriodChange === 'function') onPeriodChange(p.key);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <SourceBadge source="Odds API" />
        </div>
      </div>
      <div className={styles.content}>
        {showSlowMessage && !hasData && (
          <div className={styles.slowMessage}>
            <p className={styles.slowMessageText}>Still working…</p>
            {typeof onRetry === 'function' && (
              <button type="button" className={styles.retryButton} onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}
        {showLoading && !showSlowMessage && <div className={styles.loading}>Loading ATS…</div>}
        {showEmpty && !showLoading && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateMessage}>ATS not available right now.</p>
            {atsMeta?.reason && (
              <p className={styles.emptyStateReason}>
                {atsMeta.reason === 'ats_data_warming' ? 'ATS data warming up.' : atsMeta.reason}
              </p>
            )}
            {typeof onRetry === 'function' && (
              <button type="button" className={styles.retryButton} onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}
        {!showLoading && !showEmpty && hasData && (
          <>
            {(best10.length < 10 || worst10.length < 10) && (best10.length > 0 || worst10.length > 0) && (
              <p className={styles.insufficientNote}>Insufficient data for full leaderboard. Showing {best10.length} top and {worst10.length} bottom.</p>
            )}
            <div className={styles.grid}>
            <div className={styles.col}>
              <span className={styles.colLabel}>{teaserMode ? 'ATS Hot' : 'Top 10'} (cover %)</span>
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
              <span className={styles.colLabel}>{teaserMode ? 'ATS Cold' : 'Bottom 10'}</span>
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
          </>
        )}
      </div>
    </section>
  );
}
