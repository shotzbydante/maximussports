/**
 * Key Dates widget — conference finals + NCAA dates, times in PST.
 * Bloomberg-style compact layout.
 */

import SourceBadge from '../shared/SourceBadge';
import { KEY_DATES } from '../../data/keyDates';
import styles from './KeyDatesWidget.module.css';

export default function KeyDatesWidget() {
  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <h3 className={styles.title}>Key Dates</h3>
        <SourceBadge source="Mock" />
      </div>
      <div className={styles.table}>
        <div className={`${styles.row} ${styles.rowHeader}`}>
          <span className={styles.colLabel}>Event</span>
          <span className={styles.colDate}>Date</span>
          <span className={styles.colTime}>Time (PST)</span>
        </div>
        {KEY_DATES.map((item) => (
          <div
            key={`${item.label}-${item.date}`}
            className={`${styles.row} ${item.highlight ? styles.rowHighlight : ''}`}
          >
            <span className={`${styles.colLabel} ${item.highlight ? styles.colLabelBold : ''}`}>
              {item.label}
            </span>
            <span className={styles.colDate}>{item.date}</span>
            <span className={styles.colTime}>{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
