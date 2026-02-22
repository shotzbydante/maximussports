import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { fetchAggregateNews } from '../../api/news';
import TeamLogo from '../shared/TeamLogo';
import TeamSchedule from './TeamSchedule';
import MaximusInsight from './MaximusInsight';
import SourceBadge from '../shared/SourceBadge';
import styles from './TeamPage.module.css';

function formatDate(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return str;
  }
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
  const [headlines, setHeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prev90Expanded, setPrev90Expanded] = useState(false);

  useEffect(() => {
    if (!team) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchAggregateNews({
      teamSlug: slug,
      includeNational: true,
      includeTeamFeeds: true,
    })
      .then(({ items }) => {
        const mapped = items.map((item, i) => ({
          id: item.link || `agg-${i}`,
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          source: item.source || 'News',
        }));
        setHeadlines(mapped);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, team]);

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
              <span className={styles.conference}>{team.conference}</span>
              <span className={`${styles.badge} ${TIER_CLASS[team.oddsTier] || ''}`}>
                {team.oddsTier}
              </span>
            </div>
          </div>
        </div>
      </header>

      <MaximusInsight slug={slug} />

      <section className={styles.newsSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionLabel}>News</span>
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

      <TeamSchedule slug={slug} />
    </div>
  );
}
