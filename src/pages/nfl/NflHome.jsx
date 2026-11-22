/**
 * NFL Home — the briefing page for the NFL workspace.
 *
 * Order: picks → games → written briefing → your teams → Super Bowl
 * odds and headlines → videos. Sections are rails on phones and grids
 * on wide screens; the detail lives on the pages each section links to.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import FormattedSummary from '../../components/shared/FormattedSummary';
import SEOHead, { buildOgImageUrl } from '../../components/seo/SEOHead';
import NflPinnedTeamSection from '../../components/nfl/NflPinnedTeamSection';
import HomeGameTile from '../../components/nfl/home/HomeGameTile';
import NflSectionTabs from '../../components/nfl/home/NflSectionTabs';
import HomePicks from '../../components/nfl/home/HomePicks';
import HomeTitleRace from '../../components/nfl/home/HomeTitleRace';
import { HomeVideos, HomeHeadlines } from '../../components/nfl/home/HomeFeed';
import { SectionHead, Rail } from '../../components/nfl/home/HomeParts';
import { fetchNflGames } from '../../api/nfl';
import { getNflTeamBySlug } from '../../sports/nfl/teams';
import { mascotFor } from '../../brand/mascots';
import s from '../../components/nfl/nfl.module.css';
import h from '../../components/nfl/home/home.module.css';
import { trackBriefingRefresh, trackBriefingExpand } from '../../analytics/sportEvents';

const SPLASH_MS = 1400;
const LLM_TTL_MS = 60_000;
const CLIENT_TIMEOUT_MS = 15_000;
const BOARD_PREVIEW = 8;

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
    trackBriefingRefresh({ sport: 'nfl' });
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
    <div className={h.page}>
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

      <header className={h.header}>
        <div>
          <h1 className={h.title}>{weekLabel ? `NFL ${weekLabel}` : 'NFL'}</h1>
          <p className={h.meta}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {slate && games.length > 0 && (
              <>
                {'. '}
                {slate.counts.live > 0 && <span className={h.metaLive}>{slate.counts.live} live, </span>}
                {slate.counts.upcoming} to play, {slate.counts.final} final
              </>
            )}
          </p>
        </div>
        <img className={h.mascot} src={mascotFor('nfl').flat} alt="" width="64" height="64" />
      </header>

      <NflSectionTabs />

      <HomePicks />

      <section className={h.section} aria-label="This week's games">
        <SectionHead
          title="Games"
          count={games.length > 0 ? games.length : null}
          to={buildPath('/games')}
          moreLabel="All games"
        />
        {slate === null ? (
          <div className={h.skeleton} aria-busy="true" />
        ) : board.length === 0 ? (
          <div className={h.empty}>
            <b>No games this week</b>
            The next slate shows up here as soon as the schedule and lines are posted.
          </div>
        ) : (
          <Rail label="This week's games" cap={6}>
            {board.slice(0, BOARD_PREVIEW).map((g) => <HomeGameTile key={g.gameId} game={g} />)}
          </Rail>
        )}
        {slate?.byeTeams?.length > 0 && (
          <p className={h.fine}>On bye: {slate.byeTeams.map((t) => getNflTeamBySlug(t)?.nickname || t).join(', ')}.</p>
        )}
      </section>

      <section className={h.section} aria-label="Weekly briefing">
        <SectionHead title="The briefing">
          <button
            type="button"
            className={h.iconBtn}
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh the briefing"
            title="Refresh the briefing"
          >
            <svg className={refreshing ? h.spin : undefined} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </SectionHead>
        <div className={h.card}>
          <div className={`${h.briefBody} ${!expanded && summary ? h.briefClamp : ''}`}>
            {summary ? (
              <FormattedSummary text={summary} />
            ) : summaryState === 'loading' ? (
              <p className={s.muted}>Writing this week’s briefing…</p>
            ) : fallback ? (
              <p>{fallback}</p>
            ) : (
              <p className={s.muted}>The briefing can’t load right now. Picks and games on this page are still current.</p>
            )}
          </div>
          {summary && (
            <button type="button" className={h.linkBtn} onClick={() => { trackBriefingExpand({ sport: 'nfl', expanded: !expanded }); setExpanded((v) => !v); }} aria-expanded={expanded}>
              {expanded ? 'Show less' : 'Read it all'}
            </button>
          )}
        </div>
      </section>

      <NflPinnedTeamSection />

      <div className={h.split}>
        <HomeTitleRace limit={5} />
        <HomeHeadlines max={5} />
      </div>

      <HomeVideos max={6} />

      <p className={h.fine}>For entertainment only. Please bet responsibly. 21+.</p>
    </div>
  );
}
