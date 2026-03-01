/**
 * Maximus's Insight — instant client-side team summary. Chat/speech bubble style.
 * Synthesizes team, schedule, ATS, news, rank, and next-line data already on the page.
 * No streaming, no summary API calls. Renders with FormattedSummary (bold/italic/emojis).
 * Refresh button recomputes summary from current page data (no network).
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { formatTeamInsight } from '../../utils/teamInsightFormatter';
import { getCached, setCached } from '../../utils/ytClientCache';
import { track } from '../../analytics/index';
import FormattedSummary from '../shared/FormattedSummary';
import styles from './TeamSummaryBox.module.css';

const LLM_CACHE_TTL_MS = 5 * 60 * 1000;

export default function TeamSummaryBox({ slug, team, schedule, ats, news, rank = null, nextLine = null, dataReady = true }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [llmSummary, setLlmSummary] = useState(null);
  const [llmRefreshing, setLlmRefreshing] = useState(false);
  const fetchedSlugRef = useRef(null);

  // Stable content key for news array — recomputes only when actual content changes (not on
  // every render caused by inline .filter() calls in the parent).
  const newsKey = useMemo(
    () => (Array.isArray(news) ? news.map((n) => n.id || n.title || '').join('|') : ''),
    [news]
  );

  const summaryData = useMemo(() => ({
    team: team || {},
    schedule: schedule ?? { upcoming: [], recent: [] },
    ats: ats ?? {},
    news: Array.isArray(news) ? news.slice(0, 10) : [],
    rank: rank ?? undefined,
    nextLine: nextLine ?? {},
  // Explicit deps: recomputes when ATS, last7 headlines (via newsKey), nextLine, or schedule change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [team, schedule, ats, newsKey, rank, nextLine]);

  const localSummary = useMemo(() => {
    if (!team || !dataReady) return '';
    return formatTeamInsight(summaryData);
  }, [team, dataReady, summaryData, refreshTick]);

  // Fetch LLM summary in background once data is ready; cache 5 min to avoid refetch on navigation.
  useEffect(() => {
    if (!slug || !dataReady) return;
    if (fetchedSlugRef.current === slug) return;
    fetchedSlugRef.current = slug;

    // Serve from client cache if fresh
    const cacheKey = `teamInsight:${slug}`;
    const cached = getCached(cacheKey);
    if (cached) {
      setLlmSummary(cached);
      return;
    }

    let cancelled = false;
    fetch(`/api/chat/teamSummary?teamSlug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.summary) {
          setCached(cacheKey, d.summary, LLM_CACHE_TTL_MS);
          setLlmSummary(d.summary);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug, dataReady]);

  const handleRefreshSummary = () => {
    setRefreshTick((t) => t + 1);
    track('team_summary_refresh', { team_slug: slug });
    if (!slug || llmRefreshing) return;
    setLlmRefreshing(true);
    fetch(`/api/chat/teamSummary?teamSlug=${encodeURIComponent(slug)}&force=1`)
      .then((r) => r.json())
      .then((d) => {
        setLlmRefreshing(false);
        if (d?.summary) {
          setCached(`teamInsight:${slug}`, d.summary, LLM_CACHE_TTL_MS);
          setLlmSummary(d.summary);
        }
      })
      .catch(() => { setLlmRefreshing(false); });
  };

  if (!slug || !team) return null;

  const hasCanonicalAtsData = ats && (
    (ats.season?.total > 0 || ats.season?.w != null || ats.season?.wins != null) ||
    (ats.last30?.total > 0 || ats.last30?.w != null) ||
    (ats.last7?.total > 0 || ats.last7?.w != null)
  );
  const displayText = (hasCanonicalAtsData && localSummary) ? localSummary : (llmSummary || localSummary);

  return (
    <section className={styles.bubble} aria-labelledby="team-summary-title">
      <div className={styles.header}>
        <img src="/mascot.png" alt="" className={styles.headerMascot} aria-hidden />
        <h2 id="team-summary-title" className={styles.title}>Maximus&apos;s Insight</h2>
      </div>
      <div className={styles.content}>
        {displayText ? (
          <FormattedSummary text={displayText} className={styles.summaryText} />
        ) : (
          <p className={styles.summaryText}>Loading today&apos;s intel…</p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.refresh}
            onClick={handleRefreshSummary}
            disabled={llmRefreshing}
            aria-label="Refresh summary"
          >
            {llmRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
    </section>
  );
}
