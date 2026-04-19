/**
 * AuditInsights — "what the model is learning" surface.
 *
 * Reads /api/mlb/picks/insights. Renders 0–3 short evidence-backed lines.
 * Hidden entirely when no qualifying insights exist — the audit says
 * "no confident signal yet" and we respect that by not rendering fluff.
 *
 * Calibrated, calm tone. No over-claiming.
 */

import { useAuditInsights } from '../../../features/mlb/picks/usePerformance';
import styles from './AuditInsights.module.css';

export default function AuditInsights() {
  const { data, loading } = useAuditInsights();
  if (loading) return <div className={`${styles.card} ${styles.loading}`} aria-hidden="true" />;
  if (!data) return null;

  const insights = (data.insights || []).slice(0, 3);
  if (insights.length === 0) return null; // respect sparsity

  const latestDate = data.latest?.slateDate;

  return (
    <section className={styles.card} aria-label="What the model is learning">
      <div className={styles.frame} aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.kicker}>What the model is seeing</span>
        <p className={styles.title}>
          Signals from recent graded slates{latestDate ? ` · through ${latestDate}` : ''}.
        </p>
      </header>
      <ul className={styles.list}>
        {insights.map(i => (
          <li key={i.key} className={`${styles.item} ${i.tone === 'positive' ? styles.item_positive : i.tone === 'negative' ? styles.item_negative : styles.item_neutral}`}>
            <span className={styles.itemGlyph} aria-hidden="true">◆</span>
            <span className={styles.itemText}>{i.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
