import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TEAMS } from '../data/teams';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { buildMatchupSlug } from '../utils/matchupSlug';
import TeamLogo from '../components/shared/TeamLogo';
import SEOHead, { buildOgImageUrl } from '../components/seo/SEOHead';
import styles from './MarchMadnessHub.module.css';

const CONFERENCES = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East'];

function impliedProbFromAmerican(american) {
  if (american == null || typeof american !== 'number') return null;
  if (american < 0) return (-american) / ((-american) + 100);
  return 100 / (american + 100);
}

export default function MarchMadnessHub() {
  const [championshipOdds, setChampionshipOdds] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchChampionshipOdds()
      .then(({ odds }) => { if (!cancelled) { setChampionshipOdds(odds ?? {}); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const topContenders = useMemo(() => {
    return Object.entries(championshipOdds)
      .filter(([, v]) => v?.american != null)
      .sort((a, b) => {
        const aProb = impliedProbFromAmerican(a[1].american) ?? 0;
        const bProb = impliedProbFromAmerican(b[1].american) ?? 0;
        return bProb - aProb;
      })
      .slice(0, 16)
      .map(([slug, v]) => {
        const team = TEAMS.find((t) => t.slug === slug);
        return { slug, team, odds: v.american, prob: impliedProbFromAmerican(v.american) };
      })
      .filter((c) => c.team);
  }, [championshipOdds]);

  const conferenceTeams = useMemo(() => {
    return CONFERENCES.map((conf) => ({
      conference: conf,
      teams: TEAMS.filter((t) => t.conference === conf && (t.oddsTier === 'Lock' || t.oddsTier === 'Should be in')),
    }));
  }, []);

  const currentYear = new Date().getFullYear();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': `March Madness Betting Intelligence (${currentYear}) — NCAA Tournament Analysis`,
    'description': `${currentYear} March Madness betting intelligence including tournament matchup insights, team betting trends, bracket analysis signals, and championship odds powered by Maximus Sports.`,
    'url': 'https://maximussports.ai/march-madness-betting-intelligence',
    'isPartOf': { '@type': 'WebSite', 'name': 'Maximus Sports', 'url': 'https://maximussports.ai' },
    'breadcrumb': {
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://maximussports.ai' },
        { '@type': 'ListItem', 'position': 2, 'name': 'March Madness Betting Intelligence', 'item': 'https://maximussports.ai/march-madness-betting-intelligence' },
      ],
    },
  };

  return (
    <div className={styles.page}>
      <SEOHead
        title={`March Madness Betting Intelligence (${currentYear}) — Picks, Trends & Predictions`}
        description={`${currentYear} March Madness betting intelligence including tournament matchup insights, team betting trends, bracket analysis signals, and championship odds powered by Maximus Sports.`}
        canonicalPath="/march-madness-betting-intelligence"
        ogImage={buildOgImageUrl({ title: 'March Madness Intelligence', subtitle: 'Tournament picks, trends & bracket analysis', type: 'Bracket Bust' })}
        jsonLd={jsonLd}
      />

      <header className={styles.header}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden>/</span>
          <span>March Madness</span>
        </nav>
        <h1 className={styles.pageTitle}>March Madness Betting Intelligence ({currentYear})</h1>
        <p className={styles.pageSubtitle}>
          NCAA tournament matchup insights, team betting trends, bracket analysis signals,
          and championship odds for the {currentYear} season — powered by advanced analytics.
        </p>
      </header>

      <section className={styles.section} aria-label="Championship contenders">
        <h2 className={styles.sectionTitle}>Championship Odds — Top Contenders</h2>
        <p className={styles.sectionIntro}>
          Championship futures for the top NCAA tournament contenders. Odds reflect the latest market pricing across major sportsbooks.
        </p>
        {loading ? (
          <p className={styles.loadingText}>Loading championship odds…</p>
        ) : topContenders.length > 0 ? (
          <div className={styles.contendersGrid}>
            {topContenders.map((c) => (
              <Link to={`/teams/${c.slug}`} key={c.slug} className={styles.contenderCard}>
                <TeamLogo team={c.team} size={28} />
                <div className={styles.contenderInfo}>
                  <span className={styles.contenderName}>{c.team.name}</span>
                  <span className={styles.contenderConf}>{c.team.conference}</span>
                </div>
                <span className={styles.contenderOdds}>
                  {c.odds > 0 ? `+${c.odds}` : c.odds}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>Championship odds not currently available.</p>
        )}
      </section>

      <section className={styles.section} aria-label="Conference tournament contenders">
        <h2 className={styles.sectionTitle}>Conference Tournament Contenders</h2>
        <p className={styles.sectionIntro}>
          Key programs across the power conferences positioned for March Madness bids based on current betting tiers.
        </p>
        {conferenceTeams.map(({ conference, teams }) => (
          <div key={conference} className={styles.confBlock}>
            <h3 className={styles.confTitle}>{conference}</h3>
            <div className={styles.confTeams}>
              {teams.map((t) => (
                <Link to={`/teams/${t.slug}`} key={t.slug} className={styles.confTeamLink}>
                  <TeamLogo team={t} size={20} />
                  <span>{t.name}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── Key matchup prediction links (generated from top contenders) ── */}
      {topContenders.length >= 4 && (
        <section className={styles.section} aria-label="Key matchup predictions">
          <h2 className={styles.sectionTitle}>Key Tournament Matchup Predictions</h2>
          <p className={styles.sectionIntro}>
            Explore AI-powered matchup intelligence for potential tournament showdowns between top contenders.
          </p>
          <div className={styles.matchupLinks}>
            {(() => {
              const pairs = [];
              const top = topContenders.slice(0, 8);
              for (let i = 0; i < top.length && pairs.length < 6; i++) {
                for (let j = i + 1; j < top.length && pairs.length < 6; j++) {
                  pairs.push([top[i], top[j]]);
                }
              }
              return pairs.map(([a, b]) => {
                const mSlug = buildMatchupSlug(a.slug, b.slug);
                return (
                  <Link to={`/games/${mSlug}`} key={mSlug} className={styles.matchupLinkPill}>
                    {a.team.name} vs {b.team.name} →
                  </Link>
                );
              });
            })()}
          </div>
        </section>
      )}

      <section className={styles.section} aria-label="Related intelligence">
        <h2 className={styles.sectionTitle}>More March Madness Intelligence</h2>
        <div className={styles.linksGrid}>
          <Link to="/insights" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>Odds Insights</span>
            <span className={styles.linkCardDesc}>Live market analysis with spread distribution and upset alerts</span>
          </Link>
          <Link to="/college-basketball-picks-today" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>Today&apos;s Picks</span>
            <span className={styles.linkCardDesc}>Daily ATS picks, moneyline value, and game total projections</span>
          </Link>
          <Link to="/teams" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>All Teams</span>
            <span className={styles.linkCardDesc}>Browse every NCAAB program tracked by Maximus</span>
          </Link>
          <Link to="/news" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>Tournament News</span>
            <span className={styles.linkCardDesc}>Latest March Madness headlines and analysis</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
