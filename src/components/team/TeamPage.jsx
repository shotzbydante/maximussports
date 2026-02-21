import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { fetchTeamNews } from '../../api/news';
import styles from './TeamPage.module.css';

function formatDate(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return str;
  }
}

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
        <p>That team doesn&apos;t exist in our database.</p>
        <Link to="/teams">← Back to Teams</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link to="/teams" className={styles.backLink}>← Teams</Link>
        <h1>{team.name}</h1>
        <p className={styles.subtitle}>Latest news & headlines</p>
      </div>

      <section className={styles.postsSection}>
        <h2 className={styles.sectionTitle}>Recent Headlines</h2>

        {loading && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            <p>Loading headlines...</p>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && headlines.length === 0 && (
          <div className={styles.empty}>
            <p>No headlines found for this team.</p>
          </div>
        )}

        {!loading && !error && headlines.length > 0 && (
          <ul className={styles.postList}>
            {headlines.map((h) => (
              <li key={h.id} className={styles.post}>
                <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.postLink}>
                  <h3 className={styles.postTitle}>{h.title}</h3>
                  <div className={styles.postMeta}>
                    <span className={styles.source}>{h.source}</span>
                    <span className={styles.date}>{formatDate(h.pubDate)}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
