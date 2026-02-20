import styles from './NewsFeed.module.css';

const sentimentClass = {
  positive: styles.positive,
  negative: styles.negative,
  neutral: styles.neutral,
};

export default function NewsFeed({ items }) {
  return (
    <div className={styles.widget}>
      <h3 className={styles.title}>News & Headlines</h3>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <span className={`${styles.sentiment} ${sentimentClass[item.sentiment] || styles.neutral}`} />
              <span className={styles.source}>{item.source}</span>
              <span className={styles.time}>{item.time}</span>
            </div>
            <h4 className={styles.headline}>{item.title}</h4>
            <p className={styles.excerpt}>{item.excerpt}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
