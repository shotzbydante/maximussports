import { Link } from 'react-router-dom';
import styles from './TeamNewsPreview.module.css';

export default function TeamNewsPreview({ items }) {
  return (
    <div className={styles.widget}>
      <h3 className={styles.title}>Team News</h3>
      <div className={styles.list}>
        {items.map((item) => (
          <Link
            key={item.slug}
            to={`/teams/${item.slug}`}
            className={styles.item}
          >
            <span className={styles.team}>{item.team}</span>
            <span className={styles.meta}>{item.headlines} headlines</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
