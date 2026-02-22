import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { fetchTeamNews } from '../../api/news';
import TeamLogo from '../shared/TeamLogo';
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

  useEffect(() => {
    if (!team) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchTeamNews(slug)
      .then((data) => setHeadlines(data.headlines || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, team]);

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

      <section className={styles.newsSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionLabel}>Last 90 days</span>
        </div>

        {loading && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            <span>Loading...</span>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        {!loading && !error && headlines.length === 0 && (
          <div className={styles.empty}>No headlines found.</div>
        )}

        {!loading && !error && headlines.length > 0 && (
          <ul className={styles.list}>
            {headlines.map((h) => (
              <li key={h.id} className={styles.row}>
                <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  <span className={styles.title}>{h.title}</span>
                  <span className={styles.meta}>
                    <span className={styles.source}>{h.source}</span>
                    <span className={styles.date}>{formatDate(h.pubDate)}</span>
                  </span>
                  <span className={styles.chevron}>→</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
