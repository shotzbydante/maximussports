import styles from './NewsFeed.module.css';

export default function NewsFeed({ items = [], source = 'Mock', loading = false }) {
  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <span className={styles.title}>News &amp; Headlines</span>
        <span className={styles.sourceLegend}>ESPN · CBS · Yahoo · Google News</span>
      </div>

      {loading ? (
        <div className={styles.loadingList}>
          {[1, 2, 3].map((n) => (
            <div key={n} className={styles.skeletonItem}>
              <div className={styles.skeletonBadge} />
              <div className={styles.skeletonLine} style={{ width: n === 1 ? '100%' : n === 2 ? '88%' : '75%' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className={styles.empty}>No basketball news available. Check back soon.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const src = item.source || source;
            return (
              <li key={item.id} className={styles.item}>
                <div className={styles.itemMeta}>
                  <span className={styles.sourceBadge}>{src}</span>
                  <span className={styles.time}>{item.time}</span>
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
                {item.excerpt && <p className={styles.excerpt}>{item.excerpt}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
