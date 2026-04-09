import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { newsFeed as mockNewsFeed } from '../data/mockData';
import { fetchHomeFast, fetchHomeSlow, mergeHomeData } from '../api/home';
import { fetchTeamBatch, fetchTeamPage } from '../api/team';
import { mergeGamesWithOdds } from '../api/odds';
import { getPinnedTeams } from '../utils/pinnedTeams';
import { getOddsTier } from '../utils/teamSlug';
import { getTeamSlug } from '../utils/teamSlug';
import { buildSlugToRankMap } from '../utils/rankingsNormalize';
import { generateChatSummary } from '../utils/chatSummary';
import { TEAMS, getTeamBySlug } from '../data/teams';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import { useInView } from '../hooks/useInView';
import { useHomeLoadTelemetry } from '../hooks/useHomeLoadTelemetry';
import { useAuth } from '../context/AuthContext';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { safeBuildPicks, EMPTY_PICKS } from '../utils/safePicksResult';
import { buildActivePicksGames } from '../utils/activePicksGames';
import LiveScores from '../components/scores/LiveScores';
import DynamicStats from '../components/home/DynamicStats';
import PinnedTeamsSection from '../components/home/PinnedTeamsSection';
import PinnedErrorBoundary from '../components/home/PinnedErrorBoundary';
import SectionErrorBoundary from '../components/home/SectionErrorBoundary';
import FormattedSummary from '../components/shared/FormattedSummary';
import { computeAtsFromScheduleAndHistory } from '../components/team/MaximusInsight';
import { getPinnedCache, setPinnedCache, hasFreshPinnedCache } from '../utils/pinnedCache';
import { perfLog } from '../utils/perfLog';
import WelcomeModal from '../components/marketing/WelcomeModal';
import { buildMaximusPicks, buildPicksSummary, buildBoardBriefing } from '../utils/maximusPicksModel';
import { getFlag, setFlag } from '../utils/localFlags';
import { trackAccountCreateSkipped } from '../lib/analytics/posthog';

import SignupBanner from '../components/marketing/SignupBanner';
import { sportsDateStr, nextSportsDayStr, toApiDateStr } from '../utils/slateDate';
import { fixPositiveOdds } from '../utils/fixPositiveOdds';
import styles from './Home.module.css';
import SEOHead, { buildOgImageUrl } from '../components/seo/SEOHead';
import { BRACKETOLOGY_ROUTE } from '../config/bracketology';
import { WORKSPACES, WorkspaceId, SeasonState } from '../workspaces/config';

// ── Deferred below-the-fold imports ──────────────────────────────────────────
const MaximusPicks     = lazy(() => import('../components/home/MaximusPicks'));
const ATSLeaderboard   = lazy(() => import('../components/home/ATSLeaderboard'));
const NewsFeed         = lazy(() => import('../components/dashboard/NewsFeed'));
const DynamicAlerts    = lazy(() => import('../components/home/DynamicAlerts'));
const RankingsTable    = lazy(() => import('../components/insights/RankingsTable'));

/** Lightweight placeholder while lazy chunks load. */
function SectionSkeleton({ height = 120 }) {
  return (
    <div
      style={{ minHeight: height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted, #999)', fontSize: '0.8rem' }}
      aria-busy="true"
    >
      Loading…
    </div>
  );
}

/* Module-level TTL cache for the LLM home summary (survives SPA navigation). */
const _llmSummaryCache = { data: null, ts: 0 };
const LLM_SUMMARY_TTL_MS = 60_000;

const SCORES_REFRESH_MS = 60_000;
const TIER_VALUE = { Lock: 0, 'Should be in': 1, 'Work to do': 2, 'Long shot': 3 };

const _entityEl = typeof document !== 'undefined' ? document.createElement('textarea') : null;
function decodeEntities(str) {
  if (!str || !_entityEl) return str || '';
  _entityEl.innerHTML = str;
  return _entityEl.value;
}

function formatRelativeTime(pubDate) {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isFinal(status) {
  const s = (status || '').toLowerCase();
  return s === 'final' || s.includes('final');
}

function countUpsets(games) {
  let count = 0;
  for (const g of games) {
    if (!isFinal(g.gameStatus)) continue;
    const homeTier = getOddsTier(g.homeTeam);
    const awayTier = getOddsTier(g.awayTeam);
    const homeVal = TIER_VALUE[homeTier] ?? 4;
    const awayVal = TIER_VALUE[awayTier] ?? 4;
    const homeScore = parseInt(g.homeScore, 10);
    const awayScore = parseInt(g.awayScore, 10);
    if (isNaN(homeScore) || isNaN(awayScore)) continue;
    const homeWon = homeScore > awayScore;
    const tierGap = Math.abs(homeVal - awayVal);
    if (tierGap < 2) continue;
    if (homeWon && awayVal < homeVal) count++;
    else if (!homeWon && homeVal < awayVal) count++;
  }
  return count;
}

function countRankedInAction(games, rankMap) {
  const rankedSlugs = new Set(Object.keys(rankMap));
  let count = 0;
  for (const g of games) {
    const homeSlug = getTeamSlug(g.homeTeam);
    const awaySlug = getTeamSlug(g.awayTeam);
    if (rankedSlugs.has(homeSlug) || rankedSlugs.has(awaySlug)) count++;
  }
  return count;
}

function hasAtsData(leaders) {
  return (leaders?.best?.length || 0) + (leaders?.worst?.length || 0) > 0;
}
const WARM_THROTTLE_MS = 5 * 60 * 1000;
function warmAtsBothWindows() {
  try {
    const last = sessionStorage.getItem('lastWarmAt');
    if (last && Date.now() - parseInt(last, 10) < WARM_THROTTLE_MS) return;
    sessionStorage.setItem('lastWarmAt', String(Date.now()));
    fetch('/api/ats/warm', { method: 'GET' }).catch(() => {});
    fetch('/api/ats/warm?window=last7', { method: 'GET' }).catch(() => {});
    fetch('/api/ats/warm?window=season', { method: 'GET' }).catch(() => {});
  } catch (_) {}
}

function maybeWarmAts() {
  warmAtsBothWindows();
}

/**
 * Render **bold** markdown tokens inline without an external dep.
 * Mirrors the renderFormatted() in Insights.jsx — kept here to avoid a shared import.
 */
function renderBriefingText(text) {
  if (!text) return null;
  const parts = [];
  let rest = text;
  let k = 0;
  while (rest.length > 0) {
    const bi = rest.indexOf('**');
    if (bi >= 0) {
      if (bi > 0) parts.push(<span key={k++}>{rest.slice(0, bi)}</span>);
      const end = rest.indexOf('**', bi + 2);
      if (end < 0) { parts.push(<span key={k++}>{rest.slice(bi)}</span>); break; }
      parts.push(<strong key={k++}>{rest.slice(bi + 2, end)}</strong>);
      rest = rest.slice(end + 2);
    } else {
      parts.push(<span key={k++}>{rest}</span>); break;
    }
  }
  return parts;
}

const BRIEFING_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/** Format a past timestamp (ms) as a human-relative string. */
function relativeTime(ts) {
  if (!ts || ts > Date.now()) return '';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Validate and parse the oddsBriefing:last localStorage entry.
 * Returns null (and removes the entry) when shape is invalid or stale.
 */
function loadBriefingCache() {
  try {
    const raw = localStorage.getItem('oddsBriefing:last');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.summary !== 'string' ||
      !Array.isArray(data.bullets) ||
      !data.bullets.every((b) => typeof b === 'string') ||
      typeof data.updatedAt !== 'number' ||
      data.updatedAt > Date.now() ||
      Date.now() - data.updatedAt > BRIEFING_TTL_MS
    ) {
      try { localStorage.removeItem('oddsBriefing:last'); } catch { /* ignore */ }
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Build a lightweight market snapshot from live game data already on-hand.
 * Used as a fallback when the user hasn't visited the Insights page yet.
 */
function generateLiveBriefing(games = [], rankMap = {}) {
  if (!Array.isArray(games) || games.length === 0) return null;
  const withSpread = games.filter((g) => g.spread != null);
  const withTotal  = games.filter((g) => g.total  != null);
  const rankedCount = games.filter((g) => {
    const hs = getTeamSlug(g.homeTeam);
    const as_ = getTeamSlug(g.awayTeam);
    return rankMap[hs] || rankMap[as_];
  }).length;

  const lines = [];
  lines.push(
    `**${games.length} game${games.length !== 1 ? 's' : ''}** on today's slate` +
    (withSpread.length > 0
      ? `, **${withSpread.length}** with active lines posted` +
        (rankedCount > 0 ? `, including **${rankedCount}** ranked team${rankedCount !== 1 ? 's' : ''} in action.` : '.')
      : '. Lines not yet posted.')
  );

  const bigFav = [...withSpread].sort((a, b) => Math.abs(b.spread ?? 0) - Math.abs(a.spread ?? 0))[0];
  if (bigFav && Math.abs(bigFav.spread ?? 0) >= 6) {
    const favIsHome = bigFav.spread < 0;
    const fav = favIsHome ? bigFav.homeTeam : bigFav.awayTeam;
    const dog = favIsHome ? bigFav.awayTeam : bigFav.homeTeam;
    const sp  = bigFav.spread;
    lines.push(`• **Heavy favorite:** ${fav} (${sp > 0 ? '+' : ''}${sp}) over ${dog}`);
  }

  const topTotal = [...withTotal].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];
  if (topTotal?.total) {
    lines.push(`• **Highest O/U:** ${topTotal.homeTeam} vs ${topTotal.awayTeam} — O/U **${topTotal.total}**`);
  }

  const closestSpread = [...withSpread]
    .filter((g) => g.spread != null && Math.abs(g.spread) <= 3)
    .sort((a, b) => Math.abs(a.spread ?? 0) - Math.abs(b.spread ?? 0))[0];
  if (closestSpread) {
    lines.push(`• **Pick 'em watch:** ${closestSpread.homeTeam} vs ${closestSpread.awayTeam} (${closestSpread.spread > 0 ? '+' : ''}${closestSpread.spread})`);
  }

  return lines.join('\n\n');
}

/**
 * True if all provided games are in a final/complete state, i.e., no picks are actionable.
 * Returns false if games array is empty (still loading).
 */
function allGamesComplete(games) {
  if (!Array.isArray(games) || games.length === 0) return false;
  return games.every((g) => {
    const s = (g.gameStatus || '').toLowerCase();
    return s === 'final' || s.includes('final') || s === 'f/ot' || s === 'ft';
  });
}

/**
 * Maximus's Picks teaser card.
 * Renders deterministic data-driven picks (Spread / ML / Totals) at the top,
 * then the existing Market Briefing content below — zero new API calls.
 *
 * Props:
 *   games       — merged game objects already on Home state
 *   rankMap     — slug→rank map already on Home state
 *   atsLeaders  — ATS leaders already on Home state
 */

/** Always combine today + tomorrow when today has fewer than this many games. */
const MIN_GAMES_FOR_PICKS = 12;

const PICKS_COLLAPSE_THRESHOLD = 540;

function OddsInsightsTeaser({ games = [], rankMap = {}, atsLeaders = { best: [], worst: [] }, championshipOdds = {}, loading = false, slowLoading = false, futureOddsGames = [], upcomingGamesWithSpreads = [] }) {
  const [briefingData, setBriefingData] = useState(null);
  const [relTimeStr, setRelTimeStr] = useState('');
  const [isPicksExpanded, setIsPicksExpanded] = useState(false);
  const picksContentRef = useRef(null);
  const [picksExceedsThreshold, setPicksExceedsThreshold] = useState(false);

  // ── Next-slate state: fetch tomorrow's schedule when today is done ──
  const [nextSlateGames, setNextSlateGames] = useState(null);   // null = not fetched yet
  const [nextSlateLoading, setNextSlateLoading] = useState(false);
  const nextSlateFetchedRef = useRef(false);

  // ── Thin-slate state: fetch tomorrow to supplement when today has < MIN games ──
  const [thinSlateGames, setThinSlateGames] = useState(null);   // null = not fetched yet
  const [thinSlateLoading, setThinSlateLoading] = useState(false);
  const thinSlateFetchedRef = useRef(false);

  // Read cache once on mount
  useEffect(() => {
    const data = loadBriefingCache();
    setBriefingData(data);
    if (data) setRelTimeStr(relativeTime(data.updatedAt));
  }, []);

  // Refresh relative-time label every 60 s
  useEffect(() => {
    if (!briefingData) return;
    const id = setInterval(
      () => setRelTimeStr(relativeTime(briefingData.updatedAt)),
      60_000
    );
    return () => clearInterval(id);
  }, [briefingData]);

  // When today's games are all final and we haven't fetched the next slate yet,
  // request the next sports day's schedule via the existing /api/home?dates= param.
  // Uses nextSportsDayStr() rather than a hard +1-day offset so that just-after-
  // midnight visits correctly fetch today's calendar date instead of skipping ahead.
  useEffect(() => {
    if (loading) return;
    if (!allGamesComplete(games)) return;
    if (nextSlateFetchedRef.current) return;
    nextSlateFetchedRef.current = true;
    const nextSlateIso = nextSportsDayStr();
    const nextSlateApi = toApiDateStr(nextSlateIso);
    setNextSlateLoading(true);
    const nextSlateAbort = new AbortController();
    const nextSlateTimeout = setTimeout(() => nextSlateAbort.abort(), 8000);
    fetch(`/api/home?dates=${nextSlateApi}`, { signal: nextSlateAbort.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        clearTimeout(nextSlateTimeout);
        const rawGames  = data?.scoresByDate?.[nextSlateApi] ?? [];
        const oddsGames = data?.odds?.games ?? [];
        const merged    = mergeGamesWithOdds(rawGames, oddsGames, getTeamSlug);
        setNextSlateGames(merged.length > 0 ? merged : []);
        setNextSlateLoading(false);
      })
      .catch(() => {
        clearTimeout(nextSlateTimeout);
        setNextSlateGames([]);
        setNextSlateLoading(false);
      });
    return () => { nextSlateAbort.abort(); clearTimeout(nextSlateTimeout); };
  }, [loading, games]);

  // Thin slate: when today has games but fewer than MIN_GAMES_FOR_PICKS,
  // and today is NOT yet complete, fetch the next sports day to supplement.
  useEffect(() => {
    if (loading) return;
    if (games.length === 0) return;
    if (allGamesComplete(games)) return; // handled by nextSlate effect above
    if (games.length >= MIN_GAMES_FOR_PICKS) return; // slate is rich enough
    if (thinSlateFetchedRef.current) return;
    thinSlateFetchedRef.current = true;
    const nextSlateIso = nextSportsDayStr();
    const nextSlateApi = toApiDateStr(nextSlateIso);
    setThinSlateLoading(true);
    fetch(`/api/home?dates=${nextSlateApi}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const rawGames  = data?.scoresByDate?.[nextSlateApi] ?? [];
        const oddsGames = data?.odds?.games ?? [];
        const merged    = mergeGamesWithOdds(rawGames, oddsGames, getTeamSlug);
        setThinSlateGames(merged.length > 0 ? merged : []);
        setThinSlateLoading(false);
      })
      .catch(() => {
        setThinSlateGames([]);
        setThinSlateLoading(false);
      });
  }, [loading, games]);

  // Determine the active picks slate
  const todayComplete = allGamesComplete(games) && !loading;

  // Thin slate: today has games but fewer than MIN_GAMES_FOR_PICKS and is not complete
  const thinSlateSupp = (thinSlateGames?.length > 0) ? thinSlateGames : futureOddsGames;
  const isThinSlate =
    !loading &&
    !todayComplete &&
    games.length > 0 &&
    games.length < MIN_GAMES_FOR_PICKS &&
    thinSlateSupp.length > 0;

  // activeGames: use the same bracket-first canonical pipeline as Content Studio.
  // During March Madness, this seeds from official bracket matchups and enriches
  // with odds. Outside tournament, falls back to feed-first assembly.
  const allScores = [...games];
  if (todayComplete && nextSlateGames?.length > 0) allScores.push(...nextSlateGames);
  if (isThinSlate) allScores.push(...thinSlateSupp);

  const activeGames = buildActivePicksGames({
    todayScores: allScores,
    oddsGames: futureOddsGames,
    upcomingGamesWithSpreads,
    getSlug: getTeamSlug,
    mergeWithOdds: mergeGamesWithOdds,
  });

  const slateDate = todayComplete
    ? nextSportsDayStr()   // sports-aware: returns today's calendar date before 4 AM
    : (games.length > 0 ? sportsDateStr() : null);

  // When thin slate is active, pass the next sports day so MaximusPicks can show combined label
  const slateDateSecondary = isThinSlate ? nextSportsDayStr() : null;

  const slateComplete = todayComplete;

  // When no cached Insights data, generate a live snapshot from current game slate
  const liveBriefing = !briefingData ? generateLiveBriefing(activeGames, rankMap) : null;

  // All bullets shown by default — no "More/Less" toggle needed
  const bullets = briefingData?.bullets ?? [];

  // Stable atsBySlug map — memoized to avoid re-creating on every render
  const atsBySlug = useMemo(() => {
    const all = [...(atsLeaders.best ?? []), ...(atsLeaders.worst ?? [])];
    if (all.length === 0) return null;
    const map = {};
    for (const row of all) {
      if (!row.slug) continue;
      map[row.slug] = {
        season: row.season ?? row.rec ?? null,
        last30: row.last30 ?? row.rec ?? null,
        last7:  row.last7  ?? row.rec ?? null,
      };
    }
    return Object.keys(map).length > 0 ? map : null;
  }, [atsLeaders.best, atsLeaders.worst]);

  // Picks derivation — memoized, with safe internal normalization via safeBuildPicks.
  const { picksResult, picksSummary, boardBriefing } = useMemo(() => {
    if (!activeGames.length) return { picksResult: EMPTY_PICKS, picksSummary: null, boardBriefing: null };
    const result = safeBuildPicks(buildMaximusPicks, { games: activeGames, atsLeaders, atsBySlug, rankMap, championshipOdds });
    let summary = null;
    let briefing = null;
    try { summary = buildPicksSummary(result); } catch { /* degrade */ }
    try { briefing = buildBoardBriefing(result); } catch { /* degrade */ }
    return { picksResult: result, picksSummary: summary, boardBriefing: briefing };
  }, [activeGames, atsLeaders, atsBySlug, rankMap, championshipOdds]);

  const totalPicksCount =
    picksResult.pickEmPicks.length +
    picksResult.atsPicks.length +
    picksResult.valuePicks.length +
    picksResult.totalsPicks.length;

  // Detect whether the picks content exceeds the collapse threshold
  useEffect(() => {
    const el = picksContentRef.current;
    if (!el) return;
    const check = () => setPicksExceedsThreshold(el.scrollHeight > PICKS_COLLAPSE_THRESHOLD);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [totalPicksCount, loading, slowLoading]);

  // Debug slate — activate with ?debugPicks in URL (dev or prod)
  const debugPicks = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('debugPicks');

  if ((import.meta.env?.DEV || debugPicks) && activeGames.length > 0) {
    console.log('[Picks:slate] activeGames:', activeGames.length,
      '| todayComplete:', todayComplete, '| isThinSlate:', isThinSlate);
    console.table(activeGames.map((g) => ({
      matchup:       `${g.awayTeam} @ ${g.homeTeam}`,
      startTime:     g.startTime ?? '',
      hasSpread:     g.spread != null || g.homeSpread != null || g.awaySpread != null,
      spread:        g.spread ?? g.homeSpread ?? null,
      hasTotal:      g.total != null,
      total:         g.total ?? null,
      hasML:         g.moneyline != null,
      moneyline:     g.moneyline ?? null,
    })));
    console.log('[Picks:result] pickEmPicks:', picksResult.pickEmPicks.length,
      '| atsPicks:', picksResult.atsPicks.length,
      '| valuePicks:', picksResult.valuePicks.length,
      '| totalsPicks:', picksResult.totalsPicks.length);
  }

  const slateSummaryLabel = slateComplete
    ? 'Next Slate Picks'
    : isThinSlate
      ? 'Today + Tomorrow'
      : 'Today\'s Picks';

  return (
    <div className={styles.oddsTeaser}>
      {/* ── Picks controls ──────────────────────────────────────────── */}
      <div className={styles.oddsTeaserHeader}>
        <div className={styles.oddsTeaserHeaderRight}>
          <button
            type="button"
            className={styles.picksToggleBtn}
            onClick={() => setIsPicksExpanded((prev) => !prev)}
            aria-expanded={isPicksExpanded}
          >
            {isPicksExpanded ? 'Collapse picks' : `Show all ${totalPicksCount} picks`}
            <span
              className={`${styles.picksToggleChevron} ${isPicksExpanded ? styles.picksToggleChevronOpen : ''}`}
              aria-hidden
            >
              ‹
            </span>
          </button>
          <span className={styles.oddsTeaserTag}>Data-Driven Leans</span>
        </div>
      </div>
      {/* ── Board briefing ──────────────────────────────────────────── */}
      {boardBriefing ? (
        <div className={styles.picksSummaryBar}>
          <span className={styles.picksSummaryLabel}>{slateSummaryLabel}</span>
          <div className={styles.briefingContent}>
            <span className={styles.briefingHeadline}>{boardBriefing.headline}</span>
            {boardBriefing.body && <span className={styles.briefingBody}>{boardBriefing.body}</span>}
          </div>
          <div className={styles.briefingChips}>
            <span className={styles.boardTypeChip} data-type={boardBriefing.boardType}>
              {{ spreads: 'SPREADS ACTIVE', value: 'VALUE BOARD', totals: 'TOTALS HEAVY', pickem: 'WINNERS BOARD', mixed: 'MIXED SLATE' }[boardBriefing.boardType] || 'ACTIVE'}
            </span>
            {boardBriefing.boardStrength && (
              <span className={styles.boardStrengthChip} data-strength={boardBriefing.boardStrength.toLowerCase()}>
                {boardBriefing.boardStrength}
              </span>
            )}
          </div>
        </div>
      ) : picksSummary ? (
        <div className={styles.picksSummaryBar}>
          <span className={styles.picksSummaryLabel}>{slateSummaryLabel}</span>
          <span className={styles.picksSummaryText}>{picksSummary}</span>
        </div>
      ) : null}

      <p className={styles.oddsPicksSubheader}>
        Leans are threshold-qualified. Monitoring tracks games with lines posted.
      </p>

      {/* ── Picks: Pick 'Ems / ATS / Value / Totals ─────────────────── */}
      <div
        ref={picksContentRef}
        className={`${styles.picksCollapsible} ${!isPicksExpanded ? styles.picksCollapsiblePeek : ''}`}
      >
        <Suspense fallback={<SectionSkeleton height={200} />}>
          <MaximusPicks
            games={activeGames}
            atsLeaders={atsLeaders}
            atsBySlug={atsBySlug}
            rankMap={rankMap}
            championshipOdds={championshipOdds}
            loading={loading || slowLoading || nextSlateLoading || thinSlateLoading}
            slateDate={slateDate}
            slateDateSecondary={slateDateSecondary}
            slateComplete={slateComplete}
          />
        </Suspense>
      </div>

      {!isPicksExpanded ? (
        <button
          type="button"
          className={styles.picksExpandBtn}
          onClick={() => setIsPicksExpanded(true)}
        >
          Show all {totalPicksCount} picks ↓
        </button>
      ) : (
        <button
          type="button"
          className={styles.picksExpandBtn}
          onClick={() => setIsPicksExpanded(false)}
        >
          Collapse picks ↑
        </button>
      )}

      <Link to="/ncaam/insights" className={styles.oddsTeaserCta}>
        Open Full Odds Insights →
      </Link>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Intersection refs for deferred below-the-fold sections ──
  const [atsRef, atsInView] = useInView({ rootMargin: '300px' });
  const [intelRef, intelInView] = useInView({ rootMargin: '300px' });
  const [tournamentRef, tournamentInView] = useInView({ rootMargin: '300px' });

  // ── Welcome modal: show on first visit or when ?welcome=1 is present ──
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('welcome') === '1') return true;
      return !getFlag('mx_welcome_seen_v1');
    } catch { return false; }
  });

  const [newsData, setNewsData] = useState({ teamNews: [], newsFeed: mockNewsFeed, pinnedTeamNewsMap: {} });
  const [scores, setScores] = useState({ games: [], loading: true, error: null });
  const [slowLoading, setSlowLoading] = useState(true);
  // Odds API games whose commence date doesn't match today's ESPN scores.
  // Populated when today's slate is done and tomorrow's lines are already posted.
  // Passed to OddsInsightsTeaser as a fallback when nextSlateGames is empty.
  const [futureOddsGames, setFutureOddsGames] = useState([]);
  const [rankMap, setRankMap] = useState({});
  const [top25, setTop25] = useState([]);
  const {
    atsLeaders,
    atsMeta,
    atsWindow,
    atsLoading,
    seasonWarming,
    onRetry: atsOnRetry,
    onPeriodChange: atsOnPeriodChange,
  } = useAtsLeaders({ initialWindow: 'last30' });
  const [oddsHistory, setOddsHistory] = useState({ games: [] });
  const [newsSource, setNewsSource] = useState('Mock');
  const [pinned, setPinned] = useState(() => getPinnedTeams());
  // Data status UI moved to Settings; kept as debug-only via ?debugData=1
  const [showDataStatus] = useState(false);
  const [dataStatus, setDataStatus] = useState(null);
  const [pinnedTeamDataBySlug, setPinnedTeamDataBySlug] = useState({});
  const [headlinesWarming, setHeadlinesWarming] = useState(false);
  const [upcomingGamesWithSpreads, setUpcomingGamesWithSpreads] = useState([]);
  const [championshipOdds, setChampionshipOdds] = useState({});
  const [championshipOddsMeta, setChampionshipOddsMeta] = useState(null);
  const [championshipOddsLoading, setChampionshipOddsLoading] = useState(true);
  const [summaryRefreshTick, setSummaryRefreshTick] = useState(0);
  const [llmSummary, setLlmSummary] = useState(null);
  const [llmSummaryRefreshing, setLlmSummaryRefreshing] = useState(false);
  // Insight card: collapsed by default on mobile; persisted in localStorage.
  const [isBannerCollapsed, setIsBannerCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('homeInsightCollapsed');
      return v === null ? true : v === '1';
    } catch { return true; }
  });
  // ATS and Tournament Watch now use teaser mode — mobile collapse state no longer needed
  const pinnedSlugs = pinned.length > 0 ? pinned : ['duke-blue-devils', 'houston-cougars', 'purdue-boilermakers', 'kansas-jayhawks'];

  const championshipScheduledRef = useRef(false);
  const homeFastRefetchInFlightRef = useRef(false);
  const atsLeadersRef = useRef(atsLeaders);
  // Always holds the latest pinnedSlugs without being a useCallback dep — prevents
  // loadHomeBatch from recreating (and thus re-firing) every time the user pins a team.
  const pinnedSlugsRef = useRef(pinnedSlugs);
  pinnedSlugsRef.current = pinnedSlugs;
  useEffect(() => {
    atsLeadersRef.current = atsLeaders;
  }, [atsLeaders]);

  useEffect(() => {
    if (import.meta.env?.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugAts') === '1' && atsMeta != null) {
      const bestCount = atsLeaders.best?.length ?? 0;
      const worstCount = atsLeaders.worst?.length ?? 0;
      console.log('[Home ATS] atsMeta', { atsMeta, bestCount, worstCount });
    }
  }, [atsMeta, atsLeaders.best?.length, atsLeaders.worst?.length]);

  /* Championship odds: deferred until after ATS warm + initial fast response (requestIdleCallback or 1500ms). Scheduled once per page load from inside loadHomeBatch .then(). */
  const runChampionshipFetch = useCallback(() => {
    if (championshipScheduledRef.current) return;
    championshipScheduledRef.current = true;
    const run = () => {
      if (import.meta.env?.DEV) console.log('[Home ATS] championship fetch start', Date.now());
      fetchChampionshipOdds()
        .then(({ odds, oddsMeta }) => {
          setChampionshipOdds(odds ?? {});
          setChampionshipOddsMeta(oddsMeta ?? null);
          setChampionshipOddsLoading(false);
          if (import.meta.env?.DEV) console.log('[Home ATS] championship fetch end', Date.now());
        })
        .catch(() => {
          setChampionshipOdds({});
          setChampionshipOddsMeta(null);
          setChampionshipOddsLoading(false);
          if (import.meta.env?.DEV) console.log('[Home ATS] championship fetch error', Date.now());
        });
    };
    if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 1500);
  }, []);

  // Fast path: scores, rankings, headlines only. ATS comes from /api/ats/leaders (separate fetch).
  // IMPORTANT: Uses pinnedSlugsRef.current (not pinnedSlugs directly) so the callback is NOT
  // recreated on every pin change — preventing a re-fetch storm on each pin action.
  const loadHomeBatch = useCallback(() => {
    if (!hasAtsData(atsLeadersRef.current)) maybeWarmAts();
    setScores((s) => ({ ...s, loading: true }));
    setSlowLoading(true);
    // Snapshot the latest slugs at call time so stale closures cannot diverge.
    const currentPinnedSlugs = pinnedSlugsRef.current;
    perfLog('fetchHomeFast', () => fetchHomeFast({ pinnedSlugs: currentPinnedSlugs, atsWindow }), 2000)
      .then((fastData) => {
        const scoresToday = fastData.scoresToday ?? [];
        const rankings = fastData.rankings?.rankings ?? fastData.rankingsTop25 ?? [];
        setScores({
          games: scoresToday,
          loading: false,
          error: null,
          oddsError: null,
          oddsMessage: null,
        });
        setRankMap(buildSlugToRankMap({ rankings }, TEAMS));
        setTop25(rankings);
        setDataStatus(fastData.dataStatus ?? null);
        setHeadlinesWarming(fastData.headlinesWarming ?? false);
        setOddsHistory({ games: [] });
        const meta = fastData.pinnedTeamsMeta ?? [];
        const pinnedTeamNewsMap = {};
        const teamNews = meta.map(({ slug, name }) => ({
          slug,
          team: name,
          headlines: 0,
        }));
        const fastHeadlines = fastData.headlines ?? [];
        const newsFeedFromFast = Array.isArray(fastHeadlines)
          ? fastHeadlines.map((item, i) => ({
              id: item.link || item.id || `fast-${i}`,
              title: item.title,
              source: item.source || 'News',
              time: formatRelativeTime(item.pubDate),
              link: item.link,
              excerpt: '',
              sentiment: 'neutral',
            }))
          : [];
        setNewsData((prev) => ({ ...prev, newsFeed: newsFeedFromFast, teamNews, pinnedTeamNewsMap }));
        setNewsSource('Multiple');

        if (currentPinnedSlugs.length > 0) {
          // Immediately hydrate from module-level cache (survives SPA navigation).
          // Always MERGE (functional update) so a stale response from a previous
          // in-flight request cannot wipe data that arrived more recently.
          const fromCache = {};
          const uncachedSlugs = [];
          currentPinnedSlugs.forEach((slug) => {
            const hit = getPinnedCache(slug);
            if (hit) { fromCache[slug] = hit; } else { uncachedSlugs.push(slug); }
          });
          if (Object.keys(fromCache).length > 0) {
            // MERGE — not replace.  Prevents race condition when loadHomeBatch fires
            // twice concurrently (e.g. on initial mount and on pin change).
            setPinnedTeamDataBySlug((prev) => ({ ...prev, ...fromCache }));
          }
          if (uncachedSlugs.length > 0) {
            fetchTeamBatch(uncachedSlugs)
              .then(({ teams }) => {
                const t = teams || {};
                Object.entries(t).forEach(([slug, data]) => setPinnedCache(slug, data));
                setPinnedTeamDataBySlug((prev) => ({ ...prev, ...t }));
              })
              .catch(() => {});
          }
        }

        runChampionshipFetch();

        perfLog('fetchHomeSlow', () => fetchHomeSlow({ pinnedSlugs: currentPinnedSlugs }), 3000)
          .then((slowData) => {
            setSlowLoading(false);
            const merged = mergeHomeData(fastData, slowData);
            const scoresArray = merged.scores ?? [];
            const oddsData = merged.odds ?? {};
            const oddsGames = oddsData.games ?? [];
            const todayScores = Array.isArray(scoresArray) ? scoresArray : [];
            const mergedGames = mergeGamesWithOdds(todayScores, oddsGames, getTeamSlug);

            // Collect odds games from a future date — needed when today's ESPN games are
            // finished but tomorrow's lines are already live in the Odds API.
            // OddsInsightsTeaser uses these as a fallback when nextSlateGames is empty.
            const scoreDatesSet = new Set(
              todayScores.flatMap((g) => {
                const dt = g.startTime ? new Date(g.startTime).toISOString().slice(0, 10) : '';
                return dt ? [dt] : [];
              })
            );
            const newFutureOddsGames = oddsGames.filter((og) => {
              const dt = og.commenceTime ? new Date(og.commenceTime).toISOString().slice(0, 10) : '';
              return dt && !scoreDatesSet.has(dt);
            });
            setFutureOddsGames(newFutureOddsGames);
            setUpcomingGamesWithSpreads(merged.upcomingGamesWithSpreads ?? []);

            let oddsMessage = null;
            if (oddsData.error === 'missing_key') {
              oddsMessage = 'Odds API key missing in production.';
            } else if (oddsData.hasOddsKey === true && oddsGames.length === 0) {
              oddsMessage = scoresArray.length > 0 ? 'Odds API returned no games.' : 'No odds currently available.';
            }
            setScores((s) => ({ ...s, games: mergedGames, oddsError: oddsData.error, oddsMessage }));
            setRankMap(buildSlugToRankMap({ rankings: merged.rankings?.rankings ?? [] }, TEAMS));
            setTop25(merged.rankings?.rankings ?? []);
            setDataStatus(merged.dataStatus ?? null);
            setHeadlinesWarming(merged.headlinesWarming ?? false);
            setOddsHistory(merged.oddsHistory ?? { games: [] });
            const items = merged.headlines ?? [];
            const newsFeed = items.map((item, i) => ({
              id: item.link || `agg-${i}`,
              title: item.title,
              source: item.source || 'News',
              time: formatRelativeTime(item.pubDate),
              link: item.link,
              excerpt: '',
              sentiment: 'neutral',
            }));
            const pinnedTeamNewsMap = merged.pinnedTeamNews && typeof merged.pinnedTeamNews === 'object' ? merged.pinnedTeamNews : {};
            const teamNews = Object.entries(pinnedTeamNewsMap).map(([slug, headlines]) => ({
              slug,
              team: getTeamBySlug(slug)?.name ?? slug,
              headlines: (headlines || []).length,
            }));
            setNewsData((prev) => ({ ...prev, newsFeed, teamNews, pinnedTeamNewsMap }));
          })
          .catch(() => {
            setSlowLoading(false);
          });
      })
      .catch((err) => {
        setScores({ games: [], loading: false, error: err.message, oddsError: null, oddsMessage: null });
        setSlowLoading(false);
        setRankMap({});
        setDataStatus(null);
        setTop25([]);
        setNewsData((prev) => ({ ...prev, newsFeed: mockNewsFeed, teamNews: [], pinnedTeamNewsMap: {} }));
        setNewsSource('Mock');
      });
  // Intentionally omit pinnedSlugs from deps — the ref keeps it fresh without
  // causing the callback to recreate (and the effect to re-fire) on every pin action.
  // Newly-pinned teams get their data via the staggered enrichment effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runChampionshipFetch]);

  useEffect(() => {
    loadHomeBatch();
  }, [loadHomeBatch]);

  // ── Periodic score refresh (silent — no loading spinner) ──────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const currentPinnedSlugs = pinnedSlugsRef.current;
      fetchHomeFast({ pinnedSlugs: currentPinnedSlugs, atsWindow })
        .then((fastData) => {
          const scoresToday = fastData.scoresToday ?? [];
          setScores((s) => ({
            ...s,
            games: scoresToday.length > 0 ? scoresToday : s.games,
          }));
        })
        .catch(() => {});
    }, SCORES_REFRESH_MS);
    return () => clearInterval(id);
  }, [atsWindow]);

  // ── Homepage load telemetry ──────────────────────────────────────────────
  const criticalReady = !scores.loading && (scores.games.length > 0 || top25.length > 0);
  const hasCriticalError = !!scores.error && !scores.loading;
  useHomeLoadTelemetry({ criticalReady, hasCriticalError, user });

  // Fetch LLM-enhanced summary in background AFTER a short delay to prioritize
  // critical data. Uses a module-level TTL cache so rapid SPA nav-back skips re-fetch.
  useEffect(() => {
    const now = Date.now();
    if (_llmSummaryCache.data && now - _llmSummaryCache.ts < LLM_SUMMARY_TTL_MS) {
      setLlmSummary(fixPositiveOdds(_llmSummaryCache.data));
      return;
    }
    const controller = new AbortController();
    const delay = setTimeout(() => {
      perfLog('homeSummary', () =>
        fetch('/api/chat/homeSummary', { signal: controller.signal })
          .then((r) => r.json())
          .then((d) => {
            if (d?.summary) {
              const fixed = fixPositiveOdds(d.summary);
              _llmSummaryCache.data = fixed;
              _llmSummaryCache.ts = Date.now();
              setLlmSummary(fixed);
            }
            return d;
          }),
        3000,
      ).catch(() => {});
    }, 1500);
    return () => { clearTimeout(delay); controller.abort(); };
  }, []);

  const STAGGER_MS = 2500;
  useEffect(() => {
    if (pinnedSlugs.length === 0) return;
    const timeouts = [];
    let delay = 0;
    pinnedSlugs.slice(0, 8).forEach((slug) => {
      // Skip enrichment fetch when a fresh cache entry already exists
      if (hasFreshPinnedCache(slug)) return;
      const t = setTimeout(() => {
        fetchTeamPage(slug)
          .then((data) => {
            const ats = data.schedule && data.oddsHistory && data.team
              ? computeAtsFromScheduleAndHistory(data.schedule, data.oddsHistory, data.team.name)
              : { season: null, last30: null, last7: null };
            const enriched = {
              team: data.team,
              schedule: data.schedule,
              oddsHistory: data.oddsHistory,
              teamNews: data.teamNews,
              rank: data.rank,
              ats,
            };
            setPinnedCache(slug, enriched);
            setPinnedTeamDataBySlug((prev) => ({ ...prev, [slug]: enriched }));
          })
          .catch(() => {});
      }, delay);
      delay += STAGGER_MS;
      timeouts.push(t);
    });
    return () => timeouts.forEach(clearTimeout);
  }, [pinnedSlugs.join(',')]);  // eslint-disable-line react-hooks/exhaustive-deps

  // handleToggleDataStatus removed — data status UI moved to debug mode

  const handleWelcomeClose = useCallback(() => {
    setWelcomeOpen(false);
    setFlag('mx_welcome_seen_v1');
  }, []);

  const handleWelcomeSignup = useCallback(() => {
    handleWelcomeClose();
    navigate('/settings');
  }, [handleWelcomeClose, navigate]);

  const handleWelcomeExplore = useCallback(() => {
    trackAccountCreateSkipped({ reason: 'welcome_modal_explore' });
    handleWelcomeClose();
  }, [handleWelcomeClose]);

  const dataStatusForBadges = useMemo(() => {
    if (dataStatus) return dataStatus;
    const recentGames = (scores.games || []).filter((g) => isFinal(g.gameStatus));
    const headlines = newsData.newsFeed || [];
    const atsCount = (atsLeaders.best?.length || 0) + (atsLeaders.worst?.length || 0);
    return {
      scoresCount: recentGames.length,
      rankingsCount: top25.length,
      oddsCount: 0,
      oddsHistoryCount: 0,
      headlinesCount: headlines.length,
      atsLeadersCount: atsCount,
    };
  }, [dataStatus, scores.games, top25.length, newsData.newsFeed, atsLeaders.best, atsLeaders.worst]);

  const hasMinimalData = !scores.loading || (scores.games && scores.games.length > 0) || top25.length > 0 || (newsData.newsFeed && newsData.newsFeed.length > 0);
  const summaryData = useMemo(() => {
    const recentGames = (scores.games || []).filter((g) => isFinal(g.gameStatus));
    const upcomingGames = (scores.games || []).filter((g) => !isFinal(g.gameStatus));
    const headlines = (newsData.newsFeed || []).slice(0, 5).map((h) => ({ title: h.title, source: h.source }));
    const pinnedTeams = Object.values(pinnedTeamDataBySlug || {}).map((v) => ({
      name: v.team?.name,
      conference: v.team?.conference,
      oddsTier: v.team?.oddsTier,
      rank: v.rank,
      ats: v.ats,
    })).filter((p) => p.name);
    const tournamentWatchSlice = (top25 || []).slice(10, 15);
    return {
      top25: top25 || [],
      championshipOdds: championshipOdds || {},
      recentGames,
      upcomingGames,
      atsLeaders: atsLeaders || { best: [], worst: [] },
      atsMeta: atsMeta || null,
      atsWindow: atsWindow || 'last30',
      headlines,
      pinnedTeams,
      tournamentWatchSlice,
      rankedInAction: countRankedInAction(scores.games || [], rankMap),
      upsetCount: countUpsets(scores.games || []),
    };
  }, [top25, scores.games, rankMap, newsData.newsFeed, atsLeaders, atsMeta, atsWindow, championshipOdds, pinnedTeamDataBySlug]);
  const summaryText = useMemo(() => {
    if (!hasMinimalData) return '';
    return generateChatSummary('home', summaryData);
  }, [hasMinimalData, summaryData, summaryRefreshTick]);

  const handleRefreshSummary = useCallback(() => {
    setSummaryRefreshTick((t) => t + 1);
    // Also kick an LLM regeneration and update when it returns.
    setLlmSummaryRefreshing((refreshing) => {
      if (refreshing) return refreshing;
      perfLog('homeSummary?force=1', () =>
        fetch('/api/chat/homeSummary?force=1')
          .then((r) => r.json())
          .then((d) => {
            setLlmSummaryRefreshing(false);
            if (d?.summary) {
              const fixed = fixPositiveOdds(d.summary);
              _llmSummaryCache.data = fixed;
              _llmSummaryCache.ts = Date.now();
              setLlmSummary(fixed);
            }
            return d;
          }),
        5000,
      ).catch(() => { setLlmSummaryRefreshing(false); });
      return true;
    });
  }, []);

  const handleToggleBanner = useCallback(() => {
    setIsBannerCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('homeInsightCollapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  // handleToggleAts and handleToggleTournament removed — teaser mode replaces collapse

  // Badge status: ok (green), partial (amber), missing (red) — from payload counts
  const getESPNStatus = () => {
    const { scoresCount = 0, rankingsCount = 0 } = dataStatusForBadges;
    const n = scoresCount + rankingsCount;
    if (n === 0) return 'missing';
    if (n < 3) return 'partial';
    return 'ok';
  };
  const getOddsStatus = () => {
    const { oddsCount = 0, oddsHistoryCount = 0 } = dataStatusForBadges;
    const n = oddsCount + oddsHistoryCount;
    if (n === 0) return 'missing';
    if (n < 3) return 'partial';
    return 'ok';
  };
  const getNewsStatus = () => {
    if (headlinesWarming) return 'warming';
    const n = dataStatusForBadges.headlinesCount ?? 0;
    if (n === 0) return 'missing';
    if (n < 3) return 'partial';
    return 'ok';
  };
  const getAtsStatus = () => {
    if (atsLoading) return 'warming';
    const n = dataStatusForBadges.atsLeadersCount ?? 0;
    if (n === 0) return 'missing';
    if (n < 3) return 'partial';
    return 'ok';
  };
  const statusLabel = (status) => (status === 'ok' ? 'OK' : status === 'partial' ? 'PARTIAL' : status === 'warming' ? 'WARMING' : 'MISSING');

  const upsetCount = countUpsets(scores.games);
  const rankedInAction = countRankedInAction(scores.games, rankMap);
  const newsVelocity = newsData.teamNews.reduce((sum, t) => sum + (typeof t.headlines === 'number' ? t.headlines : (t.headlines?.length || 0)), 0);

  const dynamicStats = [
    { label: 'Upsets', value: upsetCount, trend: upsetCount > 0 ? 'up' : 'neutral', subtext: 'ESPN scores + tiers', source: 'ESPN' },
    { label: 'Ranked in action', value: rankedInAction, trend: 'neutral', subtext: 'Top 25 playing today', source: 'ESPN' },
    { label: 'Headlines', value: newsVelocity, trend: newsVelocity > 0 ? 'up' : 'neutral', subtext: 'Pinned team news', source: newsSource },
  ];

  const todayDisplay = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className={styles.home}>
      <SEOHead
        title={`College Basketball Betting Intelligence & March Madness Picks (${new Date().getFullYear()})`}
        description={`AI-powered college basketball betting intelligence for the ${new Date().getFullYear()} season — today's ATS picks, model-driven predictions, and March Madness insights across every major NCAAB matchup.`}
        canonicalPath="/ncaam"
        ogImage={buildOgImageUrl({ title: 'College Basketball Intelligence', subtitle: 'ATS trends, model-driven picks & March Madness insights', type: 'Team Intel' })}
      />
      <WelcomeModal
        open={welcomeOpen}
        onClose={handleWelcomeClose}
        onSignup={handleWelcomeSignup}
        onExplore={handleWelcomeExplore}
      />
      <SignupBanner />

      {/* Page intro — date + context bar */}
      <header className={styles.pageIntro}>
        <h1 className={styles.srOnly}>Maximus Sports — College Basketball Betting Intelligence</h1>
        <span className={styles.pageIntroDate}>{todayDisplay}</span>
        <span className={styles.pageIntroDivider}>·</span>
        <span className={styles.pageIntroSub}>College Basketball Intelligence</span>
      </header>

      {/* ── Championship Hero (season complete) ───────────────────── */}
      {(() => {
        const cbb = WORKSPACES[WorkspaceId.CBB];
        if (cbb.seasonState !== SeasonState.COMPLETED || !cbb.championship) return null;
        const ch = cbb.championship;
        return (
          <div className={styles.champHero}>
            <div className={styles.champHeroInner}>
              <span className={styles.champTrophy}>🏆</span>
              <div className={styles.champContent}>
                <span className={styles.champEyebrow}>March Madness {ch.year} — National Champion</span>
                <h2 className={styles.champTeam}>{ch.champion}</h2>
                <p className={styles.champScore}>
                  Championship Final: {ch.score} vs {ch.runnerUp}
                </p>
                <p className={styles.champLine}>{ch.headline}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Hero Intelligence Briefing Card ─────────────────────────── */}
      <div className={styles.banner}>
        <img src="/mascot.png" alt="Maximus Sports college basketball intelligence mascot" className={styles.bannerMascot} width={120} height={120} loading="lazy" decoding="async" onError={(e) => { e.target.style.display = 'none'; }} />
        <div className={styles.bannerContent}>
          {/* Editorial briefing header — always visible */}
          <div className={styles.heroBriefingHeader}>
            <span className={styles.heroBriefingEyebrow}>Today&apos;s Intelligence Briefing</span>
          </div>

          {/* Collapsible text area — max-height clamped only on mobile */}
          <div
            id="home-insight-body"
            className={`${styles.insightBody} ${isBannerCollapsed ? styles.insightBodyCollapsed : ''}`}
          >
            {(llmSummary || summaryText) ? (
              <FormattedSummary text={llmSummary || summaryText} className={styles.bannerText} />
            ) : (
              <p className={styles.bannerText}>Loading today&apos;s intel…</p>
            )}
          </div>

          {/* Read more / Show less — visible only on mobile; footer-row style when collapsed */}
          <button
            type="button"
            className={`${styles.insightToggle}${isBannerCollapsed ? ` ${styles.insightToggleFooter}` : ''}`}
            onClick={handleToggleBanner}
            aria-expanded={!isBannerCollapsed}
            aria-controls="home-insight-body"
          >
            <span>{isBannerCollapsed ? 'Read full briefing' : 'Show less'}</span>
            <span
              className={`${styles.insightToggleChevron} ${!isBannerCollapsed ? styles.insightToggleChevronOpen : ''}`}
              aria-hidden
            >›</span>
          </button>
        </div>
      </div>

      {/* ── 2b. Bracketology Promo ──────────────────────────────────── */}
      <section className={styles.bracketPromo}>
        <div className={styles.bracketPromoInner}>
          <div className={styles.bracketPromoContent}>
            <span className={styles.bracketPromoEyebrow}>March Madness 2026</span>
            <h3 className={styles.bracketPromoTitle}>Build Your Bracket with Maximus</h3>
            <p className={styles.bracketPromoBody}>
              Use the Maximus model to fill your bracket — or compete against it. Region-by-region picks, upset probabilities, and data-driven predictions for every matchup.
            </p>
            <div className={styles.bracketPromoCtas}>
              <Link to={BRACKETOLOGY_ROUTE} className={styles.bracketPromoPrimary}>
                Complete Your Bracket →
              </Link>
              <Link to={BRACKETOLOGY_ROUTE} className={styles.bracketPromoSecondary}>
                Beat the Model
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Pulse / Snapshot Strip ──────────────────────────────────── */}
      <SectionErrorBoundary name="Today's Snapshot" silent>
        <div className={styles.pulseStrip}>
          <DynamicStats stats={dynamicStats} compact games={scores.games} rankMap={rankMap} atsLeaders={atsLeaders} championshipOdds={championshipOdds} />
        </div>
      </SectionErrorBoundary>

      {/* ── 4. Teams You Follow ──────────────────────────────────────── */}
      <hr className={styles.sectionDivider} />
      <div className={styles.pinnedSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>Following</span>
          <h2 className={styles.sectionHeadTitle}>Teams You Follow</h2>
        </div>
        <PinnedErrorBoundary>
          <PinnedTeamsSection
            onPinnedChange={setPinned}
            rankMap={rankMap}
            games={scores.games}
            teamNewsBySlug={newsData.pinnedTeamNewsMap}
            pinnedTeamDataBySlug={pinnedTeamDataBySlug}
            compact
          />
        </PinnedErrorBoundary>
      </div>

      {/* ── 5. Maximus's Picks ───────────────────────────────────────── */}
      <hr className={styles.sectionDivider} />
      <SectionErrorBoundary name="Maximus's Picks">
        <div className={styles.picksSection}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>Betting Intelligence</span>
            <h2 className={styles.sectionHeadTitle}>Maximus&apos;s Picks</h2>
          </div>
          <OddsInsightsTeaser
            games={scores.games}
            rankMap={rankMap}
            atsLeaders={atsLeaders}
            championshipOdds={championshipOdds}
            loading={scores.loading || atsLoading}
            slowLoading={slowLoading}
            futureOddsGames={futureOddsGames}
            upcomingGamesWithSpreads={upcomingGamesWithSpreads}
          />
        </div>
      </SectionErrorBoundary>

      {/* ── 6. Today's Action / Live Scores ──────────────────────────── */}
      <hr className={styles.sectionDivider} />
      <SectionErrorBoundary name="Today's Games">
        <section className={styles.todayActionSection}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>Live Data</span>
            <h2 className={styles.sectionHeadTitle}>Today&apos;s Games</h2>
          </div>
          <LiveScores
            games={scores.games}
            loading={scores.loading}
            error={scores.error}
            oddsMessage={scores.oddsMessage}
            compact
            rankMap={rankMap}
            cap={8}
            mobileCap={4}
          />
          {upsetCount > 0 && (
            <Suspense fallback={null}>
              <div className={styles.todayActionAlerts}>
                <DynamicAlerts games={scores.games} oddsHistory={oddsHistory.games} />
              </div>
            </Suspense>
          )}
          <Link to="/ncaam/games" className={styles.sectionCta}>
            View full schedule →
          </Link>
        </section>
      </SectionErrorBoundary>

      {/* ── 7. ATS / Market Signals (deferred until near viewport) ──── */}
      <hr className={styles.sectionDivider} />
      <div ref={atsRef}>
        {atsInView ? (
          <SectionErrorBoundary name="ATS Leaders">
            <section className={styles.atsSection} aria-busy={scores.loading}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionEyebrow}>Market Signals</span>
                <h2 className={styles.sectionHeadTitle}>Against the Spread Leaders</h2>
              </div>
              <Suspense fallback={<SectionSkeleton height={180} />}>
                <ATSLeaderboard
                  atsLeaders={atsLeaders}
                  atsMeta={atsMeta}
                  loading={atsLoading}
                  atsWindow={atsWindow}
                  seasonWarming={seasonWarming}
                  onPeriodChange={atsOnPeriodChange}
                  onRetry={atsOnRetry}
                />
              </Suspense>
              <Link to="/ncaam/insights" className={styles.sectionCta}>
                View full market signals →
              </Link>
            </section>
          </SectionErrorBoundary>
        ) : (
          <SectionSkeleton height={180} />
        )}
      </div>

      {/* ── 8. News / Videos / Intel Feed (deferred) ──────────────────── */}
      <hr className={styles.sectionDivider} />
      <div ref={intelRef}>
        {intelInView ? (
          <SectionErrorBoundary name="Intel Feed">
            <section className={styles.intelFeedSection}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionEyebrow}>Intel Feed</span>
                <h2 className={styles.sectionHeadTitle}>News &amp; Highlights</h2>
              </div>
              <Suspense fallback={<SectionSkeleton height={160} />}>
                <div className={styles.intelFeedGrid}>
                  <NewsFeed mode="videos" limitVideos={4} />
                  <NewsFeed
                    mode="headlines"
                    items={(newsData.newsFeed || []).slice(0, 8)}
                    source={newsSource}
                    loading={headlinesWarming && (newsData.newsFeed || []).length === 0}
                    limitHeadlines={6}
                  />
                </div>
              </Suspense>
              <Link to="/ncaam/news" className={styles.sectionCta}>
                View full Intel Feed →
              </Link>
            </section>
          </SectionErrorBoundary>
        ) : (
          <SectionSkeleton height={160} />
        )}
      </div>

      {/* ── 9. Rankings / Team Intel Teaser (deferred) ──────────────── */}
      <hr className={styles.sectionDivider} />
      <div ref={tournamentRef}>
        {tournamentInView ? (
          <SectionErrorBoundary name="Tournament Watch">
            <section className={styles.tournamentWatchSection} aria-label="Tournament Watch">
              <div className={styles.sectionHead}>
                <span className={styles.sectionEyebrow}>Tournament Deep Dive</span>
                <h2 className={styles.sectionHeadTitle}>Tournament Watch</h2>
              </div>
              <Suspense fallback={<SectionSkeleton height={200} />}>
                <RankingsTable
                  title="Tournament Watch — Top 25"
                  badge="Deep Dive"
                  collapsible
                  capRows={10}
                  defaultSortBy="top25"
                  rankings={top25}
                  championshipOdds={championshipOdds}
                  championshipOddsMeta={championshipOddsMeta}
                  championshipOddsLoading={championshipOddsLoading}
                  showRegionFilter
                />
              </Suspense>
              <Link to="/ncaam/teams" className={styles.sectionCta}>
                Explore full tournament field →
              </Link>
            </section>
          </SectionErrorBoundary>
        ) : (
          <SectionSkeleton height={200} />
        )}
      </div>

      {/* ── 10. How Maximus Works (SEO + conversion) ─────────────── */}
      <hr className={styles.sectionDivider} />
      <section className={styles.howItWorks}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>The Edge</span>
          <h2 className={styles.sectionHeadTitle}>How Maximus Works</h2>
        </div>
        <div className={styles.howGrid}>
          <div className={styles.howCard}>
            <span className={styles.howStep}>1</span>
            <h3 className={styles.howCardTitle}>Ingest</h3>
            <p className={styles.howCardBody}>We pull odds, trends, rankings, and performance data from across college basketball in real time.</p>
          </div>
          <div className={styles.howCard}>
            <span className={styles.howStep}>2</span>
            <h3 className={styles.howCardTitle}>Analyze</h3>
            <p className={styles.howCardBody}>Our AI models generate picks, matchup edges, and market signals for every major game.</p>
          </div>
          <div className={styles.howCard}>
            <span className={styles.howStep}>3</span>
            <h3 className={styles.howCardTitle}>Deliver</h3>
            <p className={styles.howCardBody}>You get clear, actionable intelligence — ATS picks, team intel, and bracket insights — updated daily.</p>
          </div>
        </div>
      </section>

      {/* ── 11. Final CTA ──────────────────────────────────────────── */}
      <section className={styles.finalCta}>
        <div className={styles.finalCtaInner}>
          <h2 className={styles.finalCtaTitle}>Get Your Edge</h2>
          <p className={styles.finalCtaBody}>Track teams, follow picks, and stay ahead all season.</p>
          <Link to="/signup" className={styles.finalCtaBtn}>Create Free Account</Link>
          <span className={styles.finalCtaMicro}>Free to start. No spam.</span>
        </div>
      </section>
    </div>
  );
}
