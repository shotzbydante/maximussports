import styles from './RedditSentiment.module.css';

function sentimentLabel(score) {
  if (score >= 0.7) return 'Bullish';
  if (score >= 0.5) return 'Neutral';
  return 'Bearish';
}

function sentimentClass(score) {
  if (score >= 0.7) return styles.bullish;
  if (score >= 0.5) return styles.neutral;
  return styles.bearish;
}

export default function RedditSentiment({ items }) {
  return (
    <div className={styles.widget}>
      <h3 className={styles.title}>Reddit Sentiment</h3>
      <div className={styles.list}>
        {items.map((item) => (
          <div key={item.team} className={styles.item}>
            <div className={styles.teamRow}>
              <span className={styles.team}>{item.team}</span>
              <span className={`${styles.label} ${sentimentClass(item.sentiment)}`}>
                {sentimentLabel(item.sentiment)}
              </span>
            </div>
            <div className={styles.bar}>
              <div
                className={`${styles.fill} ${sentimentClass(item.sentiment)}`}
                style={{ width: `${item.sentiment * 100}%` }}
              />
            </div>
            <div className={styles.meta}>
              <span>{item.posts} posts</span>
              <span className={styles.sub}>{item.subreddit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
