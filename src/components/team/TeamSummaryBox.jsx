/**
 * Maximus's Intel Briefing — premium editorial team summary.
 * Synthesizes team, schedule, ATS, news, rank, and next-line data into a
 * concise, punchy intel briefing. Local-first with optional LLM enhancement.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { formatTeamInsight } from '../../utils/teamInsightFormatter';
import { getCached, setCached } from '../../utils/ytClientCache';
import { track } from '../../analytics/index';
import FormattedSummary from '../shared/FormattedSummary';
import styles from './TeamSummaryBox.module.css';

const LLM_CACHE_TTL_MS = 5 * 60 * 1000;

export default function TeamSummaryBox({ slug, team, schedule, ats, news, rank = null, nextLine = null, championshipOdds = null, dataReady = true }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [llmSummary, setLlmSummary] = useState(null);
  const [llmRefreshing, setLlmRefreshing] = useState(false);
  const fetchedSlugRef = useRef(null);

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
    championshipOdds: championshipOdds ?? null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [team, schedule, ats, newsKey, rank, nextLine, championshipOdds]);

  const localSummary = useMemo(() => {
    if (!team || !dataReady) return '';
    return formatTeamInsight(summaryData);
  }, [team, dataReady, summaryData, refreshTick]);

  useEffect(() => {
    if (!slug || !dataReady) return;
    if (fetchedSlugRef.current === slug) return;
    fetchedSlugRef.current = slug;

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

  const handleRefresh = () => {
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
    <section className={styles.briefing} aria-labelledby="team-briefing-title">
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <img src="/mascot.png" alt="" className={styles.mascot} aria-hidden />
          <h2 id="team-briefing-title" className={styles.title}>Intel Briefing</h2>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={handleRefresh}
          disabled={llmRefreshing}
          aria-label="Refresh briefing"
          title="Refresh intel"
        >
          {llmRefreshing ? '↻' : '↻'}
        </button>
      </div>
      <div className={styles.body}>
        {displayText ? (
          <FormattedSummary text={displayText} className={styles.text} />
        ) : (
          <p className={styles.text}>Loading today&apos;s intel…</p>
        )}
      </div>
    </section>
  );
}
