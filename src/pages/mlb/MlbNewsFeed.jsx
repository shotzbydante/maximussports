/**
 * Full-page MLB News Feed at /mlb/news.
 * Uses the same headline fetcher as the home widget.
 */

import { useState, useEffect } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { fetchMlbHeadlines } from '../../api/mlbNews';
import styles from './MlbShared.module.css';

export default function MlbNewsFeed() {
  const { workspace } = useWorkspace();
  const [headlines, setHeadlines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMlbHeadlines()
      .then((data) => setHeadlines(data.headlines ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>MLB News Feed</h1>
        <p className={styles.subtitle}>Headlines, trades, injuries, and analysis</p>
      </header>

      {loading ? (
        <section className={styles.heroCard}>
          <p className={styles.heroBody}>Loading headlines…</p>
        </section>
      ) : headlines.length === 0 ? (
        <section className={styles.emptyState}>
          <div className={styles.emptyIcon}>📰</div>
          <h3>No headlines available</h3>
          <p>MLB news from trusted sources will appear here. Check back soon.</p>
        </section>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {headlines.map((item) => (
            <li key={item.id} style={{
              padding: 'var(--space-md) var(--space-lg)',
              background: 'var(--color-bg-elevated)',
              borderBottom: '1px solid var(--color-border-light)',
              transition: 'background 0.12s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--color-primary)',
                  background: 'rgba(60,121,180,0.08)', padding: '1px 6px', borderRadius: '3px',
                }}>{item.source}</span>
                {item.time && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{item.time}</span>}
              </div>
              {item.link ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: '0.88rem', color: 'var(--color-text)', textDecoration: 'none', lineHeight: 1.5,
                }}>{item.title}</a>
              ) : (
                <span style={{ fontSize: '0.88rem', color: 'var(--color-text)', lineHeight: 1.5 }}>{item.title}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
