/**
 * NBA Home — the briefing page for the NBA workspace, laid out like the
 * NFL one.
 *
 * Order: Maximus's picks for tonight → the brief → games (each opening
 * with an aerial flyover of the arena) → headlines beside title odds →
 * your teams → videos. Sections are rails on phones and grids on wide
 * screens; the detail lives on the pages each section links to.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import SEOHead, { buildOgImageUrl } from '../../components/seo/SEOHead';
import NbaLoading from '../../components/nba/NbaLoading';
import NbaPinnedTeamSection from '../../components/nba/NbaPinnedTeamSection';
import NbaGameTile from '../../components/nba/home/NbaGameTile';
import NbaSectionTabs from '../../components/nba/home/NbaSectionTabs';
import NbaPicks from '../../components/nba/home/NbaPicks';
import NbaTitleRace from '../../components/nba/home/NbaTitleRace';
import NbaBrief from '../../components/nba/home/NbaBrief';
import { NbaVideos, NbaHeadlines } from '../../components/nba/home/NbaFeed';
import { TeamText } from '../../components/nba/home/NbaTeamTag';
import { SectionHead, Rail } from '../../components/nfl/home/HomeParts';
import { fetchNbaGames, fetchNbaPicks } from '../../api/nba';
import { maximusPicks } from '../../components/nba/home/nbaPickHelpers';
import { mascotFor } from '../../brand/mascots';
import { trackBriefingRefresh } from '../../analytics/sportEvents';
import h from '../../components/nfl/home/home.module.css';

const SPLASH_MS = 1400;
const LLM_TTL_MS = 60_000;
// A brief that is out of date is rewritten before the server answers, which can take a while.
const CLIENT_TIMEOUT_MS = 35_000;
const LIVE_SLATE_POLL_MS = 60_000;
const LIVE_BRIEF_POLL_MS = 5 * 60_000;
const BOARD_PREVIEW = 9;

const _llmCache = { data: null, ts: 0 };

function fetchWithTimeout(url, timeoutMs = CLIENT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** One line shown when the written brief is unavailable. */
function slateSummary(slate) {
  if (!slate || slate.games.length === 0) return null;
  const { counts, games } = slate;
  const parts = [`${games.length} ${games.length === 1 ? 'game' : 'games'} today: ${counts.final} final, ${counts.live} live, ${counts.upcoming} to play.`];
  const tight = games
    .filter((g) => g.status === 'upcoming' && g.market?.pregameSpread != null)
    .sort((a, b) => Math.abs(a.market.pregameSpread) - Math.abs(b.market.pregameSpread))[0];
  if (tight) {
    const s = tight.market.pregameSpread;
    const fav = s <= 0 ? tight.teams.home : tight.teams.away;
    parts.push(`The tightest line on the board is ${tight.teams.away.name} at ${tight.teams.home.name} (${fav.abbrev} ${s === 0 ? 'pick’em' : `-${Math.abs(s)}`}).`);
  }
  return parts.join(' ');
}

export default function NbaHome() {
  const { workspace, buildPath } = useWorkspace();
  const splashKey = workspace.theme.splashKey;

  const [showSplash, setShowSplash] = useState(() => {
    try { return sessionStorage.getItem(splashKey) !== '1'; } catch { return false; }
  });
  const [briefing, setBriefing] = useState(() => (
    _llmCache.data && Date.now() - _llmCache.ts < LLM_TTL_MS ? _llmCache.data : null
  ));
  const brief = briefing?.brief || null;
  const [summaryState, setSummaryState] = useState(briefing ? 'ready' : 'loading');
  const [refreshing, setRefreshing] = useState(false);
  const [slate, setSlate] = useState(null);
  const [board, setBoard] = useState(null);

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
    fetchNbaGames().then((d) => { if (!cancelled) setSlate(d); });
    fetchNbaPicks().then((d) => { if (!cancelled) setBoard(d || null); });
    return () => { cancelled = true; };
  }, []);

  const loadSummary = useCallback((force) => {
    return fetchWithTimeout(`/api/nba/chat/homeSummary${force ? '?force=1' : ''}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.brief) {
          const next = { brief: d.brief, generatedAt: d.generatedAt || null };
          _llmCache.data = next;
          _llmCache.ts = Date.now();
          setBriefing(next);
          setSummaryState('ready');
          return true;
        }
        return false;
      })
      .catch(() => false);
  }, []);

  useEffect(() => {
    if (briefing) return undefined;
    let cancelled = false;
    loadSummary(false).then((ok) => { if (!cancelled && !ok) setSummaryState('failed'); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    trackBriefingRefresh({ sport: 'nba' });
    setRefreshing(true);
    loadSummary(true).then((ok) => {
      setRefreshing(false);
      if (!ok && !briefing) setSummaryState('failed');
    });
  }, [refreshing, loadSummary, briefing]);

  // While games are on, keep the scores and the brief moving without a reload.
  const liveNow = (slate?.counts?.live || 0) > 0;
  useEffect(() => {
    if (!liveNow) return undefined;
    const slateTimer = setInterval(() => { fetchNbaGames({ force: true }).then((d) => { if (d?.games?.length) setSlate(d); }); }, LIVE_SLATE_POLL_MS);
    const briefTimer = setInterval(() => { loadSummary(false); }, LIVE_BRIEF_POLL_MS);
    return () => { clearInterval(slateTimer); clearInterval(briefTimer); };
  }, [liveNow, loadSummary]);

  if (showSplash) return <NbaLoading />;

  const seoTitle = 'NBA Betting Picks, Spreads, Totals & Title Odds';
  const seoDescription =
    'Model-graded NBA picks against the spread, moneylines and over/under totals, with tonight’s lines, title odds and a transparent daily scorecard from Maximus Sports.';

  const games = slate?.games || [];
  // Lead with what is live, then what is next, then what just finished.
  const order = { live: 0, upcoming: 1, final: 2 };
  const tiles = [...games].sort((a, b) =>
    (order[a.status] ?? 9) - (order[b.status] ?? 9)
    || Date.parse(a.startTime) - Date.parse(b.startTime));
  const pickByGame = new Map(maximusPicks(board).map((p) => [String(p.gameId), p]));
  const fallback = slateSummary(slate);

  return (
    <div className={h.page}>
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        canonicalPath="/nba"
        ogImage={buildOgImageUrl({
          title: 'NBA Picks',
          subtitle: 'Model-graded spreads, moneylines and totals',
          type: 'Sports Intelligence',
        })}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: seoTitle,
          description: seoDescription,
          url: 'https://maximussports.ai/nba',
        }}
      />

      <header className={h.header}>
        <div>
          <h1 className={h.title}>NBA tonight</h1>
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
        <img className={h.mascot} src={mascotFor('nba').flat} alt="" width="64" height="64" />
      </header>

      <NbaSectionTabs />

      <NbaPicks games={slate ? games : undefined} />

      <section className={h.section} aria-label="The brief">
        <SectionHead title="The brief" />
        {brief ? (
          <NbaBrief brief={brief} games={games} generatedAt={briefing?.generatedAt} onRefresh={handleRefresh} refreshing={refreshing} />
        ) : summaryState === 'loading' ? (
          <div className={h.skeleton} aria-busy="true" aria-label="Writing the brief" />
        ) : (
          <div className={h.card}>
            <div className={h.briefBody}>
              {fallback
                ? <p><TeamText text={fallback} /></p>
                : <p>The brief can’t load right now. Picks and games on this page are still current.</p>}
            </div>
          </div>
        )}
      </section>

      <section className={h.section} aria-label="Today's games">
        <SectionHead
          title="Games"
          count={games.length > 0 ? games.length : null}
          to={buildPath('/games')}
          moreLabel="All games"
        />
        {slate === null ? (
          <div className={h.skeleton} aria-busy="true" />
        ) : tiles.length === 0 ? (
          <div className={h.empty}>
            <b>No games today</b>
            The next slate shows up here as soon as the schedule and lines are posted.
          </div>
        ) : (
          <Rail label="Today's games" cap={6}>
            {tiles.slice(0, BOARD_PREVIEW).map((g) => (
              <NbaGameTile key={g.gameId} game={g} pick={g.status === 'upcoming' ? pickByGame.get(String(g.gameId)) : null} />
            ))}
          </Rail>
        )}
      </section>

      <div className={h.split}>
        <NbaHeadlines max={7} />
        <div className={h.sideCol}>
          <NbaTitleRace limit={5} />
        </div>
      </div>

      <NbaPinnedTeamSection />

      <NbaVideos max={6} />

      <p className={h.fine}>For entertainment only. Please bet responsibly. 21+.</p>
    </div>
  );
}
