/**
 * MLB Home — the primary landing page for the MLB workspace.
 * Shows a premium launch splash on first entry, then the full home view.
 * Order: Intelligence Briefing → Pennant Watch → Intel Feed (News & Highlights)
 */

import { useState, useEffect } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import MlbLoading from '../../components/mlb/MlbLoading';
import FormattedSummary from '../../components/shared/FormattedSummary';
import PennantWatch from '../../components/mlb/PennantWatch';
import MlbIntelFeed from '../../components/mlb/MlbIntelFeed';
import styles from './MlbHome.module.css';

const SPLASH_KEY = '__maximus_mlb_splash_shown';

const _llmCache = { data: null, ts: 0 };
const LLM_TTL_MS = 60_000;

function fixPositiveOdds(text) {
  if (!text) return text;
  return text
    .replace(/\bat\s+(\d{3,4})(?=[\s.,;!?)\-–—]|$)/g, (m, n) => {
      const v = parseInt(n, 10);
      return v >= 100 && v <= 9999 ? `at +${n}` : m;
    })
    .replace(/\((\d{3,4})\)/g, (m, n) => {
      const v = parseInt(n, 10);
      return v >= 100 && v <= 9999 ? `(+${n})` : m;
    });
}

export default function MlbHome() {
  const { workspace } = useWorkspace();

  const alreadyShown = sessionStorage.getItem(SPLASH_KEY) === '1';
  const [showSplash, setShowSplash] = useState(!alreadyShown);
  const [llmSummary, setLlmSummary] = useState(null);
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);

  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      setShowSplash(false);
      sessionStorage.setItem(SPLASH_KEY, '1');
    }, 2200);
    return () => clearTimeout(timer);
  }, [showSplash]);

  useEffect(() => {
    const now = Date.now();
    if (_llmCache.data && now - _llmCache.ts < LLM_TTL_MS) {
      setLlmSummary(fixPositiveOdds(_llmCache.data));
      return;
    }
    const controller = new AbortController();
    const delay = setTimeout(() => {
      fetch('/api/mlb/chat/homeSummary', { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => {
          if (d?.summary) {
            const fixed = fixPositiveOdds(d.summary);
            _llmCache.data = fixed;
            _llmCache.ts = Date.now();
            setLlmSummary(fixed);
          }
        })
        .catch(() => {});
    }, 1000);
    return () => { clearTimeout(delay); controller.abort(); };
  }, []);

  const handleRefresh = () => {
    if (summaryRefreshing) return;
    setSummaryRefreshing(true);
    fetch('/api/mlb/chat/homeSummary?force=1')
      .then((r) => r.json())
      .then((d) => {
        setSummaryRefreshing(false);
        if (d?.summary) {
          const fixed = fixPositiveOdds(d.summary);
          _llmCache.data = fixed;
          _llmCache.ts = Date.now();
          setLlmSummary(fixed);
        }
      })
      .catch(() => setSummaryRefreshing(false));
  };

  if (showSplash) return <MlbLoading />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.date}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).toUpperCase()}
        </span>
        <span className={styles.subtitle}>{workspace.labels.intelligence}</span>
      </header>

      {/* ── Intelligence Briefing ── */}
      <section className={styles.briefingSection}>
        <div className={styles.briefingHeader}>
          <div className={styles.briefingEyebrow}>Today's Intelligence Briefing</div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={summaryRefreshing}
            title="Refresh briefing"
          >
            {summaryRefreshing ? '↻' : '↻'}
          </button>
        </div>
        <div className={styles.briefingContent}>
          <img
            src="/mascot-mlb.png"
            alt="Maximus"
            className={styles.briefingMascot}
            onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
          />
          <div className={styles.briefingBody}>
            {llmSummary ? (
              <FormattedSummary text={llmSummary} className={styles.briefingText} />
            ) : (
              <p className={styles.briefingText}>Loading today&apos;s MLB intelligence…</p>
            )}
          </div>
        </div>
      </section>

      <PennantWatch />
      <MlbIntelFeed />
    </div>
  );
}
