import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { fetchTeamPosts } from '../../api/reddit';
import styles from './TeamPage.module.css';

export default function TeamPage() {
  const { slug } = useParams();
  const team = getTeamBySlug(slug);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!team) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchTeamPosts(slug)
      .then((data) => setPosts(data.posts || []))
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
        <p className={styles.subtitle}>Reddit discussion & sentiment</p>
      </div>

      <section className={styles.postsSection}>
        <h2 className={styles.sectionTitle}>Recent Reddit Posts</h2>

        {loading && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            <p>Loading posts...</p>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <p>{error}</p>
            <p className={styles.errorHint}>Make sure the Reddit proxy server is running and .env has valid credentials.</p>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className={styles.empty}>
            <p>No posts found for this team.</p>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <ul className={styles.postList}>
            {posts.map((post) => (
              <li key={post.id} className={styles.post}>
                <a href={post.permalink} target="_blank" rel="noopener noreferrer" className={styles.postLink}>
                  <h3 className={styles.postTitle}>{post.title}</h3>
                  <div className={styles.postMeta}>
                    <span className={styles.upvotes}>↑ {post.upvotes}</span>
                    <span className={styles.comments}>💬 {post.numComments}</span>
                    <span className={styles.sub}>r/{post.subreddit}</span>
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
