import { useState, useEffect } from 'react';
import { fetchAggregateNews } from '../api/news';
import { getTeamsGroupedByConference } from '../data/teams';
import SourceBadge from '../components/shared/SourceBadge';
import styles from './NewsFeed.module.css';

const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];

/** Letter-mark for conference (first letter or abbreviation) */
function ConferenceIcon({ conference }) {
  const mark = conference === 'Big Ten' ? 'B10' : conference === 'Big 12' ? 'B12' : conference.slice(0, 1);
  return (
    <span className={styles.confIcon} aria-hidden>
      {mark}
    </span>
  );
}

function formatDate(pubDate) {
  if (!pubDate) return '';
  try {
    return new Date(pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '';
  }
}

export default function NewsFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => {
    const o = {};
    CONF_ORDER.forEach((c) => { o[c] = true; });
    return o;
  });

  useEffect(() => {
    setLoading(true);
    fetchAggregateNews({ includeNational: true })
      .then(({ items: list }) => setItems(list || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const grouped = getTeamsGroupedByConference();
  const sections = CONF_ORDER.map((conf) => ({
    conference: conf,
    teams: grouped.find((g) => g.conference === conf)?.tiers ? Object.values(grouped.find((g) => g.conference === conf).tiers).flat() : [],
  }));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>News Feed</h1>
        <p className={styles.subtitle}>Men&apos;s college basketball — last 30 days by conference</p>
      </header>

      {loading && (
        <div className={styles.loading}>
          <span className={styles.spinner} />
          <span>Loading news…</span>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {!loading && !error && (
        <div className={styles.sections}>
          {sections.map(({ conference, teams }) => (
            <section key={conference} className={styles.card}>
              <button
                type="button"
                className={styles.sectionHeader}
                onClick={() => setExpanded((e) => ({ ...e, [conference]: !e[conference] }))}
                aria-expanded={expanded[conference]}
              >
                <ConferenceIcon conference={conference} />
                <span className={styles.sectionTitle}>{conference}</span>
                {teams.length > 0 && (
                  <span className={styles.teamCount}>{teams.length} teams</span>
                )}
                <span className={styles.chevron} aria-hidden>{expanded[conference] ? '▾' : '▸'}</span>
              </button>
              {expanded[conference] && (
                <div className={styles.sectionBody}>
                  {items.length === 0 ? (
                    <p className={styles.empty}>No news in the last 30 days.</p>
                  ) : (
                    <ul className={styles.list}>
                      {items.slice(0, 15).map((item, i) => (
                        <li key={item.link || i} className={styles.row}>
                          <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                            <span className={styles.title}>{item.title}</span>
                            <span className={styles.meta}>
                              <SourceBadge source={item.source || 'News'} />
                              <span className={styles.date}>{formatDate(item.pubDate)}</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
