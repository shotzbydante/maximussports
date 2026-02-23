/**
 * Maximus's Insight — GPT team briefing (upcoming games, last week, ATS, headlines).
 * Uses payload built from Team page data; refreshable, shows last updated (PST).
 */

import { useState, useEffect, useCallback } from 'react';
import { buildTeamSummaryPayload, fetchTeamSummaryFromPayload } from '../../api/summary';
import styles from './TeamSummaryBox.module.css';

function formatSummaryDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TeamSummaryBox({ slug, team, schedule, ats, news, dataReady = true }) {
  const [summary, setSummary] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async () => {
    const payload = buildTeamSummaryPayload({ team, schedule, ats, news });
    setLoading(true);
    setError(null);
    try {
      const { summary: text, updatedAt: ts, message } = await fetchTeamSummaryFromPayload({ slug, payload });
      setSummary(text ?? null);
      setUpdatedAt(ts ?? null);
      if (message) setError(message);
    } catch (err) {
      setError(err.message || 'Summary unavailable.');
      setSummary(null);
      setUpdatedAt(null);
    } finally {
      setLoading(false);
    }
  }, [slug, team, schedule, ats, news]);

  useEffect(() => {
    if (!slug || !team || !dataReady) return;
    loadSummary();
  }, [slug, dataReady, loadSummary]);

  if (!slug || !team) return null;

  return (
    <section className={styles.bubble} aria-labelledby="team-summary-title">
      <div className={styles.header}>
        <img src="/mascot.png" alt="" className={styles.headerMascot} aria-hidden />
        <h2 id="team-summary-title" className={styles.title}>Maximus&apos;s Insight</h2>
      </div>
      <div className={styles.content}>
        {loading && !summary && (
          <div className={styles.loading}>
            <span className={styles.spinner} aria-hidden />
            <span>Generating summary…</span>
          </div>
        )}
        {error && !summary && (
          <p className={styles.error}>{error}</p>
        )}
        {summary && (
          <>
            <p className={styles.summaryText}>{summary}</p>
            {updatedAt && (
              <p className={styles.updated}>Last updated: {formatSummaryDate(updatedAt)} PST</p>
            )}
          </>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.refresh}
            onClick={loadSummary}
            disabled={loading}
            aria-label="Refresh summary"
          >
            {loading ? 'Generating…' : 'Refresh'}
          </button>
        </div>
      </div>
    </section>
  );
}
