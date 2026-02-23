import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { newsFeed as mockNewsFeed } from '../data/mockData';
import { fetchHome } from '../api/home';
import { mergeGamesWithOdds } from '../api/odds';
import { getPinnedTeams } from '../utils/pinnedTeams';
import { getOddsTier } from '../utils/teamSlug';
import { getTeamSlug } from '../utils/teamSlug';
import { buildSlugToRankMap } from '../utils/rankingsNormalize';
import { fetchSummaryStream as fetchSummaryStreamApi } from '../api/summary';
import { TEAMS, getTeamBySlug } from '../data/teams';
import LiveScores from '../components/scores/LiveScores';
import StatCard from '../components/shared/StatCard';
import SourceBadge from '../components/shared/SourceBadge';
import NewsFeed from '../components/dashboard/NewsFeed';
import PinnedTeamsSection from '../components/home/PinnedTeamsSection';
import Top25Rankings from '../components/home/Top25Rankings';
import DynamicAlerts from '../components/home/DynamicAlerts';
import DynamicStats from '../components/home/DynamicStats';
import ATSLeaderboard from '../components/home/ATSLeaderboard';
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
  const [rankMap, setRankMap] = useState({});
  const [top25, setTop25] = useState([]);
  const [atsLeaders, setAtsLeaders] = useState({ best: [], worst: [] });
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
  const pinnedSlugs = pinned.length > 0 ? pinned : ['duke-blue-devils', 'houston-cougars', 'purdue-boilermakers', 'kansas-jayhawks'];

  const streamBufferRef = useRef('');
  const streamIntervalRef = useRef(null);

  // Single batch: scores + odds + rankings + headlines + atsLeaders + pinnedTeamNews
  const loadHomeBatch = useCallback(() => {
    setScores((s) => ({ ...s, loading: true }));
    fetchHome({ pinnedSlugs })
      .then((data) => {
        const scoresArray = data.scores ?? [];
        const oddsData = data.odds ?? {};
        const oddsGames = oddsData.games ?? [];
        const merged = mergeGamesWithOdds(Array.isArray(scoresArray) ? scoresArray : [], oddsGames, getTeamSlug);
        let oddsMessage = null;
        if (oddsData.error === 'missing_key') {
          oddsMessage = 'Odds API key missing in production.';
        } else if (oddsData.hasOddsKey === true && oddsGames.length === 0) {
          oddsMessage = scoresArray.length > 0 ? 'Odds API returned no games.' : 'No odds currently available.';
        }
        setScores({ games: merged, loading: false, error: null, oddsError: oddsData.error, oddsMessage });
        const rankings = data.rankings?.rankings || [];
        setRankMap(buildSlugToRankMap({ rankings }, TEAMS));
        setTop25(rankings);
        setDataStatus(data.dataStatus ?? null);
        setAtsLeaders(data.atsLeaders ?? { best: [], worst: [] });
        setOddsHistory(data.oddsHistory ?? { games: [] });
        const items = data.headlines ?? [];
        const newsFeed = items.map((item, i) => ({
          id: item.link || `agg-${i}`,
          title: item.title,
          source: item.source || 'News',
          time: formatRelativeTime(item.pubDate),
          link: item.link,
          excerpt: '',
          sentiment: 'neutral',
        }));
        const pinnedTeamNewsMap = data.pinnedTeamNews && typeof data.pinnedTeamNews === 'object' ? data.pinnedTeamNews : {};
        const teamNews = Object.entries(pinnedTeamNewsMap).map(([slug, headlines]) => ({
          slug,
          team: getTeamBySlug(slug)?.name ?? slug,
          headlines: (headlines || []).length,
        }));
        setNewsData((prev) => ({ ...prev, newsFeed, teamNews, pinnedTeamNewsMap }));
        setNewsSource('Multiple');
      })
      .catch((err) => {
        setScores({ games: [], loading: false, error: err.message, oddsError: null, oddsMessage: null });
        setRankMap({});
        setTop25([]);
        setAtsLeaders({ best: [], worst: [] });
        setNewsData((prev) => ({ ...prev, newsFeed: mockNewsFeed, teamNews: [] }));
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
          setRateLimitMessage(data.rateLimitMessage || null);
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
    const upcomingGames = (scores.games || []).filter((g) => !isFinal(g.gameStatus));
    const headlines = newsData.newsFeed || [];
    return {
      scoresCount: recentGames.length,
      rankingsCount: top25.length,
      oddsCount: upcomingGames.length,
      oddsHistoryCount: 0,
      headlinesCount: headlines.length,
    };
  }, [dataStatus, scores.games, top25.length, newsData.newsFeed]);

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
    const n = dataStatusForBadges.headlinesCount ?? 0;
    if (n === 0) return 'missing';
    if (n < 3) return 'partial';
    return 'ok';
  };
  const statusLabel = (status) => (status === 'ok' ? 'OK' : status === 'partial' ? 'PARTIAL' : 'MISSING');

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
      />

      <section className={styles.atsSection} aria-busy={scores.loading}>
        <ATSLeaderboard atsLeaders={atsLeaders} />
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
            <NewsFeed items={newsData.newsFeed} source={newsSource} />
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
