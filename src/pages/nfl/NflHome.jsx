/**
 * NFL Home — the briefing page for the NFL workspace.
 *
 * Order: briefing → this week's board → teams you follow → picks →
 * model performance → Super Bowl watch → intel feed.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import FormattedSummary from '../../components/shared/FormattedSummary';
import MlbMaximusPicksSectionV2 from '../../components/mlb/picks/MlbMaximusPicksSectionV2';
import SEOHead, { buildOgImageUrl } from '../../components/seo/SEOHead';
import NflGameCard from '../../components/nfl/NflGameCard';
import NflPinnedTeamSection from '../../components/nfl/NflPinnedTeamSection';
import NflScorecardReport from '../../components/nfl/NflScorecardReport';
import NflSuperBowlWatch from '../../components/nfl/NflSuperBowlWatch';
import NflIntelFeed from '../../components/nfl/NflIntelFeed';
import { fetchNflGames } from '../../api/nfl';
import { getNflTeamBySlug } from '../../sports/nfl/teams';
import s from '../../components/nfl/nfl.module.css';

const SPLASH_MS = 1400;
const LLM_TTL_MS = 60_000;
const CLIENT_TIMEOUT_MS = 15_000;
const BOARD_PREVIEW = 6;

const _llmCache = { data: null, ts: 0 };

function fetchWithTimeout(url, timeoutMs = CLIENT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function Splash({ theme }) {
  return (
    <div className={s.splash} style={{ background: theme.gradientBg }} role="status" aria-live="polite">
      <img src={theme.mascot} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
      <span className={s.splashTitle}>{theme.loadingTitle}</span>
      <div className={s.splashBar}><div className={s.splashFill} /></div>
      <span className={s.splashSub}>{theme.loadingSubtext}</span>
    </div>
  );
}

/** Deterministic summary shown when the written briefing is unavailable. */
function slateSummary(slate) {
  if (!slate || slate.games.length === 0) return null;
  const { counts, week, games } = slate;
  const parts = [];
  parts.push(`Week ${week ?? ''}`.trim() + ` has ${games.length} games: ${counts.final} final, ${counts.live} live, ${counts.upcoming} to play.`);
  const tight = games
    .filter((g) => g.status === 'upcoming' && g.market?.pregameSpread != null)
    .sort((a, b) => Math.abs(a.market.pregameSpread) - Math.abs(b.market.pregameSpread))[0];
  if (tight) {
    parts.push(`The tightest line on the board is ${tight.teams.away.name} at ${tight.teams.home.name} (${tight.betting.spreadDisplay}).`);
  }
  const lean = games
    .filter((g) => g.status === 'upcoming' && g.model?.pregameEdge != null)
    .sort((a, b) => Math.abs(b.model.pregameEdge) - Math.abs(a.model.pregameEdge))[0];
  if (lean && Math.abs(lean.model.pregameEdge) >= 2) {
    const side = lean.model.pregameEdge > 0 ? lean.teams.home : lean.teams.away;
    parts.push(`The ratings disagree with the market most on ${lean.teams.away.abbrev} at ${lean.teams.home.abbrev}, leaning ${side.name}.`);
  }
  return parts.join(' ');
}

export default function NflHome() {
  const { workspace, buildPath } = useWorkspace();
  const splashKey = workspace.theme.splashKey;

  const [showSplash, setShowSplash] = useState(() => {
    try { return sessionStorage.getItem(splashKey) !== '1'; } catch { return false; }
  });
  const [summary, setSummary] = useState(() => (
    _llmCache.data && Date.now() - _llmCache.ts < LLM_TTL_MS ? _llmCache.data : null
  ));
  const [summaryState, setSummaryState] = useState(summary ? 'ready' : 'loading');
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [slate, setSlate] = useState(null);

  useEffect(() => {
    if (!showSplash) return undefined;
    const timer = setTimeout(() => {
      setShowSplash(false);
      try { sessionStorage.setItem(splashKey, '1'); } catch { /* private mode */ }
    }, SPLASH_MS);
    return () => clearTimeout(timer);
  }, [showSplash, splashKey]);

  useEffect(() => {
    let cancelled = false;
    fetchNflGames().then((d) => { if (!cancelled) setSlate(d); });
    return () => { cancelled = true; };
  }, []);

  const loadSummary = useCallback((force) => {
    return fetchWithTimeout(`/api/nfl/chat/homeSummary${force ? '?force=1' : ''}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.summary) {
          _llmCache.data = d.summary;
          _llmCache.ts = Date.now();
          setSummary(d.summary);
          setSummaryState('ready');
          return true;
        }
        return false;
      })
      .catch(() => false);
  }, []);

  useEffect(() => {
    if (summary) return undefined;
    let cancelled = false;
    let retry;
    loadSummary(false).then((ok) => {
      if (cancelled || ok) return;
      // First request may only have kicked off generation; try once more.
      retry = setTimeout(() => {
        loadSummary(false).then((ok2) => { if (!cancelled && !ok2) setSummaryState('failed'); });
      }, 4000);
    });
    return () => { cancelled = true; clearTimeout(retry); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    loadSummary(true).then((ok) => {
      setRefreshing(false);
      if (!ok && !summary) setSummaryState('failed');
    });
  }, [refreshing, loadSummary, summary]);

  if (showSplash) return <Splash theme={workspace.theme} />;

  const seoTitle = 'NFL Betting Picks, Spreads, Totals & Power Ratings';
  const seoDescription =
    'Model-graded NFL picks against the spread, moneylines and totals, with power ratings, playoff odds and a transparent weekly scorecard from Maximus Sports.';

  const games = slate?.games || [];
  // Lead with what is live, then what is next, then what just finished.
  const order = { live: 0, upcoming: 1, final: 2, postponed: 3 };
  const board = [...games].sort((a, b) =>
    (order[a.status] ?? 9) - (order[b.status] ?? 9)
    || Date.parse(a.startTime) - Date.parse(b.startTime));
  const fallback = slateSummary(slate);
  const weekLabel = slate?.week != null
    ? `${slate.seasonType === 3 ? 'Playoffs' : `Week ${slate.week}`}`
    : null;

  return (
    <div className={s.page}>
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        canonicalPath="/nfl"
        ogImage={buildOgImageUrl({
          title: 'NFL Picks',
          subtitle: 'Model-graded spreads, moneylines and totals',
          type: 'Sports Intelligence',
        })}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: seoTitle,
          description: seoDescription,
          url: 'https://maximussports.ai/nfl',
        }}
      />

      <header className={s.pageHeader}>
        <span className={s.eyebrow}>{workspace.labels.intelligence}</span>
        <h1 className={s.pageTitle}>{weekLabel ? `${weekLabel} briefing` : 'NFL briefing'}</h1>
        <div className={s.metaLine}>
          <span>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          {slate && games.length > 0 && (
            <span className={s.metaDot}>
              {slate.counts.live > 0 ? `${slate.counts.live} live · ` : ''}
              {slate.counts.upcoming} to play · {slate.counts.final} final
            </span>
          )}
        </div>
      </header>

      {/* Briefing */}
      <section className={`${s.card} ${s.cardAccent} ${s.briefing}`} aria-label="Intelligence briefing">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>Today’s intelligence briefing</h2>
          <button
            type="button"
            className={s.iconBtn}
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh briefing"
            title="Refresh briefing"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className={`${s.briefingBody} ${!expanded && summary ? s.briefingCollapsed : ''}`}>
          {summary ? (
            <FormattedSummary text={summary} />
          ) : summaryState === 'loading' ? (
            <p className={s.muted}>Writing this week’s briefing…</p>
          ) : fallback ? (
            <p>{fallback}</p>
          ) : (
            <p className={s.muted}>The briefing is not available right now. The board and picks below are live.</p>
          )}
        </div>
        {summary && (
          <button type="button" className={s.textBtn} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? 'Show less' : 'Read the full briefing'}
          </button>
        )}
      </section>

      {/* This week's board */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <div>
            <h2 className={s.sectionTitle}>{weekLabel ? `${weekLabel} board` : 'This week’s board'}</h2>
            <p className={s.sectionSub}>Market lines next to the model’s number for every game.</p>
          </div>
          <Link to={buildPath('/games')} className={s.sectionLink}>All {games.length || ''} games →</Link>
        </div>
        {slate === null ? (
          <div className={s.gridGames}>
            <div className={s.skeleton} /><div className={s.skeleton} /><div className={s.skeleton} />
          </div>
        ) : board.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyTitle}>No games on the board</span>
            The next slate appears here as soon as the schedule and lines post.
          </div>
        ) : (
          <div className={s.gridGames}>
            {board.slice(0, BOARD_PREVIEW).map((g) => <NflGameCard key={g.gameId} game={g} />)}
          </div>
        )}
        {slate?.byeTeams?.length > 0 && (
          <p className={s.note}>On bye: {slate.byeTeams.map((t) => getNflTeamBySlug(t)?.nickname || t).join(', ')}.</p>
        )}
      </section>

      <NflPinnedTeamSection />

      {/* Picks: recommended plays for the week */}
      <MlbMaximusPicksSectionV2
        mode="home"
        sport="nfl"
        endpoint="/api/nfl/picks/built"
        suppressPerformanceBlocks
      />

      <NflScorecardReport variant="embedded" insightsHref={buildPath('/insights')} />

      <NflSuperBowlWatch limit={6} />

      <NflIntelFeed />

      <p className={s.note}>For entertainment only. Please bet responsibly. 21+.</p>
    </div>
  );
}
