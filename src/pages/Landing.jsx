/**
 * Landing — Root homepage for maximussports.ai
 *
 * Premium, cinematic front door. Routes users into MLB or NCAAM.
 * Features live news/video previews from News Feed API.
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { WORKSPACES, WorkspaceId, SeasonState } from '../workspaces/config';
import { fetchMlbHeadlines } from '../api/mlbNews';
import { getFlag, setFlag } from '../utils/localFlags';
import { trackAccountCreateSkipped } from '../lib/analytics/posthog';
import styles from './Landing.module.css';

const WelcomeModal = lazy(() => import('../components/marketing/WelcomeModal'));

const META = {
  title: 'Maximus Sports — AI-Powered Sports Intelligence',
  description: 'Maximus Sports is an AI-powered sports intelligence platform for MLB and college basketball. Team intel, odds insights, picks, season outlooks, and premium editorial briefings.',
  url: 'https://maximussports.ai',
  image: 'https://maximussports.ai/og.png',
};

const VALUE_PROPS = [
  { icon: '📊', label: 'Daily Intel Briefings' },
  { icon: '🏟️', label: 'Team Intelligence' },
  { icon: '📈', label: 'Odds + Picks' },
  { icon: '🔮', label: 'Season Outlooks' },
  { icon: '⚡', label: 'Data-Driven Edge' },
];

const MLB_MODULES = [
  { title: 'Daily Briefing', desc: 'AI-powered daily read on games, edges, and market movement.', to: '/mlb' },
  { title: 'Team Intel', desc: 'Deep team breakdowns, trends, and matchup context.', to: '/mlb/teams' },
  { title: "Maximus's Picks", desc: 'Model-driven picks across moneyline, ATS, and totals.', to: '/mlb/insights' },
  { title: 'Season Intelligence', desc: 'Projected wins, playoff odds, and market inefficiencies.', to: '/mlb/season-model' },
];

const NBA_MODULES = [
  { title: 'Daily Briefing', desc: 'AI-powered playoff briefings covering series, injuries, and market edges.', to: '/nba' },
  { title: 'Team Intel', desc: 'Playoff seeds, records, championship odds, and team outlooks.', to: '/nba/teams' },
  { title: "Maximus's Picks", desc: 'Model-driven picks across moneyline, spread, and totals.', to: '/nba/insights' },
  { title: 'Bracketology', desc: 'Interactive playoff bracket with series simulation and title probabilities.', to: '/nba/bracketology' },
];

const NCAAM_MODULES = [
  { title: 'Tournament Recap', desc: 'Full March Madness breakdown, results, and key storylines.', to: '/ncaam' },
  { title: 'Team Intel', desc: 'Season records, conference performance, and roster depth.', to: '/ncaam/teams' },
  { title: 'Bracketology', desc: 'Model-driven projections and matchup probabilities.', to: '/bracketology' },
  { title: 'Odds Insights', desc: 'Historical picks performance and ATS cover analytics.', to: '/ncaam/insights' },
];

/** Clean video/headline titles — remove noisy suffixes, duplicated sources, separators */
function cleanTitle(raw) {
  if (!raw) return '';
  let t = raw;
  // Remove trailing " - Source Name" or " | Source Name"
  t = t.replace(/\s*[|\u2013\u2014–—]\s*(?:Yahoo Sports|ESPN|MLB\.com|CBS Sports|Fox Sports|The Athletic|AP News|Bleacher Report)\s*$/i, '');
  // Remove trailing " // highlights" or " | MLB Highlights"
  t = t.replace(/\s*[|/]{1,2}\s*(?:MLB\s+)?Highlights?\s*$/i, '');
  // Remove trailing " - YouTube"
  t = t.replace(/\s*-\s*YouTube\s*$/i, '');
  // Trim excess whitespace
  return t.trim();
}

function formatTimeAgo(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffH = Math.floor((now - d) / (1000 * 60 * 60));
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  } catch { return ''; }
}

export default function Landing() {
  const ncaam = WORKSPACES[WorkspaceId.CBB];
  const ncaamComplete = ncaam.seasonState === SeasonState.COMPLETED;
  const ch = ncaam.championship;

  const navigate = useNavigate();
  const [mlbNews, setMlbNews] = useState([]);
  const [mlbVideos, setMlbVideos] = useState([]);

  // ── Welcome modal: same trigger logic as NCAAM Home ──
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('welcome') === '1') return true;
      return !getFlag('mx_welcome_seen_v1');
    } catch { return false; }
  });

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

  useEffect(() => {
    fetchMlbHeadlines()
      .then(d => setMlbNews((d.headlines || []).slice(0, 6)))
      .catch(() => {});
    // Fetch curated MLB videos
    fetch('/api/mlb/youtube/intelFeed?maxResults=6')
      .then(r => r.json())
      .then(d => setMlbVideos((d.items || []).slice(0, 4)))
      .catch(() => {});
  }, []);

  return (
    <>
      <Helmet>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <link rel="canonical" href={META.url} />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:url" content={META.url} />
        <meta property="og:image" content={META.image} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Maximus Sports" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={META.title} />
        <meta name="twitter:description" content={META.description} />
        <meta name="twitter:image" content={META.image} />
      </Helmet>

      {/* ── Welcome modal for new users ── */}
      <Suspense fallback={null}>
        <WelcomeModal
          open={welcomeOpen}
          onClose={handleWelcomeClose}
          onSignup={handleWelcomeSignup}
          onExplore={handleWelcomeExplore}
        />
      </Suspense>

      <div className={styles.page}>
        {/* ── Hero ── */}
        <header className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.heroContent}>
            <img src="/mascot.png" alt="" className={styles.heroMascot} width={120} height={120} />
            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitleMain}>MAXIMUS</span>
              <span className={styles.heroTitleSub}>SPORTS</span>
            </h1>
            <p className={styles.heroTagline}>
              AI-powered sports intelligence, built for fans who want an edge.
            </p>
            <p className={styles.heroSub}>
              Schedules, odds, picks, team intel, season outlooks, and premium editorial briefings.
            </p>
          </div>
        </header>

        {/* ── Value Props ── */}
        <div className={styles.valueStrip}>
          {VALUE_PROPS.map((v, i) => (
            <div key={i} className={styles.valueChip}>
              <span className={styles.valueIcon}>{v.icon}</span>
              <span className={styles.valueLabel}>{v.label}</span>
            </div>
          ))}
        </div>

        {/* ── Sport Tiles ── */}
        <div className={styles.tilesRow}>
          {/* MLB */}
          <Link to="/mlb" className={`${styles.tile} ${styles.tileMlb}`}>
            <div className={styles.tileGlow} />
            <div className={styles.tileHeader}>
              <img src="/mlb-logo.png" alt="MLB" className={styles.tileLogo} width={42} height={42} />
              <div>
                <h2 className={styles.tileTitle}>Major League Baseball</h2>
                <span className={styles.tileStatus}>
                  <span className={styles.statusDot} /> Regular Season Underway
                </span>
              </div>
            </div>
            <p className={styles.tileDesc}>
              Daily intel briefings, team projections, championship odds, run line picks,
              value leans, and game-by-game analysis across the full MLB slate.
            </p>
            <div className={styles.tileCta}>
              <span className={styles.ctaBtn}>Enter MLB Intelligence →</span>
              <span className={styles.ctaMicro}>Live now →</span>
            </div>
          </Link>

          {/* NBA — Playoffs Live */}
          <Link to="/nba" className={`${styles.tile} ${styles.tileNba}`}>
            <div className={styles.tileGlow} />
            <div className={styles.tileHeader}>
              <img src="/nba-logo.png" alt="NBA" className={styles.tileLogo} width={42} height={42} />
              <div>
                <h2 className={styles.tileTitle}>National Basketball Association</h2>
                <span className={`${styles.tileStatus} ${styles.statusPlayoffs}`}>
                  <span className={`${styles.statusDot} ${styles.statusDotGold}`} /> Playoffs Live
                </span>
              </div>
            </div>
            <p className={styles.tileDesc}>
              Interactive playoff bracketology, daily postseason briefings, team intel,
              Maximus&rsquo;s Picks, series simulations, and championship odds across every round.
            </p>
            <div className={styles.tileCta}>
              <span className={styles.ctaBtn}>Enter NBA Intelligence &rarr;</span>
              <span className={styles.ctaMicro}>Bracketology &middot; Team Intel &middot; Daily Briefing &rarr;</span>
            </div>
          </Link>

          {/* NCAAM */}
          <Link to="/ncaam" className={`${styles.tile} ${styles.tileNcaam}`}>
            <div className={styles.tileGlow} />
            <div className={styles.tileHeader}>
              <img src="/ncaa-logo.png" alt="NCAAM" className={styles.tileLogo} width={42} height={42} />
              <div>
                <h2 className={styles.tileTitle}>College Basketball</h2>
                <span className={`${styles.tileStatus} ${styles.statusComplete}`}>
                  {ncaamComplete ? '2026 Season Complete' : 'Season Active'}
                </span>
              </div>
            </div>
            <p className={styles.tileDesc}>
              {ncaamComplete && ch
                ? `March Madness 2026 is complete. ${ch.champion.split(' ').pop()} defeated ${ch.runnerUp.split(' ').pop()} ${ch.score} on April 6. Explore bracket insights, tournament recap, team intel, and picks history.`
                : 'Bracket intelligence, team intel, odds insights, ATS analytics, and tournament analysis.'}
            </p>
            <div className={styles.tileCta}>
              <span className={styles.ctaBtn}>
                {ncaamComplete ? 'View Season Recap →' : 'Enter NCAAM Intelligence →'}
              </span>
              <span className={styles.ctaMicro}>
                {ncaamComplete ? 'Season recap →' : 'Live now →'}
              </span>
            </div>
          </Link>
        </div>

        {/* ── Module Grid ── */}
        <div className={styles.modulesRow}>
          <div className={styles.moduleSection}>
            <h3 className={styles.moduleSectionTitle}>
              <img src="/mlb-logo.png" alt="" width={18} height={18} /> MLB Intelligence
            </h3>
            <div className={styles.moduleCards}>
              {MLB_MODULES.map((m, i) => (
                <Link key={i} to={m.to} className={styles.moduleCard}>
                  <span className={styles.moduleTitle}>{m.title} <span className={styles.moduleArrow}>→</span></span>
                  <span className={styles.moduleDesc}>{m.desc}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className={styles.moduleSection}>
            <h3 className={styles.moduleSectionTitle}>
              <img src="/nba-logo.png" alt="" width={18} height={18} /> NBA Intelligence
            </h3>
            <div className={styles.moduleCards}>
              {NBA_MODULES.map((m, i) => (
                <Link key={i} to={m.to} className={styles.moduleCard}>
                  <span className={styles.moduleTitle}>{m.title} <span className={styles.moduleArrow}>&rarr;</span></span>
                  <span className={styles.moduleDesc}>{m.desc}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className={styles.moduleSection}>
            <h3 className={styles.moduleSectionTitle}>
              <img src="/ncaa-logo.png" alt="" width={18} height={18} /> NCAAM Intelligence
            </h3>
            <div className={styles.moduleCards}>
              {NCAAM_MODULES.map((m, i) => (
                <Link key={i} to={m.to} className={styles.moduleCard}>
                  <span className={styles.moduleTitle}>{m.title} <span className={styles.moduleArrow}>→</span></span>
                  <span className={styles.moduleDesc}>{m.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── MLB Intel Feed (curated) ── */}
        {(mlbVideos.length > 0 || mlbNews.length > 0) && (
          <div className={styles.intelFeed}>
            <h3 className={styles.intelFeedTitle}>MLB Intel Feed</h3>
            <div className={styles.intelFeedGrid}>
              {/* Videos column */}
              {mlbVideos.length > 0 && (
                <div className={styles.intelVideos}>
                  {/* Featured video (first item) */}
                  {mlbVideos[0] && (
                    <a href={`https://www.youtube.com/watch?v=${mlbVideos[0].videoId}`}
                      target="_blank" rel="noopener noreferrer" className={styles.featuredVideo}>
                      <div className={styles.featuredThumb}>
                        <img src={mlbVideos[0].thumbUrl} alt="" loading="lazy" />
                        <span className={styles.playOverlay}>▶</span>
                      </div>
                      <div className={styles.featuredInfo}>
                        <span className={styles.featuredTitle}>{cleanTitle(mlbVideos[0].title)}</span>
                        <span className={styles.featuredMeta}>
                          {mlbVideos[0].channelTitle}
                          {mlbVideos[0].publishedAt && ` · ${formatTimeAgo(mlbVideos[0].publishedAt)}`}
                        </span>
                      </div>
                    </a>
                  )}
                  {/* Supporting videos */}
                  <div className={styles.supportingVideos}>
                    {mlbVideos.slice(1, 4).map((v, i) => (
                      <a key={i} href={`https://www.youtube.com/watch?v=${v.videoId}`}
                        target="_blank" rel="noopener noreferrer" className={styles.supportVideo}>
                        <div className={styles.supportThumb}>
                          <img src={v.thumbUrl} alt="" loading="lazy" />
                          <span className={styles.playIconSmall}>▶</span>
                        </div>
                        <div className={styles.supportInfo}>
                          <span className={styles.supportTitle}>{cleanTitle(v.title)}</span>
                          <span className={styles.supportMeta}>
                            {v.channelTitle}
                            {v.publishedAt && ` · ${formatTimeAgo(v.publishedAt)}`}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {/* Headlines column */}
              {mlbNews.length > 0 && (
                <div className={styles.intelHeadlines}>
                  <span className={styles.headlinesLabel}>Headlines</span>
                  {mlbNews.map((item, i) => (
                    <a key={i} href={item.url || item.link || '#'}
                      target="_blank" rel="noopener noreferrer" className={styles.headlineRow}>
                      <span className={styles.headlineTitle}>{cleanTitle(item.title || item.headline)}</span>
                      {item.source && <span className={styles.headlineSource}>{item.source}</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer handled by global Layout Footer component */}
      </div>
    </>
  );
}
