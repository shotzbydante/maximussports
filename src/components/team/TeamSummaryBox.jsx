/**
 * Maximus's Insight — GPT team insight (streaming). Chat/speech bubble style.
 * Uses payload from Team page; Refresh bypasses cache. Shows typing cursor while streaming.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { buildTeamSummaryPayload, fetchTeamSummaryStream } from '../../api/summary';
import styles from './TeamSummaryBox.module.css';

const STREAM_FLUSH_MS = 80;

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
  const [summaryText, setSummaryText] = useState('');
  const [summaryStreaming, setSummaryStreaming] = useState(false);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);
  const [error, setError] = useState(null);

  const streamBufferRef = useRef('');
  const streamIntervalRef = useRef(null);

  const flushStreamBuffer = useCallback(() => {
    if (streamBufferRef.current) {
      const chunk = streamBufferRef.current;
      streamBufferRef.current = '';
      setSummaryText((prev) => prev + chunk);
    }
  }, []);

  const loadSummary = useCallback((force = false) => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    streamBufferRef.current = '';
    setSummaryText('');
    setError(null);
    setSummaryStreaming(true);

    const payload = buildTeamSummaryPayload({ team, schedule, ats, news });
    fetchTeamSummaryStream({ slug, payload }, {
      force,
      onMessage(data) {
        if (data.error) {
          if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
          }
          streamBufferRef.current = '';
          setSummaryText(data.message || 'Summary unavailable.');
          setError(data.message);
          setSummaryStreaming(false);
          return;
        }
        if (data.text) {
          streamBufferRef.current += data.text;
          if (!streamIntervalRef.current) {
            streamIntervalRef.current = setInterval(flushStreamBuffer, STREAM_FLUSH_MS);
          }
        }
        if (data.updatedAt) {
          setSummaryUpdatedAt(data.updatedAt);
        }
        if (data.done) {
          if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
          }
          flushStreamBuffer();
          setSummaryStreaming(false);
        }
      },
    }).catch(() => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
      streamBufferRef.current = '';
      setSummaryText('Summary unavailable.');
      setError('Summary unavailable.');
      setSummaryStreaming(false);
    });
  }, [slug, team, schedule, ats, news, flushStreamBuffer]);

  useEffect(() => {
    if (!slug || !team || !dataReady) return;
    loadSummary(false);
  }, [slug, dataReady, loadSummary]);

  const handleRefresh = () => {
    loadSummary(true);
  };

  if (!slug || !team) return null;

  return (
    <section className={styles.bubble} aria-labelledby="team-summary-title">
      <div className={styles.header}>
        <img src="/mascot.png" alt="" className={styles.headerMascot} aria-hidden />
        <h2 id="team-summary-title" className={styles.title}>Maximus&apos;s Insight</h2>
      </div>
      <div className={styles.content}>
        {summaryStreaming && summaryText === '' && (
          <div className={styles.loading}>
            <div className={styles.loadingRow}>
              <span className={styles.spinner} aria-hidden />
              <span aria-live="polite">Generating summary…</span>
            </div>
            <div className={styles.skeleton} aria-hidden>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} />
            </div>
          </div>
        )}
        {error && !summaryText && !summaryStreaming && (
          <p className={styles.error}>{error}</p>
        )}
        {summaryText !== '' && (
          <>
            <p className={styles.summaryText}>
              {summaryText}
              {summaryStreaming && <span className={styles.cursor} aria-hidden>▌</span>}
            </p>
            {summaryUpdatedAt && !summaryStreaming && (
              <p className={styles.updated}>Last updated: {formatSummaryDate(summaryUpdatedAt)} PST</p>
            )}
          </>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.refresh}
            onClick={handleRefresh}
            disabled={summaryStreaming}
            aria-label="Refresh summary"
          >
            {summaryStreaming ? 'Generating…' : 'Refresh'}
          </button>
        </div>
      </div>
    </section>
  );
}
