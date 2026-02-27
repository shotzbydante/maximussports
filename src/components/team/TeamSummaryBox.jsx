/**
 * Maximus's Insight — instant client-side team summary. Chat/speech bubble style.
 * Synthesizes team, schedule, ATS, news, rank, and next-line data already on the page.
 * No streaming, no summary API calls. Renders with FormattedSummary (bold/italic/emojis).
 * Refresh button recomputes summary from current page data (no network).
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { generateChatSummary } from '../../utils/chatSummary';
import FormattedSummary from '../shared/FormattedSummary';
import styles from './TeamSummaryBox.module.css';

export default function TeamSummaryBox({ slug, team, schedule, ats, news, rank = null, nextLine = null, dataReady = true }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [llmSummary, setLlmSummary] = useState(null);
  const [llmRefreshing, setLlmRefreshing] = useState(false);
  const fetchedSlugRef = useRef(null);

  const summaryData = useMemo(() => ({
    team: team || {},
    schedule: schedule ?? { upcoming: [], recent: [] },
    ats: ats ?? {},
    news: Array.isArray(news) ? news.slice(0, 3) : [],
    rank: rank ?? undefined,
    nextLine: nextLine ?? {},
  }), [team, schedule, ats, news, rank, nextLine]);

  const localSummary = useMemo(() => {
    if (!team || !dataReady) return '';
    return generateChatSummary('team', summaryData);
  }, [team, dataReady, summaryData, refreshTick]);

  // Fetch LLM summary in background once slug is available; replace local when ready.
  useEffect(() => {
    if (!slug || !dataReady) return;
    if (fetchedSlugRef.current === slug) return;
    fetchedSlugRef.current = slug;
    let cancelled = false;
    fetch(`/api/chat/teamSummary?teamSlug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.summary) setLlmSummary(d.summary);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug, dataReady]);

  const handleRefreshSummary = () => {
    setRefreshTick((t) => t + 1);
    if (!slug || llmRefreshing) return;
    setLlmRefreshing(true);
    fetch(`/api/chat/teamSummary?teamSlug=${encodeURIComponent(slug)}&force=1`)
      .then((r) => r.json())
      .then((d) => {
        setLlmRefreshing(false);
        if (d?.summary) setLlmSummary(d.summary);
      })
      .catch(() => { setLlmRefreshing(false); });
  };

  if (!slug || !team) return null;

  const displayText = llmSummary || localSummary;

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
