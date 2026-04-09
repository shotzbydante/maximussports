/**
 * Landing — Root homepage for maximussports.ai
 *
 * Brand-first front door that introduces Maximus Sports
 * and routes users into MLB or NCAAM workspaces.
 *
 * Premium, cinematic, glassy treatment — darker and richer
 * than in-app pages to feel like a distinct entry experience.
 */

import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { WORKSPACES, WorkspaceId, SeasonState } from '../workspaces/config';
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

const MLB_PREVIEWS = [
  { title: 'Daily Briefing', desc: 'AI-generated league-wide intelligence every morning.' },
  { title: 'Team Intel', desc: 'Deep projections, odds, and matchup context for every team.' },
  { title: "Maximus's Picks", desc: 'Model-backed moneyline, ATS, value, and totals picks.' },
];

const NCAAM_PREVIEWS = [
  { title: 'Tournament Recap', desc: 'Full bracket breakdown and championship analysis.' },
  { title: 'Team Intel', desc: 'Season records, ATS profiles, and conference performance.' },
  { title: 'Bracketology', desc: 'Model-driven bracket picks and matchup probabilities.' },
];

export default function Landing() {
  const ncaam = WORKSPACES[WorkspaceId.CBB];
  const mlb = WORKSPACES[WorkspaceId.MLB];
  const ncaamComplete = ncaam.seasonState === SeasonState.COMPLETED;
  const ch = ncaam.championship;

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
            <img src="/logo.png" alt="Maximus Sports" className={styles.heroLogo} width={52} height={52} />
            <h1 className={styles.heroTitle}>Maximus Sports</h1>
            <p className={styles.heroTagline}>
              AI-powered sports intelligence, built for fans who want an edge.
            </p>
            <p className={styles.heroSub}>
              Schedules, odds, picks, team intel, season outlooks, and premium editorial briefings — all in one place.
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
          {/* MLB Tile */}
          <Link to="/mlb" className={`${styles.tile} ${styles.tileMlb}`}>
            <div className={styles.tileHeader}>
              <img src="/mlb-logo.png" alt="MLB" className={styles.tileLogo} width={36} height={36} />
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

          {/* NCAAM Tile */}
          <Link to="/ncaam" className={`${styles.tile} ${styles.tileNcaam}`}>
            <div className={styles.tileHeader}>
              <img src="/ncaa-logo.png" alt="NCAAM" className={styles.tileLogo} width={36} height={36} />
              <div>
                <h2 className={styles.tileTitle}>College Basketball</h2>
                <span className={`${styles.tileStatus} ${styles.statusComplete}`}>
                  {ncaamComplete ? 'Season Complete' : 'Season Active'}
                </span>
              </div>
            </div>
            <p className={styles.tileDesc}>
              {ncaamComplete && ch
                ? `March Madness 2026 is complete. ${ch.champion.split(' ').pop()} defeated ${ch.runnerUp.split(' ').pop()} ${ch.score} on April 6. Explore bracket insights, tournament recap, team intel, and picks history.`
                : 'Bracket intelligence, team intel, odds insights, ATS analytics, and tournament analysis for March Madness and the full college basketball season.'}
            </p>
            <div className={styles.tileCta}>
              <span className={styles.ctaBtn}>
                {ncaamComplete ? 'View Season Recap →' : 'Enter NCAAM Intelligence →'}
              </span>
            </div>
          </Link>
        </div>

        {/* ── Preview Rows ── */}
        <div className={styles.previewsRow}>
          <div className={styles.previewSection}>
            <h3 className={styles.previewSectionTitle}>
              <img src="/mlb-logo.png" alt="" width={18} height={18} /> MLB Intelligence
            </h3>
            <div className={styles.previewCards}>
              {MLB_PREVIEWS.map((p, i) => (
                <Link key={i} to="/mlb" className={styles.previewCard}>
                  <span className={styles.previewTitle}>{p.title}</span>
                  <span className={styles.previewDesc}>{p.desc}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className={styles.previewSection}>
            <h3 className={styles.previewSectionTitle}>
              <img src="/ncaa-logo.png" alt="" width={18} height={18} /> NCAAM Intelligence
            </h3>
            <div className={styles.previewCards}>
              {NCAAM_PREVIEWS.map((p, i) => (
                <Link key={i} to="/ncaam" className={styles.previewCard}>
                  <span className={styles.previewTitle}>{p.title}</span>
                  <span className={styles.previewDesc}>{p.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

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
