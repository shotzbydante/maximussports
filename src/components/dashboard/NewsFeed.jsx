import SourceBadge from '../shared/SourceBadge';
import styles from './NewsFeed.module.css';

const sentimentClass = {
  positive: styles.positive,
  negative: styles.negative,
  neutral: styles.neutral,
};

export default function NewsFeed({ items = [], source = 'Mock' }) {
  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <h3 className={styles.title}>News & Headlines</h3>
        <SourceBadge source={source} />
      </div>
      <p className={styles.sourceLegend}>Sources: ESPN, NCAA, CBS, Yahoo, Team Feeds, Google News</p>
      {items.length === 0 ? (
        <p className={styles.empty}>No men&apos;s basketball news available. Try again later.</p>
      ) : (
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <span className={`${styles.sentiment} ${sentimentClass[item.sentiment] || styles.neutral}`} />
              <SourceBadge source={item.source || source} />
              <span className={styles.time}>{item.time}</span>
            </div>
            <h4 className={styles.headline}>
              {item.link ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </h4>
            {item.excerpt && <p className={styles.excerpt}>{item.excerpt}</p>}
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
