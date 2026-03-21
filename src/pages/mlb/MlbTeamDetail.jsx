/**
 * MLB Team Intel detail page — renders when visiting /mlb/teams/:slug.
 * Provides a real page destination with team info, championship odds, and news.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMLBTeamBySlug } from '../../sports/mlb/teams';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { fetchMlbChampionshipOdds } from '../../api/mlbChampionshipOdds';
import { fetchMlbHeadlines } from '../../api/mlbNews';
import styles from './MlbTeamDetail.module.css';

function formatOdds(american) {
  if (american == null) return '—';
  return american > 0 ? `+${american}` : `${american}`;
}

export default function MlbTeamDetail() {
  const { slug } = useParams();
  const { workspace, buildPath } = useWorkspace();
  const team = getMLBTeamBySlug(slug);
  const logoUrl = team ? getMlbEspnLogoUrl(team.slug) : null;

  const [odds, setOdds] = useState(null);
  const [headlines, setHeadlines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetchMlbChampionshipOdds(),
      fetchMlbHeadlines(),
    ]).then(([oddsRes, newsRes]) => {
      if (oddsRes.status === 'fulfilled') setOdds(oddsRes.value.odds ?? {});
      if (newsRes.status === 'fulfilled') setHeadlines(newsRes.value.headlines ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (!team) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <h2>Team not found</h2>
          <p>No MLB team matches "{slug}".</p>
          <Link to={buildPath('/teams')} className={styles.backLink}>← Back to Team Intel</Link>
        </div>
      </div>
    );
  }

  const teamOdds = odds?.[team.slug];
  const teamHeadlines = headlines.filter((h) => {
    const t = (h.title || '').toLowerCase();
    const nameParts = team.name.toLowerCase().split(' ');
    return nameParts.some((p) => p.length > 3 && t.includes(p));
  }).slice(0, 6);

  return (
    <div className={styles.page}>
      <Link to={buildPath('/teams')} className={styles.backLink}>← All MLB Teams</Link>

      <header className={styles.header}>
        <div className={styles.teamIdentity}>
          {logoUrl ? (
            <img src={logoUrl} alt={team.name} className={styles.logo} width={56} height={56} />
          ) : (
            <span className={styles.logoFallback}>{team.abbrev}</span>
          )}
          <div>
            <h1 className={styles.teamName}>{team.name}</h1>
            <span className={styles.teamMeta}>{team.division} · {team.league}</span>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        {/* Championship Odds Card */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>🏆 World Series Odds</h3>
          {loading ? (
            <div className={styles.oddsLoading}>Loading…</div>
          ) : teamOdds ? (
            <div className={styles.oddsGrid}>
              <div className={styles.oddsStat}>
                <span className={styles.oddsLabel}>Best Line</span>
                <span className={styles.oddsValue}>{formatOdds(teamOdds.bestChanceAmerican)}</span>
              </div>
              <div className={styles.oddsStat}>
                <span className={styles.oddsLabel}>Best Payout</span>
                <span className={styles.oddsValue}>{formatOdds(teamOdds.bestPayoutAmerican)}</span>
              </div>
              <div className={styles.oddsStat}>
                <span className={styles.oddsLabel}>Books</span>
                <span className={styles.oddsValue}>{teamOdds.booksCount ?? '—'}</span>
              </div>
            </div>
          ) : (
            <p className={styles.oddsEmpty}>No championship odds available yet.</p>
          )}
        </section>

        {/* Team Info Card */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Team Info</h3>
          <div className={styles.infoList}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>League</span>
              <span className={styles.infoValue}>{team.league === 'AL' ? 'American League' : 'National League'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Division</span>
              <span className={styles.infoValue}>{team.division}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Abbreviation</span>
              <span className={styles.infoValue}>{team.abbrev}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Recent Headlines */}
      {teamHeadlines.length > 0 && (
        <section className={styles.newsSection}>
          <h3 className={styles.sectionTitle}>Recent Headlines</h3>
          <ul className={styles.newsList}>
            {teamHeadlines.map((h) => (
              <li key={h.id} className={styles.newsItem}>
                <div className={styles.newsMeta}>
                  <span className={styles.newsSource}>{h.source}</span>
                  {h.time && <span className={styles.newsTime}>{h.time}</span>}
                </div>
                {h.link ? (
                  <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.newsLink}>{h.title}</a>
                ) : (
                  <span>{h.title}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
