/**
 * NBA Home — the primary landing page for the NBA workspace.
 * Shows a premium launch splash on first entry, then the full home view.
 * Order: Intelligence Briefing → Finals Watch → News Feed
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import NbaLoading from '../../components/nba/NbaLoading';
import FormattedSummary from '../../components/shared/FormattedSummary';
import NbaPinnedTeamSection from '../../components/nba/NbaPinnedTeamSection';
import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';
import NbaScorecardReport from '../../components/nba/picks/NbaScorecardReport';
import NbaIntelFeed from '../../components/nba/NbaIntelFeed';
import NbaFinalsWatch from '../../components/nba/NbaFinalsWatch';
import styles from './NbaHome.module.css';

const SPLASH_KEY = '__maximus_nba_splash_shown';

const _llmCache = { data: null, ts: 0 };
const LLM_TTL_MS = 60_000;
const CLIENT_TIMEOUT_MS = 15_000;

const FALLBACK_BRIEFING =
  'Welcome to NBA Playoffs Intelligence. Our briefing is being prepared \u2014 check back shortly for today\u2019s freshest playoff matchups, series predictions, odds movement, and storylines across the NBA postseason.';

function fixPositiveOdds(text) {
  if (!text) return text;
  return text
    .replace(/\bat\s+(\d{3,4})(?=[\s.,;!?)\-\u2013\u2014]|$)/g, (m, n) => {
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

export default function NbaHome() {
  const { workspace, buildPath } = useWorkspace();

  const alreadyShown = sessionStorage.getItem(SPLASH_KEY) === '1';
  const [showSplash, setShowSplash] = useState(!alreadyShown);
  const [llmSummary, setLlmSummary] = useState(() => _llmCache.data && (Date.now() - _llmCache.ts < LLM_TTL_MS) ? _llmCache.data : null);
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(false);

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
      fetchWithTimeout('/api/nba/chat/homeSummary')
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
    fetchWithTimeout('/api/nba/chat/homeSummary?force=1')
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

  if (showSplash) return <NbaLoading />;

  return (
    <div className={styles.page}>
      <header className={styles.pageIntro}>
        <span className={styles.pageIntroDate}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </span>
        <span className={styles.pageIntroDivider}>&middot;</span>
        <span className={styles.pageIntroSub}>{workspace.labels.intelligence}</span>
      </header>

      {/* Intelligence Briefing */}
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
            &#x21BB;
          </button>
        </div>
        <div className={styles.briefingContent}>
          <img
            src="/mascot.png"
            alt="Maximus Sports NBA intelligence mascot"
            className={styles.briefingMascot}
            height={110}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
          />
          <div className={`${styles.briefingBody} ${!briefingExpanded ? styles.briefingCollapsed : ''}`}>
            {llmSummary ? (
              <FormattedSummary text={llmSummary} className={styles.briefingText} />
            ) : summaryFailed ? (
              <FormattedSummary text={FALLBACK_BRIEFING} className={styles.briefingText} />
            ) : (
              <p className={styles.briefingText}>Loading today&apos;s NBA intelligence&hellip;</p>
            )}
          </div>
        </div>
        <div className={styles.briefingFooter}>
          <button
            type="button"
            className={styles.briefingToggle}
            onClick={() => setBriefingExpanded(v => !v)}
          >
            {briefingExpanded ? 'Collapse briefing' : 'Read full briefing'}
            <span className={`${styles.briefingToggleCaret} ${briefingExpanded ? styles.briefingToggleCaretOpen : ''}`}>&#9662;</span>
          </button>
        </div>
      </section>

      {/* NBA Bracketology Hero — premium gold gradient */}
      <section className={styles.bracketPromo}>
        <div className={styles.bracketPromoGlow} />
        <div className={styles.bracketPromoInner}>
          <div className={styles.bracketPromoContent}>
            <span className={styles.bracketPromoEyebrow}>2026 NBA Playoffs</span>
            <h3 className={styles.bracketPromoTitle}>Explore NBA Bracketology</h3>
            <p className={styles.bracketPromoBody}>
              Interactive playoff bracket, series projections, championship simulations, and title paths &mdash; powered by the Maximus model.
            </p>
            <div className={styles.bracketPromoChips}>
              <span className={styles.bracketChip}>Playoff Bracket</span>
              <span className={styles.bracketChip}>Series Predictions</span>
              <span className={styles.bracketChip}>Title Simulation</span>
              <span className={styles.bracketChip}>Championship Odds</span>
            </div>
            <div className={styles.bracketPromoCtas}>
              <Link to={buildPath('/bracketology')} className={styles.bracketPromoPrimary}>
                Open Bracketology &rarr;
              </Link>
              <Link to={buildPath('/teams')} className={styles.bracketPromoSecondary}>
                Team Intel
              </Link>
            </div>
          </div>
          <div className={styles.bracketPromoAssetWrap}>
            <div className={styles.bracketPromoAssetPlate} />
            <div className={styles.bracketPromoAssetGlowInner} />
            <div className={styles.bracketPromoAssetGlowOuter} />
            <img src="/nba-finals-logo.png" alt="NBA Finals" className={styles.bracketPromoAsset}
              onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
        </div>
      </section>

      <NbaPinnedTeamSection />
      {/* Premium hero shell — Maximus's Picks scorecard + full picks board
          presented as one cohesive intelligence surface. Glass framing,
          gold accent, integrated section transitions. */}
      <section className={styles.picksHero} aria-label="Maximus's NBA Picks">
        <div className={styles.picksHeroGlow} aria-hidden="true" />
        <div className={styles.picksHeroInner}>
          <header className={styles.picksHeroHeader}>
            <span className={styles.picksHeroEyebrow}>Maximus&rsquo;s Picks</span>
            <h2 className={styles.picksHeroTitle}>NBA Playoff Intelligence</h2>
            <p className={styles.picksHeroSub}>
              Model-graded picks, daily scorecard, and rolling performance &mdash; one surface, fully transparent.
            </p>
          </header>
          {/* Daily scorecard — embedded variant. Renders the SAME content
              as /nba/insights (no truncation, full row list, rolling perf,
              grading explainer); only chrome adapts to the dark hero. */}
          <NbaScorecardReport variant="embedded" insightsHref={buildPath('/insights')} />
          {/* Today's full picks board — every published tier + coverage,
              no preview truncation (homeShowAll). */}
          <MlbMaximusPicksSectionV2
            mode="home"
            sport="nba"
            endpoint="/api/nba/picks/built"
            suppressPerformanceBlocks
            homeShowAll
          />
        </div>
      </section>
      <NbaFinalsWatch />
      <NbaIntelFeed />
    </div>
  );
}
