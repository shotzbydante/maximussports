import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { fetchTeamPage } from '../../api/team';
import TeamLogo from '../shared/TeamLogo';
import TeamSchedule from './TeamSchedule';
import MaximusInsight, { computeAtsFromScheduleAndHistory } from './MaximusInsight';
import TeamSummaryBox from './TeamSummaryBox';
import SourceBadge from '../shared/SourceBadge';
import ChampionshipBadge from '../shared/ChampionshipBadge';
import { fetchChampionshipOdds } from '../../api/championshipOdds';
import { fetchTeamNextLine } from '../../api/teamNextLine';
import { ModuleShell } from '../shared/ModuleShell';
import YouTubeVideoRail from '../shared/YouTubeVideoRail';
import YouTubeVideoModal from '../shared/YouTubeVideoModal';
import { getCachedVideos, setCachedVideos, getCached, setCached, getCacheAge } from '../../utils/ytClientCache';
import styles from './TeamPage.module.css';

const ytDebug = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('debugYT');

const NEXT_LINE_SLOW_MS  = 18000;
const TEAM_PAGE_TTL_MS   = 5 * 60 * 1000; // 5-minute client cache for batch data
const TEAM_PAGE_STALE_MS = 60 * 1000;     // silent background revalidation after 60 s

function formatDate(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return str;
  }
}
function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}
function formatSpread(n) {
  if (n == null || typeof n !== 'number') return '—';
  return n > 0 ? `+${n}` : String(n);
}
function formatMoneyline(n) {
  if (n == null || typeof n !== 'number') return '—';
  return n > 0 ? `+${n}` : String(n);
}

const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

export default function TeamPage() {
  const { slug } = useParams();
  const team = getTeamBySlug(slug);
  const [batch, setBatch] = useState(null);
  const [headlines, setHeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prev90Expanded, setPrev90Expanded] = useState(false);
  const [championshipOdds, setChampionshipOdds] = useState({});
  const [championshipOddsMeta, setChampionshipOddsMeta] = useState(null);
  const [championshipOddsLoading, setChampionshipOddsLoading] = useState(true);
  const [nextLine, setNextLine] = useState({ nextEvent: null, consensus: {}, outliers: {}, movement: null, contributingBooks: {}, oddsMeta: {} });
  const [nextLineLoading, setNextLineLoading] = useState(true);
  const [nextLineLoadStarted, setNextLineLoadStarted] = useState(null);

  // Videos
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null);

  // Batch load: schedule + odds history + team news + rank.
  // Strategy: render cache instantly, then do a silent background refresh if the
  // entry is older than TEAM_PAGE_STALE_MS (60 s) — even if still within the 5 min TTL.
  useEffect(() => {
    if (!team || !slug) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    function applyData(data) {
      const news = (data.teamNews || []).map((item, i) => ({
        id: item.link || item.id || `news-${i}`,
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        source: item.source || 'News',
      }));
      const cacheKey = `teamPage:${slug}`;
      setCached(cacheKey, { batch: data, headlines: news }, TEAM_PAGE_TTL_MS);
      if (!cancelled) {
        setBatch(data);
        setHeadlines(news);
      }
    }

    const cacheKey = `teamPage:${slug}`;
    const cached   = getCached(cacheKey);
    const age      = getCacheAge(cacheKey);

    if (cached) {
      // Paint immediately from cache — no spinner
      setBatch(cached.batch);
      setHeadlines(cached.headlines);
      setLoading(false);

      // Silent background revalidation when data is stale
      if (age > TEAM_PAGE_STALE_MS) {
        fetchTeamPage(slug)
          .then(applyData)
          .catch(() => {}); // silent — we already have cached data shown
      }
      return () => { cancelled = true; };
    }

    // No cache — full load with spinner
    setLoading(true);
    setError(null);
    fetchTeamPage(slug)
      .then((data) => {
        applyData(data);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [slug, team]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setChampionshipOddsLoading(true);
    fetchChampionshipOdds()
      .then(({ odds, oddsMeta }) => {
        if (!cancelled) {
          setChampionshipOdds(odds ?? {});
          setChampionshipOddsMeta(oddsMeta ?? null);
          setChampionshipOddsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChampionshipOdds({});
          setChampionshipOddsMeta(null);
          setChampionshipOddsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setNextLineLoading(true);
    setNextLineLoadStarted(Date.now());
    let cancelled = false;
    fetchTeamNextLine(slug)
      .then((data) => {
        if (!cancelled) {
          setNextLine(data);
          setNextLineLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNextLine({ nextEvent: null, consensus: {}, outliers: {}, movement: null, contributingBooks: {}, oddsMeta: { stage: 'error' } });
          setNextLineLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;

    // Serve from in-memory cache if fresh (avoids flicker on back-navigation)
    const cached = getCachedVideos(slug);
    if (cached) {
      if (ytDebug) console.log(`[YT Team] cache HIT for ${slug} (${cached.length} items)`);
      setVideos(cached);
      setVideosLoading(false);
      return;
    }

    const controller = new AbortController();
    const qs = new URLSearchParams({ teamSlug: slug, maxResults: '6' });
    if (ytDebug) qs.set('debugYT', '1');
    const t0 = ytDebug ? Date.now() : 0;

    fetch(`/api/youtube/team?${qs}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const items = data.items ?? [];
        setCachedVideos(slug, items);
        if (ytDebug) console.log(`[YT Team] cache MISS for ${slug}, fetched in ${Date.now() - t0}ms (${items.length} items)`);
        setVideos(items);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setVideos([]);
      })
      .finally(() => {
        setVideosLoading(false);
      });

    return () => controller.abort();
  }, [slug]);

  const rank = batch?.rank ?? null;
  const nextLineSlow = nextLineLoadStarted != null && nextLineLoading && (Date.now() - nextLineLoadStarted > NEXT_LINE_SLOW_MS);
  const nextLineShowRetry = nextLine.oddsMeta?.stage === 'error' || nextLineSlow;

  const { scheduleForSummary, atsForSummary } = useMemo(() => {
    const events = batch?.schedule?.events ?? [];
    const upcoming = events.filter((e) => !e.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date));
    const recent = events.filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
    const ats = batch?.schedule && batch?.oddsHistory && team
      ? computeAtsFromScheduleAndHistory(batch.schedule, batch.oddsHistory, team.name)
      : null;
    return {
      scheduleForSummary: { upcoming, recent },
      atsForSummary: ats,
    };
  }, [batch?.schedule, batch?.oddsHistory, team]);

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const last7 = headlines.filter((h) => new Date(h.pubDate || 0).getTime() >= sevenDaysAgo);
  const prev90 = headlines.filter((h) => new Date(h.pubDate || 0).getTime() < sevenDaysAgo);

  if (!team) {
    return (
      <div className={styles.page}>
        <h1>Team Not Found</h1>
        <p>That team doesn&apos;t exist.</p>
        <Link to="/teams">← Teams</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/teams" className={styles.backLink}>← Teams</Link>
        <div className={styles.headerRow}>
          <TeamLogo team={team} size={36} />
          <div className={styles.headerInfo}>
            <h1>{team.name}</h1>
            <div className={styles.headerMeta}>
              {rank != null && <span className={styles.rank}>#{rank}</span>}
              <span className={styles.conference}>{team.conference}</span>
              <span className={`${styles.badge} ${TIER_CLASS[team.oddsTier] || ''}`}>
                {team.oddsTier}
              </span>
              <ChampionshipBadge slug={slug} oddsMap={championshipOdds} oddsMeta={championshipOddsMeta} loading={championshipOddsLoading} />
            </div>
          </div>
        </div>
      </header>

      <section className={styles.insightSection} aria-label="Maximus's Insight">
        <TeamSummaryBox
          slug={slug}
          team={team}
          schedule={scheduleForSummary}
          ats={atsForSummary}
          news={headlines}
          rank={rank}
          nextLine={nextLine}
          dataReady={!!batch}
        />
      </section>

      <section className={styles.atsSection} aria-label="ATS">
        <MaximusInsight
          slug={slug}
          initialData={batch ? { schedule: batch.schedule, oddsHistory: batch.oddsHistory } : null}
          atsOnly
        />
      </section>

      <section className={styles.nextLineSection} aria-label="Next game line">
        <div className={styles.nextLineCard}>
          <h3 className={styles.nextLineTitle}>Next Game Line</h3>
          {nextLineLoading && !nextLine.nextEvent && (
            <p className={styles.nextLineMeta}>Loading odds…</p>
          )}
          {nextLineShowRetry && (
            <div className={styles.nextLineRetryRow}>
              {nextLineSlow && <span className={styles.nextLineSlow}>Still loading…</span>}
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => {
                  setNextLineLoadStarted(Date.now());
                  setNextLineLoading(true);
                  fetchTeamNextLine(slug).then((data) => {
                    setNextLine(data);
                    setNextLineLoading(false);
                  }).catch(() => setNextLineLoading(false));
                }}
              >
                Retry
              </button>
            </div>
          )}
          {!nextLineLoading && nextLine.nextEvent && (
            <>
              <p className={styles.nextLineGame}>
                vs <strong>{nextLine.nextEvent.opponent || 'TBD'}</strong>
                {nextLine.nextEvent.commenceTime && (
                  <span className={styles.nextLineTime}> · {formatDateTime(nextLine.nextEvent.commenceTime)}</span>
                )}
              </p>
              {(() => {
                const hasConsensus = nextLine.consensus?.spread != null || nextLine.consensus?.total != null || nextLine.consensus?.moneyline != null;
                if (!hasConsensus) {
                  return <p className={styles.nextLineMeta}>Line not available yet.</p>;
                }
                return (
                  <div className={styles.nextLineConsensus}>
                    <span>Spread: {formatSpread(nextLine.consensus?.spread)}</span>
                    <span>Total: {nextLine.consensus?.total != null ? nextLine.consensus.total : '—'}</span>
                    {nextLine.consensus?.moneyline != null && (
                      <span>ML: {formatMoneyline(nextLine.consensus.moneyline)}</span>
                    )}
                  </div>
                );
              })()}
              {(nextLine.consensus?.spread != null || nextLine.consensus?.total != null || nextLine.consensus?.moneyline != null) && nextLine.outliers?.spreadBestForTeam && (
                <p className={styles.nextLineOutlier}>
                  Best spread: {nextLine.outliers.spreadBestForTeam.bookTitle} {formatSpread(nextLine.outliers.spreadBestForTeam.spread)}
                  {nextLine.consensus?.spread != null && (
                    <> (consensus {formatSpread(nextLine.consensus.spread)})</>
                  )}
                </p>
              )}
              {(nextLine.consensus?.spread != null || nextLine.consensus?.total != null || nextLine.consensus?.moneyline != null) && nextLine.outliers?.moneylineBest && (
                <p className={styles.nextLineOutlier}>
                  Best ML: {nextLine.outliers.moneylineBest.bookTitle} {formatMoneyline(nextLine.outliers.moneylineBest.moneyline)}
                </p>
              )}
              {(nextLine.consensus?.spread != null || nextLine.consensus?.total != null || nextLine.consensus?.moneyline != null) && (nextLine.outliers?.spreadOutlier || nextLine.outliers?.bestSpreadOutlier) && (!nextLine.outliers?.spreadBestForTeam || (nextLine.outliers.spreadOutlier?.bookKey || nextLine.outliers.bestSpreadOutlier?.bookKey) !== nextLine.outliers.spreadBestForTeam?.bookKey) && (
                <p className={styles.nextLineOutlier}>
                  Outlier: {(nextLine.outliers.spreadOutlier || nextLine.outliers.bestSpreadOutlier).bookTitle} {formatSpread((nextLine.outliers.spreadOutlier || nextLine.outliers.bestSpreadOutlier).spread)}
                  {nextLine.consensus?.spread != null && <> (consensus {formatSpread(nextLine.consensus.spread)})</>}
                </p>
              )}
              {(nextLine.consensus?.spread != null || nextLine.consensus?.total != null || nextLine.consensus?.moneyline != null) && nextLine.outliers?.totalOutlier && (
                <p className={styles.nextLineOutlier}>
                  Total outlier: {nextLine.outliers.totalOutlier.bookTitle} {nextLine.outliers.totalOutlier.total}
                  {nextLine.consensus?.total != null && <> (consensus {nextLine.consensus.total})</>}
                </p>
              )}
              {nextLine.movement?.samples > 0 && (nextLine.movement.spread?.delta !== 0 || nextLine.movement.total?.delta !== 0 || nextLine.movement.moneyline?.delta !== 0) && (
                <div className={styles.nextLineMovement}>
                  <span>Market movement (last {nextLine.movement.windowMinutes}m): </span>
                  {nextLine.movement.spread?.delta != null && (
                    <span>Spread {nextLine.movement.spread.delta > 0 ? '↑' : nextLine.movement.spread.delta < 0 ? '↓' : ''} {nextLine.movement.spread.delta > 0 ? '+' : ''}{nextLine.movement.spread.delta}</span>
                  )}
                  {nextLine.movement.total?.delta != null && (
                    <span>Total {nextLine.movement.total.delta > 0 ? '↑' : nextLine.movement.total.delta < 0 ? '↓' : ''} {nextLine.movement.total.delta > 0 ? '+' : ''}{nextLine.movement.total.delta}</span>
                  )}
                  <span className={styles.nextLineMovementMeta}>Based on {nextLine.movement.samples} samples</span>
                </div>
              )}
              {nextLine.oddsMeta?.updatedAt && (
                <p className={styles.nextLineMeta}>Last updated: {formatDateTime(nextLine.oddsMeta.updatedAt)}</p>
              )}
            </>
          )}
          {!nextLineLoading && !nextLine.nextEvent && nextLine.oddsMeta?.stage === 'no_upcoming' && (
            <p className={styles.nextLineMeta}>No upcoming game.</p>
          )}
        </div>
      </section>

      <section className={styles.newsSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionLabel}>{team?.name ? `${team.name} News Feed` : 'Team News Feed'}</span>
          <span className={styles.sourceLegend}>ESPN · NCAA · CBS · Yahoo · Team Feeds · Google News</span>
        </div>

        {loading && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            <span>Loading...</span>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        {!loading && !error && headlines.length === 0 && (
          <div className={styles.empty}>No men&apos;s basketball news available. Try again later.</div>
        )}

        {!loading && !error && headlines.length > 0 && (
          <>
            <div className={styles.newsSubsection}>
              <h4 className={styles.subsectionTitle}>Last 7 days</h4>
              {last7.length === 0 ? (
                <div className={styles.empty}>No men&apos;s basketball news available. Try again later.</div>
              ) : (
                <ul className={styles.list}>
                  {last7.map((h) => (
                    <li key={h.id} className={styles.row}>
                      <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                        <span className={styles.title}>{h.title}</span>
                        <span className={styles.meta}>
                          <SourceBadge source={h.source} />
                          <span className={styles.date}>{formatDate(h.pubDate)}</span>
                        </span>
                        <span className={styles.chevron}>→</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {prev90.length > 0 && (
              <div className={styles.newsSubsection}>
                <button
                  type="button"
                  className={styles.collapseHeader}
                  onClick={() => setPrev90Expanded((e) => !e)}
                  aria-expanded={prev90Expanded}
                >
                  <span className={styles.subsectionTitle}>Previous 90 days</span>
                  <span className={styles.collapseChevron} aria-hidden>{prev90Expanded ? '▾' : '▸'}</span>
                </button>
                {prev90Expanded && (
                  <ul className={styles.list}>
                    {prev90.map((h) => (
                      <li key={h.id} className={styles.row}>
                        <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                          <span className={styles.title}>{h.title}</span>
                          <span className={styles.meta}>
                            <SourceBadge source={h.source} />
                            <span className={styles.date}>{formatDate(h.pubDate)}</span>
                          </span>
                          <span className={styles.chevron}>→</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Videos ── */}
      <section className={styles.videosSection} aria-label="Video highlights">
        <ModuleShell
          title="Videos"
          loading={videosLoading}
          skeletonRows={2}
          isEmpty={!videosLoading && videos.length === 0}
          emptyMessage="No video highlights found right now."
          footer={
            team && (
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${team.name} basketball highlights`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.videosMoreLink}
              >
                More on YouTube →
              </a>
            )
          }
        >
          <YouTubeVideoRail items={videos} onSelect={setActiveVideo} />
        </ModuleShell>
      </section>

      <YouTubeVideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />

      <TeamSchedule slug={slug} initialData={batch ? { schedule: batch.schedule, oddsHistory: batch.oddsHistory, teamId: batch.teamId } : null} />
    </div>
  );
}
