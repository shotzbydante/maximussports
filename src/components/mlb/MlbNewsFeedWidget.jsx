/**
 * MLB Headlines widget for the MLB Home page.
 * Mirrors the CBB NewsFeed mode="headlines" pattern.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchMlbHeadlines } from '../../api/mlbNews';
import styles from './MlbNewsFeedWidget.module.css';

const MAX_VISIBLE = 8;

export default function MlbNewsFeedWidget() {
  const [headlines, setHeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchMlbHeadlines()
      .then((data) => setHeadlines(data.headlines ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = expanded ? headlines : headlines.slice(0, MAX_VISIBLE);
  const hiddenCount = expanded ? 0 : Math.max(0, headlines.length - MAX_VISIBLE);

  if (!loading && headlines.length === 0) return null;

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Intel Feed</span>
        <h3 className={styles.title}>MLB Headlines</h3>
      </div>

      <div className={styles.card}>
        {loading ? (
          <div className={styles.skeletons}>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={styles.skeleton}>
                <div className={styles.skelBadge} />
                <div className={styles.skelLine} style={{ width: n === 1 ? '100%' : n === 2 ? '85%' : n === 3 ? '72%' : '90%' }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <ul className={styles.list}>
              {visible.map((item) => (
                <li key={item.id} className={styles.item}>
                  <div className={styles.meta}>
                    <span className={styles.source}>{item.source}</span>
                    {item.time && <span className={styles.time}>{item.time}</span>}
                  </div>
                  <div className={styles.headline}>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {(hiddenCount > 0 || expanded) && (
              <button type="button" className={styles.expandBtn} onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show less' : `+${hiddenCount} more headline${hiddenCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </>
        )}
        <Link to="/mlb/news" className={styles.cta}>View full MLB Feed →</Link>
      </div>
    </section>
  );
}
