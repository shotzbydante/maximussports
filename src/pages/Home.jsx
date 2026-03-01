import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
import { fetchChampionshipOdds } from '../api/championshipOdds';
import LiveScores from '../components/scores/LiveScores';
import StatCard from '../components/shared/StatCard';
import SourceBadge from '../components/shared/SourceBadge';
import NewsFeed from '../components/dashboard/NewsFeed';
import PinnedTeamsSection from '../components/home/PinnedTeamsSection';
import PinnedErrorBoundary from '../components/home/PinnedErrorBoundary';
import RankingsTable from '../components/insights/RankingsTable';
import DynamicAlerts from '../components/home/DynamicAlerts';
import DynamicStats from '../components/home/DynamicStats';
import ATSLeaderboard from '../components/home/ATSLeaderboard';
import FormattedSummary from '../components/shared/FormattedSummary';
import { computeAtsFromScheduleAndHistory } from '../components/team/MaximusInsight';
import { getPinnedCache, setPinnedCache, hasFreshPinnedCache } from '../utils/pinnedCache';
import styles from './Home.module.css';

const SCORES_REFRESH_MS = 60_000;
const TIER_VALUE = { Lock: 0, 'Should be in': 1, 'Work to do': 2, 'Long shot': 3 };

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
 * Odds Insights teaser card.
 * Reads a compact Market Briefing excerpt from localStorage (written by Insights.jsx
 * whenever that page successfully loads) — zero new API calls.
 * Falls back to a premium placeholder when no cached data is present or it is stale.
 * Shows "Updated Xm ago" microtext; updates the label every 60 s via setInterval.
 */
function OddsInsightsTeaser() {
  const [briefingData, setBriefingData] = useState(null);
  const [showExtra, setShowExtra] = useState(false);
  const [relTimeStr, setRelTimeStr] = useState('');

  // Read cache once on mount
  useEffect(() => {
    const data = loadBriefingCache();
    setBriefingData(data);
    if (data) setRelTimeStr(relativeTime(data.updatedAt));
  }, []);

  // Refresh relative-time label every 60 s; clear on unmount
  useEffect(() => {
    if (!briefingData) return;
    const id = setInterval(
      () => setRelTimeStr(relativeTime(briefingData.updatedAt)),
      60_000
    );
    return () => clearInterval(id);
  }, [briefingData]);

  const bullets = briefingData?.bullets ?? [];
  // Default: 1 bullet visible; "More" reveals the 2nd (max 2 total)
  const visibleBullets = showExtra ? bullets.slice(0, 2) : bullets.slice(0, 1);
  const hasMoreBullets = bullets.length > 1;

  const categories = [
    { label: 'High-Interest Matchups', desc: 'Most active betting markets right now' },
    { label: 'Underdog Watch', desc: 'Dogs covering +8 or more this week' },
    { label: 'Totals Insights', desc: 'Over/under trends and sharp money signals' },
  ];

  return (
    <div className={styles.oddsTeaser}>
      <div className={styles.oddsTeaserHeader}>
        <h3 className={styles.oddsTeaserTitle}>Odds Insights</h3>
        <span className={styles.oddsTeaserTag}>Market Intelligence</span>
      </div>

      {/* Market Briefing excerpt — live when cached, premium placeholder otherwise */}
      <div className={styles.oddsBriefingBlock}>
        <div className={styles.oddsBriefingLabelRow}>
          <span className={styles.oddsBriefingLabel}>Today's Market Briefing</span>
          {relTimeStr && (
            <span className={styles.oddsBriefingTime}>Updated {relTimeStr}</span>
          )}
        </div>
        {briefingData ? (
          <>
            <p className={styles.oddsBriefingSummary}>
              {renderBriefingText(briefingData.summary)}
            </p>
            {visibleBullets.length > 0 && (
              <ul className={styles.oddsBriefingBullets}>
                {visibleBullets.map((b, i) => (
                  <li key={i} className={styles.oddsBriefingBullet}>
                    {renderBriefingText(b.replace(/^•\s*/, ''))}
                  </li>
                ))}
              </ul>
            )}
            {hasMoreBullets && (
              <button
                type="button"
                className={styles.oddsBriefingToggle}
                onClick={() => setShowExtra((v) => !v)}
              >
                {showExtra ? 'Less' : 'More'}
              </button>
            )}
          </>
        ) : (
          <p className={styles.oddsBriefingPlaceholder}>
            Open Odds Insights for today's market briefing, line movement, and upset alerts.
          </p>
        )}
      </div>

      <div className={styles.oddsTeaserGrid}>
        {categories.map((item) => (
          <div key={item.label} className={styles.oddsTeaserItem}>
            <span className={styles.oddsTeaserItemLabel}>{item.label}</span>
            <span className={styles.oddsTeaserItemDesc}>{item.desc}</span>
          </div>
        ))}
      </div>

      <Link to="/insights" className={styles.oddsTeaserCta}>
        Open Odds Insights →
      </Link>
    </div>
  );
}

export default function Home() {
  const [newsData, setNewsData] = useState({ teamNews: [], newsFeed: mockNewsFeed, pinnedTeamNewsMap: {} });
  const [scores, setScores] = useState({ games: [], loading: true, error: null });
  const [slowLoading, setSlowLoading] = useState(true);
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
  const [showDataStatus, setShowDataStatus] = useState(false);
  const [dataStatus, setDataStatus] = useState(null);
  const [pinnedTeamDataBySlug, setPinnedTeamDataBySlug] = useState({});
  const [headlinesWarming, setHeadlinesWarming] = useState(false);
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
  // ATS Leaders: collapsed by default on mobile; persisted in localStorage.
  const [isAtsCollapsed, setIsAtsCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('homeAtsCollapsed');
      return v === null ? true : v === '1';
    } catch { return true; }
  });
  // Bubble Watch: collapsed by default on mobile; persisted in localStorage.
  const [isBubbleCollapsed, setIsBubbleCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('homeBubbleCollapsed');
      return v === null ? true : v === '1';
    } catch { return true; }
  });
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
    if (import.meta.env?.DEV) console.log('[Home ATS] fetchHomeFast start', Date.now());
    if (!hasAtsData(atsLeadersRef.current)) maybeWarmAts();
    setScores((s) => ({ ...s, loading: true }));
    setSlowLoading(true);
    // Snapshot the latest slugs at call time so stale closures cannot diverge.
    const currentPinnedSlugs = pinnedSlugsRef.current;
    fetchHomeFast({ pinnedSlugs: currentPinnedSlugs, atsWindow })
      .then((fastData) => {
        if (import.meta.env?.DEV) console.log('[Home ATS] fetchHomeFast end', Date.now());
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
            const scheduleBatch = typeof requestIdleCallback !== 'undefined'
              ? (cb) => requestIdleCallback(cb, { timeout: 500 })
              : (cb) => setTimeout(cb, 100);
            scheduleBatch(() => {
              fetchTeamBatch(uncachedSlugs)
                .then(({ teams }) => {
                  const t = teams || {};
                  Object.entries(t).forEach(([slug, data]) => setPinnedCache(slug, data));
                  setPinnedTeamDataBySlug((prev) => ({ ...prev, ...t }));
                })
                .catch(() => {});
            });
          }
        }

        runChampionshipFetch();

        fetchHomeSlow({ pinnedSlugs: currentPinnedSlugs })
          .then((slowData) => {
            setSlowLoading(false);
            const merged = mergeHomeData(fastData, slowData);
            const scoresArray = merged.scores ?? [];
            const oddsData = merged.odds ?? {};
            const oddsGames = oddsData.games ?? [];
            const mergedGames = mergeGamesWithOdds(Array.isArray(scoresArray) ? scoresArray : [], oddsGames, getTeamSlug);
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

  // Fetch LLM-enhanced summary in background; replace local summary once available.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/chat/homeSummary')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.summary) setLlmSummary(d.summary);
      })
      .catch(() => {});
    return () => { cancelled = true; };
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

  const handleToggleDataStatus = () => {
    setShowDataStatus((prev) => !prev);
  };

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
    const bubbleWatchSlice = (top25 || []).slice(10, 15);
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
      bubbleWatchSlice,
      rankedInAction: countRankedInAction(scores.games || [], rankMap),
      upsetCount: countUpsets(scores.games || []),
    };
  }, [top25, scores.games, rankMap, newsData.newsFeed, atsLeaders, atsMeta, atsWindow, championshipOdds, pinnedTeamDataBySlug]);
  const summaryText = useMemo(() => {
    if (!hasMinimalData) return '';
    return generateChatSummary('home', summaryData);
  }, [hasMinimalData, summaryData, summaryRefreshTick]);

  const handleRefreshSummary = () => {
    setSummaryRefreshTick((t) => t + 1);
    // Also kick an LLM regeneration and update when it returns.
    if (!llmSummaryRefreshing) {
      setLlmSummaryRefreshing(true);
      fetch('/api/chat/homeSummary?force=1')
        .then((r) => r.json())
        .then((d) => {
          setLlmSummaryRefreshing(false);
          if (d?.summary) setLlmSummary(d.summary);
        })
        .catch(() => { setLlmSummaryRefreshing(false); });
    }
  };

  const handleToggleBanner = useCallback(() => {
    setIsBannerCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('homeInsightCollapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  const handleToggleAts = useCallback(() => {
    setIsAtsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('homeAtsCollapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  const handleToggleBubble = useCallback(() => {
    setIsBubbleCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('homeBubbleCollapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

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
    { label: 'Upset Alerts Today', value: upsetCount, trend: upsetCount > 0 ? 'up' : 'neutral', subtext: 'ESPN scores + tiers', source: 'ESPN' },
    { label: 'Ranked Teams in Action', value: rankedInAction, trend: 'neutral', subtext: 'Top 25 playing today', source: 'ESPN' },
    { label: 'News Velocity', value: newsVelocity, trend: newsVelocity > 0 ? 'up' : 'neutral', subtext: 'Headlines (pinned teams)', source: newsSource },
  ];

  return (
    <div className={styles.home}>
      <div className={styles.banner}>
        <img src="/mascot.png" alt="" className={styles.bannerMascot} aria-hidden />
        <div className={styles.bannerContent}>
          {/* Mobile-only context sublabel — hidden on desktop via CSS */}
          <p className={styles.insightSublabel} aria-hidden>
            Today&apos;s briefing
            <span className={styles.insightSublabelMeta}>· Updated</span>
          </p>

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
            <span>{isBannerCollapsed ? 'Expand briefing' : 'Show less'}</span>
            <span
              className={`${styles.insightToggleChevron} ${!isBannerCollapsed ? styles.insightToggleChevronOpen : ''}`}
              aria-hidden
            >›</span>
          </button>
          <div className={styles.summaryActions}>
            <button
              type="button"
              className={styles.summaryRefresh}
              onClick={handleRefreshSummary}
              disabled={llmSummaryRefreshing}
              aria-label="Refresh summary"
            >
              {llmSummaryRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <label className={styles.dataStatusToggle}>
              <input
                type="checkbox"
                checked={showDataStatus}
                onChange={handleToggleDataStatus}
                aria-label="Show data status"
              />
              <span>Show data status</span>
            </label>
          </div>
          {showDataStatus && (
            <div className={styles.dataStatusBadges} role="status" aria-live="polite">
              <span className={styles[`badge${getESPNStatus().charAt(0).toUpperCase() + getESPNStatus().slice(1)}`]}>
                ESPN {statusLabel(getESPNStatus())}
              </span>
              <span className={styles[`badge${getOddsStatus().charAt(0).toUpperCase() + getOddsStatus().slice(1)}`]}>
                Odds {statusLabel(getOddsStatus())}
              </span>
              <span className={styles[`badge${getAtsStatus().charAt(0).toUpperCase() + getAtsStatus().slice(1)}`]}>
                ATS {statusLabel(getAtsStatus())}
              </span>
              <span className={styles[`badge${getNewsStatus().charAt(0).toUpperCase() + getNewsStatus().slice(1)}`]}>
                News {statusLabel(getNewsStatus())}
              </span>
              {atsMeta && (
                <div className={styles.dataStatusAtsMeta}>
                  ATS: source={atsMeta.source ?? '—'} cacheAgeSec={atsMeta.cacheAgeSec ?? '—'} generatedAt={atsMeta.generatedAt ? new Date(atsMeta.generatedAt).toLocaleTimeString() : '—'} confidence={atsMeta.confidence ?? '—'} reason={atsMeta.reason ?? '—'}
                  {atsMeta.refreshEndpoint && ` · refresh: ${atsMeta.refreshEndpoint}`}
                </div>
              )}
              {championshipOddsMeta && (championshipOddsMeta.missingTeamSlugsSample?.length > 0 || championshipOddsMeta.unmappedOutcomesSample?.length > 0) && (
                <details className={styles.dataStatusChampionshipDetails}>
                  <summary>Championship odds mapping (dev)</summary>
                  {championshipOddsMeta.missingTeamSlugsSample?.length > 0 && (
                    <div>Missing slugs sample: {championshipOddsMeta.missingTeamSlugsSample.slice(0, 10).join(', ')}{championshipOddsMeta.missingTeamSlugsSample.length > 10 ? '…' : ''}</div>
                  )}
                  {championshipOddsMeta.unmappedOutcomesSample?.length > 0 && (
                    <div>Unmapped outcomes sample: {championshipOddsMeta.unmappedOutcomesSample.slice(0, 10).join(', ')}{championshipOddsMeta.unmappedOutcomesSample.length > 10 ? '…' : ''}</div>
                  )}
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      <PinnedErrorBoundary>
        <PinnedTeamsSection
          onPinnedChange={setPinned}
          rankMap={rankMap}
          games={scores.games}
          teamNewsBySlug={newsData.pinnedTeamNewsMap}
          pinnedTeamDataBySlug={pinnedTeamDataBySlug}
        />
      </PinnedErrorBoundary>

      {/* ── Odds Insights teaser — immediately below Pinned Teams ─── */}
      <OddsInsightsTeaser />

      <section className={styles.atsSection} aria-busy={scores.loading}>
        <div
          id="home-ats-body"
          className={`${styles.sectionBody} ${isAtsCollapsed ? styles.sectionBodyAtsCollapsed : ''}`}
        >
          <ATSLeaderboard
            atsLeaders={atsLeaders}
            atsMeta={atsMeta}
            loading={atsLoading}
            atsWindow={atsWindow}
            seasonWarming={seasonWarming}
            onPeriodChange={atsOnPeriodChange}
            onRetry={atsOnRetry}
          />
        </div>
        <button
          type="button"
          className={`${styles.sectionToggle}${isAtsCollapsed ? ` ${styles.sectionToggleFooter}` : ''}`}
          onClick={handleToggleAts}
          aria-expanded={!isAtsCollapsed}
          aria-controls="home-ats-body"
        >
          <span>{isAtsCollapsed ? 'Show full standings' : 'Collapse'}</span>
          <span
            className={`${styles.insightToggleChevron} ${!isAtsCollapsed ? styles.insightToggleChevronOpen : ''}`}
            aria-hidden
          >›</span>
        </button>
      </section>

      {/* ── Dashboard Intelligence Grid ─────────────────────────────────
           Left: snapshot stats + today's scores + upset alerts
           Right: intel feed teaser (capped) + pinned team news
           2-col on desktop, single col on mobile              */}
      <div className={styles.dashboardGrid}>
        <div className={styles.dashboardLeft}>
          <div className={styles.moduleSnapshot}>
            <DynamicStats stats={dynamicStats} />
          </div>
          <div className={styles.moduleScores}>
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
          </div>
          <div className={styles.moduleAlerts}>
            <DynamicAlerts games={scores.games} oddsHistory={oddsHistory.games} />
          </div>
        </div>

        <aside className={styles.dashboardRight}>
          <div id="news">
            <NewsFeed
              items={(newsData.newsFeed || []).slice(0, 8)}
              source={newsSource}
              loading={headlinesWarming && (newsData.newsFeed || []).length === 0}
            />
            {(newsData.newsFeed || []).length > 0 && (
              <Link to="/news" className={styles.intelFeedCtaLink}>
                View full Intel Feed →
              </Link>
            )}
          </div>
          {newsData.teamNews.length > 0 && (
            <div className={styles.teamNewsWidget} id="news-teams">
              <div className={styles.teamNewsWidgetHeader}>
                <span className={styles.widgetTitle}>Pinned Team News</span>
                <SourceBadge source={newsSource} />
              </div>
              <div className={styles.teamNewsList}>
                {newsData.teamNews.map((t) => (
                  <Link key={t.slug} to={`/teams/${t.slug}`} className={styles.teamNewsItem}>
                    {t.team} — {t.headlines} headlines
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* OddsInsightsTeaser moved above ATS — see placement after PinnedTeamsSection */}

      {/* ── Bubble Watch: Deep Dive — full rankings, collapsible ────── */}
      <section className={styles.bubbleWatchSection} aria-label="Bubble Watch">
        <div
          id="home-bubble-body"
          className={`${styles.sectionBody} ${isBubbleCollapsed ? styles.sectionBodyBubbleCollapsed : ''}`}
        >
          <RankingsTable
            title="Bubble Watch — Full Rankings"
            badge="Deep Dive"
            collapsible
            capRows={25}
            defaultSortBy="top25"
            rankings={top25}
            championshipOdds={championshipOdds}
            championshipOddsMeta={championshipOddsMeta}
            championshipOddsLoading={championshipOddsLoading}
          />
        </div>
        <button
          type="button"
          className={`${styles.sectionToggle}${isBubbleCollapsed ? ` ${styles.sectionToggleFooter}` : ''}`}
          onClick={handleToggleBubble}
          aria-expanded={!isBubbleCollapsed}
          aria-controls="home-bubble-body"
        >
          <span>{isBubbleCollapsed ? 'Show full rankings' : 'Collapse'}</span>
          <span
            className={`${styles.insightToggleChevron} ${!isBubbleCollapsed ? styles.insightToggleChevronOpen : ''}`}
            aria-hidden
          >›</span>
        </button>
      </section>
    </div>
  );
}
