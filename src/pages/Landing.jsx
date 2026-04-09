/**
 * Landing — Root homepage for maximussports.ai
 *
 * Premium, cinematic front door. Routes users into MLB or NCAAM.
 * Features live news/video previews from News Feed API.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { WORKSPACES, WorkspaceId, SeasonState } from '../workspaces/config';
import { fetchMlbHeadlines } from '../api/mlbNews';
import styles from './Landing.module.css';

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
  { title: 'Daily Briefing', desc: 'AI-generated league-wide intelligence.', to: '/mlb' },
  { title: 'Team Intel', desc: 'Projections, odds, and matchup context.', to: '/mlb/teams' },
  { title: "Maximus's Picks", desc: 'Moneyline, ATS, value, and totals picks.', to: '/mlb/insights' },
  { title: 'Season Intelligence', desc: 'Full-season model projections.', to: '/mlb/season-model' },
];

const NCAAM_MODULES = [
  { title: 'Tournament Recap', desc: 'Championship analysis and bracket breakdown.', to: '/ncaam' },
  { title: 'Team Intel', desc: 'Season records, ATS, and conference performance.', to: '/ncaam/teams' },
  { title: 'Bracketology', desc: 'Model-driven bracket picks and probabilities.', to: '/bracketology' },
  { title: 'Odds Insights', desc: 'Historical picks performance and ATS analytics.', to: '/ncaam/insights' },
];

function NewsCard({ item }) {
  const hasImage = item.image || item.thumbnail;
  return (
    <a href={item.url || item.link || '#'} target="_blank" rel="noopener noreferrer" className={styles.newsCard}>
      {hasImage && (
        <div className={styles.newsThumb}>
          <img src={item.image || item.thumbnail} alt="" loading="lazy" className={styles.newsThumbImg} />
          {(item.type === 'video' || item.isVideo) && <span className={styles.playIcon}>▶</span>}
        </div>
      )}
      <div className={styles.newsBody}>
        <span className={styles.newsTitle}>{item.title || item.headline}</span>
        {item.source && <span className={styles.newsSource}>{item.source}</span>}
      </div>
    </a>
  );
}

export default function Landing() {
  const ncaam = WORKSPACES[WorkspaceId.CBB];
  const ncaamComplete = ncaam.seasonState === SeasonState.COMPLETED;
  const ch = ncaam.championship;

  const [mlbNews, setMlbNews] = useState([]);

  useEffect(() => {
    fetchMlbHeadlines()
      .then(d => setMlbNews((d.headlines || []).slice(0, 3)))
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

      <div className={styles.page}>
        {/* ── Hero ── */}
        <header className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.heroContent}>
            <img src="/mascot.png" alt="" className={styles.heroMascot} width={80} height={80} />
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
                  <span className={styles.moduleTitle}>{m.title}</span>
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
                  <span className={styles.moduleTitle}>{m.title}</span>
                  <span className={styles.moduleDesc}>{m.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Live News Previews ── */}
        {mlbNews.length > 0 && (
          <div className={styles.newsSection}>
            <h3 className={styles.newsSectionTitle}>Latest from MLB</h3>
            <div className={styles.newsGrid}>
              {mlbNews.map((item, i) => <NewsCard key={i} item={item} />)}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <span className={styles.footerBrand}>Maximus Sports</span>
          <span className={styles.footerTag}>AI-Powered Sports Intelligence</span>
          <div className={styles.footerLinks}>
            <Link to="/privacy" className={styles.footerLink}>Privacy</Link>
            <Link to="/terms" className={styles.footerLink}>Terms</Link>
            <Link to="/contact" className={styles.footerLink}>Contact</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
