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
import { fetchSummaryStream as fetchSummaryStreamApi } from '../api/summary';
import { TEAMS, getTeamBySlug } from '../data/teams';
import { getAtsLeadersCacheMaybeStale, setAtsLeadersCache } from '../utils/atsLeadersCache';
import LiveScores from '../components/scores/LiveScores';
import StatCard from '../components/shared/StatCard';
import SourceBadge from '../components/shared/SourceBadge';
import NewsFeed from '../components/dashboard/NewsFeed';
import PinnedTeamsSection from '../components/home/PinnedTeamsSection';
import Top25Rankings from '../components/home/Top25Rankings';
import DynamicAlerts from '../components/home/DynamicAlerts';
import DynamicStats from '../components/home/DynamicStats';
import ATSLeaderboard from '../components/home/ATSLeaderboard';
import { computeAtsFromScheduleAndHistory } from '../components/team/MaximusInsight';
import styles from './Home.module.css';

const STATIC_WELCOME = "Welcome to Maximus Sports, your one stop shop for Men's College Basketball team news, bubble watch, odds analysis, and more.";
const SUMMARY_ERROR = 'Summary unavailable — try again later.';

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

function formatSummaryDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const buildSummaryPayload = ({ top25, atsBest, atsWorst, recentGames, upcomingGames, headlines }) => ({
  top25: top25?.slice(0, 25) || [],
  atsLeaders: {
    best: atsBest?.slice(0, 10) || [],
    worst: atsWorst?.slice(0, 10) || [],
  },
  recentGames: (recentGames || []).slice(0, 20),
  upcomingGames: (upcomingGames || []).slice(0, 20),
  headlines: (headlines || []).slice(0, 10),
});

export default function Home() {
  const [newsData, setNewsData] = useState({ teamNews: [], newsFeed: mockNewsFeed, pinnedTeamNewsMap: {} });
  const [scores, setScores] = useState({ games: [], loading: true, error: null });
  const [slowLoading, setSlowLoading] = useState(true);
  const [rankMap, setRankMap] = useState({});
  const [top25, setTop25] = useState([]);
  const [atsLeaders, setAtsLeaders] = useState(() => {
    const c = getAtsLeadersCacheMaybeStale();
    return (c?.data?.best?.length || c?.data?.worst?.length) ? c.data : { best: [], worst: [] };
  });
  const [oddsHistory, setOddsHistory] = useState({ games: [] });
  const [newsSource, setNewsSource] = useState('Mock');
  const [pinned, setPinned] = useState(() => getPinnedTeams());
  const [summaryText, setSummaryText] = useState('');
  const [summaryStreaming, setSummaryStreaming] = useState(false);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);
  const [summaryError, setSummaryError] = useState(false);
  const [hideStaticWelcomeAfterRefresh, setHideStaticWelcomeAfterRefresh] = useState(false);
  const [showDataStatus, setShowDataStatus] = useState(false);
  const [dataStatus, setDataStatus] = useState(null);
  const [rateLimitMessage, setRateLimitMessage] = useState(null);
  const [pinnedTeamDataBySlug, setPinnedTeamDataBySlug] = useState({});
  const [summaryUpdatingBadge, setSummaryUpdatingBadge] = useState(false);
  const [atsWarming, setAtsWarming] = useState(false);
  const [headlinesWarming, setHeadlinesWarming] = useState(false);
  const pinnedSlugs = pinned.length > 0 ? pinned : ['duke-blue-devils', 'houston-cougars', 'purdue-boilermakers', 'kansas-jayhawks'];

  const streamBufferRef = useRef('');
  const streamIntervalRef = useRef(null);
  const summaryGeneratedWithoutAtsNewsRef = useRef(false);
  const didOneTimeRetryRef = useRef(false);
  const lastSummaryDataStatusRef = useRef(null);
  const fetchSummaryStreamRef = useRef(() => {});

  // Fast path first, then slow in background; merge when slow arrives.
  const loadHomeBatch = useCallback(() => {
    setScores((s) => ({ ...s, loading: true }));
    setSlowLoading(true);
    fetchHomeFast({ pinnedSlugs })
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
        setAtsLeaders(fastData.atsLeaders ?? { best: [], worst: [] });
        setAtsWarming(fastData.atsWarming ?? false);
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

        if (pinnedSlugs.length > 0) {
          const scheduleBatch = typeof requestIdleCallback !== 'undefined'
            ? (cb) => requestIdleCallback(cb, { timeout: 500 })
            : (cb) => setTimeout(cb, 100);
          scheduleBatch(() => {
            fetchTeamBatch(pinnedSlugs)
              .then(({ teams }) => setPinnedTeamDataBySlug(teams || {}))
              .catch(() => {});
          });
        }

        fetchHomeSlow({ pinnedSlugs })
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
            setAtsWarming(merged.atsWarming ?? false);
            setHeadlinesWarming(merged.headlinesWarming ?? false);
            const nextAts = merged.atsLeaders ?? { best: [], worst: [] };
            setAtsLeaders(nextAts);
            setAtsLeadersCache(nextAts);
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
            if (!didOneTimeRetryRef.current && summaryGeneratedWithoutAtsNewsRef.current) {
              const ats = merged.dataStatus?.atsLeadersCount ?? 0;
              const head = merged.dataStatus?.headlinesCount ?? 0;
              if (ats > 0 || head > 0) {
                didOneTimeRetryRef.current = true;
                setSummaryUpdatingBadge(true);
                fetchSummaryStreamRef.current?.(true);
              }
            }
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
        setAtsLeaders({ best: [], worst: [] });
        setAtsWarming(false);
        setHeadlinesWarming(false);
        setNewsData((prev) => ({ ...prev, newsFeed: mockNewsFeed, teamNews: [], pinnedTeamNewsMap: {} }));
        setNewsSource('Mock');
      });
  }, [pinnedSlugs.join(',')]);

  useEffect(() => {
    loadHomeBatch();
  }, [loadHomeBatch]);

  useEffect(() => {
    const id = setInterval(loadHomeBatch, SCORES_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadHomeBatch]);

  const STAGGER_MS = 2500;
  useEffect(() => {
    if (pinnedSlugs.length === 0) return;
    const timeouts = [];
    pinnedSlugs.slice(0, 8).forEach((slug, i) => {
      const t = setTimeout(() => {
        fetchTeamPage(slug)
          .then((data) => {
            const ats = data.schedule && data.oddsHistory && data.team
              ? computeAtsFromScheduleAndHistory(data.schedule, data.oddsHistory, data.team.name)
              : { season: null, last30: null, last7: null };
            setPinnedTeamDataBySlug((prev) => ({
              ...prev,
              [slug]: {
                team: data.team,
                schedule: data.schedule,
                oddsHistory: data.oddsHistory,
                teamNews: data.teamNews,
                rank: data.rank,
                ats,
              },
            }));
          })
          .catch(() => {});
      }, i * STAGGER_MS);
      timeouts.push(t);
    });
    return () => timeouts.forEach(clearTimeout);
  }, [pinnedSlugs.join(',')]);

  const STREAM_FLUSH_MS = 80;

  const flushStreamBuffer = useCallback(() => {
    if (streamBufferRef.current) {
      const chunk = streamBufferRef.current;
      streamBufferRef.current = '';
      setSummaryText((prev) => prev + chunk);
    }
  }, []);

  const buildPayload = useCallback(() => {
    const recentGames = (scores.games || []).filter((g) => isFinal(g.gameStatus));
    const upcomingGames = (scores.games || []).filter((g) => !isFinal(g.gameStatus));
    const headlines = (newsData.newsFeed || []).map((h) => ({ title: h.title, source: h.source }));
    return buildSummaryPayload({
      top25,
      atsBest: atsLeaders.best,
      atsWorst: atsLeaders.worst,
      recentGames,
      upcomingGames,
      headlines,
    });
  }, [scores.games, newsData.newsFeed, top25, atsLeaders.best, atsLeaders.worst]);

  const fetchSummaryStream = useCallback((force = false) => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    streamBufferRef.current = '';
    setSummaryText('');
    setSummaryError(false);
    setSummaryStreaming(true);
    setRateLimitMessage(null);

    const payload = buildPayload();
    fetchSummaryStreamApi(payload, {
      force,
      onMessage(data) {
        if (data.error) {
          if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
          }
          streamBufferRef.current = '';
          setSummaryText(data.message || SUMMARY_ERROR);
          setSummaryError(true);
          setSummaryStreaming(false);
          return;
        }
        if (data.dataStatus) {
          lastSummaryDataStatusRef.current = data.dataStatus;
          setDataStatus(data.dataStatus);
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
          setSummaryUpdatingBadge(false);
          setRateLimitMessage(data.rateLimitMessage || null);
          const status = lastSummaryDataStatusRef.current || data.dataStatus;
          const atsOk = (status?.atsLeadersCount ?? 0) > 0;
          const headlinesOk = (status?.headlinesCount ?? 0) > 0;
          if (!atsOk && !headlinesOk) {
            summaryGeneratedWithoutAtsNewsRef.current = true;
          }
        }
      },
    }).catch(() => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
      streamBufferRef.current = '';
      setSummaryText(SUMMARY_ERROR);
      setSummaryError(true);
      setSummaryStreaming(false);
    });
  }, [buildPayload, flushStreamBuffer]);

  useEffect(() => {
    fetchSummaryStreamRef.current = fetchSummaryStream;
  }, [fetchSummaryStream]);

  const hasRequestedInitialRef = useRef(false);
  useEffect(() => {
    if (hasRequestedInitialRef.current) return;
    const hasData = top25.length > 0 || (scores.games && scores.games.length > 0);
    if (!hasData) return;
    hasRequestedInitialRef.current = true;
    fetchSummaryStream(false);
  }, [top25, scores.games, fetchSummaryStream]);

  const handleRefreshSummary = () => {
    setHideStaticWelcomeAfterRefresh(true);
    fetchSummaryStream(true);
  };

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
    if (atsWarming) return 'warming';
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
          {!hideStaticWelcomeAfterRefresh && (
            <p className={styles.bannerStaticWelcome}>{STATIC_WELCOME}</p>
          )}
          {summaryStreaming && summaryText === '' && (
            <>
              <span className={styles.summaryLoadingText} aria-live="polite">Generating summary…</span>
              <div className={styles.summarySkeleton} aria-hidden>
                <div className={styles.summarySkeletonLine} />
                <div className={styles.summarySkeletonLine} />
                <div className={styles.summarySkeletonLine} />
              </div>
            </>
          )}
          {summaryText !== '' && (
            <p className={styles.bannerText}>
              {summaryText}
              {summaryStreaming && <span className={styles.cursor} aria-hidden>▌</span>}
            </p>
          )}
          {summaryUpdatedAt && !summaryStreaming && (
            <p className={styles.summaryUpdated}>
              Last updated: {formatSummaryDate(summaryUpdatedAt)}
            </p>
          )}
          {rateLimitMessage && (
            <p className={styles.rateLimitMessage}>{rateLimitMessage}</p>
          )}
          <div className={styles.summaryActions}>
            <button
              type="button"
              className={styles.summaryRefresh}
              onClick={handleRefreshSummary}
              disabled={summaryStreaming}
              aria-label="Regenerate summary"
            >
              {summaryStreaming ? 'Generating…' : 'Refresh'}
            </button>
            {summaryUpdatingBadge && (
              <span className={styles.summaryUpdatingBadge} aria-live="polite">
                Updating summary…
              </span>
            )}
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
            </div>
          )}
        </div>
      </div>

      <PinnedTeamsSection
        onPinnedChange={setPinned}
        rankMap={rankMap}
        games={scores.games}
        teamNewsBySlug={newsData.pinnedTeamNewsMap}
        pinnedTeamDataBySlug={pinnedTeamDataBySlug}
      />

      <section className={styles.atsSection} aria-busy={scores.loading}>
        <ATSLeaderboard atsLeaders={atsLeaders} slowLoading={slowLoading} atsWarming={atsWarming} />
      </section>

      <Top25Rankings rankings={top25} />

      <DynamicAlerts games={scores.games} oddsHistory={oddsHistory.games} />

      <DynamicStats stats={dynamicStats} />

      <section className={styles.liveScoresSection}>
        <LiveScores
          games={scores.games}
          loading={scores.loading}
          error={scores.error}
          oddsMessage={scores.oddsMessage}
          compact
        />
      </section>

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          {/* reserved for future content */}
        </div>
        <aside className={styles.sidebar}>
          <div className={styles.widgetSection} id="news">
            <NewsFeed items={newsData.newsFeed} source={newsSource} loading={headlinesWarming && (newsData.newsFeed || []).length === 0} />
          </div>
          {newsData.teamNews.length > 0 && (
            <div className={styles.widgetSection} id="news-teams">
              <div className={styles.widgetHeader}>
                <h3 className={styles.widgetTitle}>Pinned Team News</h3>
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
    </div>
  );
}
