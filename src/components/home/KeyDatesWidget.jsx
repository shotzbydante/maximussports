/**
 * Key Dates widget — calendar-style compact grid.
 * Small cards with month/day + title. Highlights today, past vs upcoming.
 */

import SourceBadge from '../shared/SourceBadge';
import { KEY_DATES } from '../../data/keyDates';
import styles from './KeyDatesWidget.module.css';

function parseDateStr(str) {
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

function getMonthDay(dateStr) {
  const p = parseDateStr(dateStr);
  if (!p) return { month: '', day: '' };
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return { month: months[p.month - 1], day: String(p.day) };
}

function isToday(dateStr) {
  const p = parseDateStr(dateStr);
  if (!p) return false;
  const d = new Date();
  return d.getFullYear() === p.year && d.getMonth() + 1 === p.month && d.getDate() === p.day;
}

function isPast(dateStr) {
  const p = parseDateStr(dateStr);
  if (!p) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(p.year, p.month - 1, p.day);
  return d < today;
}

export default function KeyDatesWidget() {
  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.titleWrap}>
          <span className={styles.icon} aria-hidden>📅</span>
          <h3 className={styles.title}>Key Dates</h3>
        </span>
        <SourceBadge source="Mock" />
      </div>
      <div className={styles.grid}>
        {KEY_DATES.map((item) => {
          const { month, day } = getMonthDay(item.date);
          const today = isToday(item.date);
          const past = isPast(item.date);
          return (
            <div
              key={`${item.label}-${item.date}`}
              className={`${styles.card} ${today ? styles.cardToday : ''} ${past ? styles.cardPast : ''}`}
            >
              <div className={styles.cardDate}>
                <span className={styles.cardMonth}>{month}</span>
                <span className={styles.cardDay}>{day}</span>
              </div>
              <div className={styles.cardContent}>
                <span className={styles.cardLabel}>{item.label}</span>
                {item.time && item.time !== '—' && (
                  <span className={styles.cardTime}>{item.time}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
