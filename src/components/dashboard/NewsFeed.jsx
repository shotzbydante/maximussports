import styles from './NewsFeed.module.css';

const sentimentClass = {
  positive: styles.positive,
  negative: styles.negative,
  neutral: styles.neutral,
};

export default function NewsFeed({ items = [] }) {
  return (
    <div className={styles.widget}>
      <h3 className={styles.title}>News & Headlines</h3>
      {items.length === 0 ? (
        <p className={styles.empty}>No headlines available. Check back later.</p>
      ) : (
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <span className={`${styles.sentiment} ${sentimentClass[item.sentiment] || styles.neutral}`} />
              <span className={styles.source}>{item.source}</span>
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
