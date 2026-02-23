import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { newsFeed as mockNewsFeed } from '../data/mockData';
import { fetchAggregatedNews, fetchAggregateNews } from '../api/news';
import { fetchScores } from '../api/scores';
import { fetchOdds, mergeGamesWithOdds } from '../api/odds';
import { fetchRankings } from '../api/rankings';
import { getPinnedTeams } from '../utils/pinnedTeams';
import { getOddsTier } from '../utils/teamSlug';
import { getTeamSlug } from '../utils/teamSlug';
import { buildSlugToRankMap } from '../utils/rankingsNormalize';
import { TEAMS } from '../data/teams';
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

export default function Home() {
  const [newsData, setNewsData] = useState({ teamNews: [], newsFeed: mockNewsFeed });
  const [scores, setScores] = useState({ games: [], loading: true, error: null });
  const [rankMap, setRankMap] = useState({});
  const [newsSource, setNewsSource] = useState('Mock');
  const [pinned, setPinned] = useState(() => getPinnedTeams());
  const pinnedSlugs = pinned.length > 0 ? pinned : ['duke-blue-devils', 'houston-cougars', 'purdue-boilermakers', 'kansas-jayhawks'];

  useEffect(() => {
    fetchAggregatedNews(pinnedSlugs)
      .then(({ teamNews }) => setNewsData((prev) => ({ ...prev, teamNews })))
      .catch(() => setNewsData((prev) => ({ ...prev, teamNews: [] })));
  }, [pinnedSlugs.join(',')]);

  useEffect(() => {
    fetchAggregateNews({ includeNational: true })
      .then(({ items }) => {
        const newsFeed = items.map((item, i) => ({
          id: item.link || `agg-${i}`,
          title: item.title,
          source: item.source || 'News',
          time: formatRelativeTime(item.pubDate),
          link: item.link,
          excerpt: '',
          sentiment: 'neutral',
        }));
        setNewsData((prev) => ({ ...prev, newsFeed }));
        setNewsSource('Multiple');
      })
      .catch(() => {
        setNewsData((prev) => ({ ...prev, newsFeed: mockNewsFeed }));
        setNewsSource('Mock');
      });
  }, []);

  useEffect(() => {
    fetchRankings()
      .then((data) => setRankMap(buildSlugToRankMap(data, TEAMS)))
      .catch(() => setRankMap({}));
  }, []);

  const loadScores = useCallback(() => {
    setScores((s) => ({ ...s, loading: true, oddsError: null, oddsMessage: null }));
    Promise.all([
      fetchScores(),
      fetchOdds().catch(() => ({ games: [], error: 'fetch_failed' })),
    ])
      .then(([games, oddsRes]) => {
        const oddsGames = oddsRes?.games ?? [];
        const merged = mergeGamesWithOdds(games, oddsGames, getTeamSlug);
        let oddsMessage = null;
        if (oddsRes?.error === 'missing_key') {
          oddsMessage = 'Odds API key missing in production.';
        } else if (oddsRes?.hasOddsKey === true && oddsGames.length === 0) {
          oddsMessage = games.length > 0 ? 'Odds API returned no games.' : 'No odds currently available.';
        }
        setScores({ games: merged, loading: false, error: null, oddsError: oddsRes?.error, oddsMessage });
      })
      .catch((err) => setScores({ games: [], loading: false, error: err.message, oddsError: null, oddsMessage: null }));
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  useEffect(() => {
    const id = setInterval(loadScores, SCORES_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadScores]);

  const upsetCount = countUpsets(scores.games);
  const rankedInAction = countRankedInAction(scores.games, rankMap);
  const newsVelocity = newsData.teamNews.reduce((sum, t) => sum + (t.headlines || 0), 0);

  const dynamicStats = [
    { label: 'Upset Alerts Today', value: upsetCount, trend: upsetCount > 0 ? 'up' : 'neutral', subtext: 'ESPN scores + tiers', source: 'ESPN' },
    { label: 'Ranked Teams in Action', value: rankedInAction, trend: 'neutral', subtext: 'Top 25 playing today', source: 'ESPN' },
    { label: 'News Velocity', value: newsVelocity, trend: newsVelocity > 0 ? 'up' : 'neutral', subtext: 'Headlines (pinned teams)', source: newsSource },
  ];

  return (
    <div className={styles.home}>
      <div className={styles.banner}>
        <p className={styles.bannerText}>
          Welcome to Maximus Sports, your one stop shop for Men&apos;s College Basketball team news, bubble watch, odds analysis, and more.
        </p>
      </div>

      <PinnedTeamsSection onPinnedChange={setPinned} />

      <Top25Rankings />

      <DynamicAlerts />

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

      <section className={styles.atsSection}>
        <ATSLeaderboard />
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
