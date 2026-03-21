/**
 * MLB Home — the primary landing page for the MLB workspace.
 * Shows a premium launch splash on first entry, then the full home view.
 * Order: Intelligence Briefing → Pennant Watch → Intel Feed (News & Highlights)
 */

import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import MlbLoading from '../../components/mlb/MlbLoading';
import FormattedSummary from '../../components/shared/FormattedSummary';
import PennantWatch from '../../components/mlb/PennantWatch';
import MlbIntelFeed from '../../components/mlb/MlbIntelFeed';
import styles from './MlbHome.module.css';

const SPLASH_KEY = '__maximus_mlb_splash_shown';

const _llmCache = { data: null, ts: 0 };
const LLM_TTL_MS = 60_000;
const CLIENT_TIMEOUT_MS = 15_000;

const FALLBACK_BRIEFING =
  'Welcome to MLB Intelligence. Our briefing is being prepared — check back shortly for today\u2019s freshest odds movement, headlines, and storylines across Major League Baseball.';

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

function fetchWithTimeout(url, opts = {}, timeoutMs = CLIENT_TIMEOUT_MS) {
  const controller = new AbortController();
  const merged = { ...opts, signal: controller.signal };
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, merged).finally(() => clearTimeout(timer));
}

export default function MlbHome() {
  const { workspace } = useWorkspace();

  const alreadyShown = sessionStorage.getItem(SPLASH_KEY) === '1';
  const [showSplash, setShowSplash] = useState(!alreadyShown);
  const [llmSummary, setLlmSummary] = useState(_llmCache.data && (Date.now() - _llmCache.ts < LLM_TTL_MS) ? _llmCache.data : null);
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);

  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      setShowSplash(false);
      sessionStorage.setItem(SPLASH_KEY, '1');
    }, 2200);
    return () => clearTimeout(timer);
  }, [showSplash]);

  useEffect(() => {
    if (llmSummary) return;
    let cancelled = false;

    function attempt(retries) {
      fetchWithTimeout('/api/mlb/chat/homeSummary')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (d?.summary) {
            const fixed = fixPositiveOdds(d.summary);
            _llmCache.data = fixed;
            _llmCache.ts = Date.now();
            setLlmSummary(fixed);
          } else if (retries > 0 && d?.status === 'missing') {
            setTimeout(() => { if (!cancelled) attempt(retries - 1); }, 4000);
          } else {
            setSummaryFailed(true);
          }
        })
        .catch(() => {
          if (!cancelled) setSummaryFailed(true);
        });
    }

    const delay = setTimeout(() => attempt(1), 800);
    return () => { cancelled = true; clearTimeout(delay); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    if (summaryRefreshing) return;
    setSummaryRefreshing(true);
    setSummaryFailed(false);
    fetchWithTimeout('/api/mlb/chat/homeSummary?force=1')
      .then((r) => r.json())
      .then((d) => {
        setSummaryRefreshing(false);
        if (d?.summary) {
          const fixed = fixPositiveOdds(d.summary);
          _llmCache.data = fixed;
          _llmCache.ts = Date.now();
          setLlmSummary(fixed);
        } else {
          setSummaryFailed(true);
        }
      })
      .catch(() => { setSummaryRefreshing(false); setSummaryFailed(true); });
  }, [summaryRefreshing]);

  if (showSplash) return <MlbLoading />;

  return (
    <div className={styles.page}>
      <header className={styles.pageIntro}>
        <span className={styles.pageIntroDate}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <span className={styles.pageIntroDivider}>·</span>
        <span className={styles.pageIntroSub}>{workspace.labels.intelligence}</span>
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
            alt="Maximus Sports MLB intelligence mascot"
            className={styles.briefingMascot}
            width={110}
            height={110}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
          />
          <div className={styles.briefingBody}>
            {llmSummary ? (
              <FormattedSummary text={llmSummary} className={styles.briefingText} />
            ) : summaryFailed ? (
              <FormattedSummary text={FALLBACK_BRIEFING} className={styles.briefingText} />
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
