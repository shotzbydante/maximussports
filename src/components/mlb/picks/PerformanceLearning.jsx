/**
 * PerformanceLearning — trust surface showing real rolling performance plus
 * 0–3 evidence-backed editorial insights derived from that same data.
 *
 * Shows:
 *   - Last 7 days record + win rate
 *   - Last 30 days record + win rate
 *   - Top Play trailing hit rate (when sample qualifies)
 *   - Up to 3 short insight lines
 *
 * Degrades gracefully:
 *   - no data at all          → "Building track record"
 *   - partial window          → "partial window" label, no fake numbers
 *   - no qualifying insights  → insights block hidden
 */

import { usePerformance } from '../../../features/mlb/picks/usePerformance';
import styles from './PerformanceLearning.module.css';

function WindowStat({ win, label }) {
  if (!win) return null;
  if (win.sparse && !win.record) {
    return (
      <div className={styles.stat}>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statValue}>—</span>
        <span className={styles.statMeta}>Building</span>
      </div>
    );
  }
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{win.record}</span>
      <span className={styles.statMeta}>
        {win.winRate != null ? `${win.winRate}% win rate` : 'no graded picks'}
        {win.sparse && win.sample > 0 ? ' · partial window' : ''}
      </span>
    </div>
  );
}

function TopPlayStat({ topPlay }) {
  if (!topPlay || !topPlay.graded) return null;
  const rate = topPlay.hitRate != null ? Math.round(topPlay.hitRate * 100) : null;
  const record = `${topPlay.won}-${topPlay.lost}${topPlay.push ? `-${topPlay.push}` : ''}`;
  const qualified = topPlay.graded >= 7;
  return (
    <div className={`${styles.stat} ${styles.statTopPlay}`}>
      <span className={styles.statLabel}>Top Plays</span>
      <span className={styles.statValue}>{record}</span>
      <span className={styles.statMeta}>
        {qualified && rate != null ? `${rate}% hit rate · last 30d` : `${topPlay.graded} graded · building`}
      </span>
    </div>
  );
}

function InsightLine({ text, tone }) {
  const cls = tone === 'positive' ? styles.insight_positive
            : tone === 'negative' ? styles.insight_negative
            : styles.insight_neutral;
  return (
    <li className={`${styles.insightLine} ${cls}`}>
      <span className={styles.insightGlyph} aria-hidden="true">◆</span>
      {text}
    </li>
  );
}

export default function PerformanceLearning({ compact = false }) {
  const { data, loading } = usePerformance();

  if (loading) {
    return <div className={`${styles.card} ${compact ? styles.cardCompact : ''} ${styles.loading}`} aria-hidden="true" />;
  }
  if (!data) return null;

  const win7 = data.windows?.trailing7d;
  const win30 = data.windows?.trailing30d;
  const topPlay = data.topPlay;
  const insights = (win30?.insights?.length ? win30.insights : win7?.insights) || [];

  const nothingToShow = !win7 && !win30 && !topPlay && insights.length === 0;
  if (nothingToShow) {
    return (
      <section className={`${styles.card} ${compact ? styles.cardCompact : ''}`} aria-label="Performance & Learning">
        <div className={styles.frame} aria-hidden="true" />
        <header className={styles.header}>
          <span className={styles.kicker}>Performance & Learning</span>
          <h3 className={styles.title}>Building track record</h3>
        </header>
        <p className={styles.empty}>Real results accumulate daily. The first window will surface after a few graded slates.</p>
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${compact ? styles.cardCompact : ''}`} aria-label="Performance & Learning">
      <div className={styles.frame} aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.kicker}>Performance & Learning</span>
        <h3 className={styles.title}>How the model has actually done</h3>
      </header>

      <div className={styles.statsRow}>
        <WindowStat win={win7} label="Last 7 days" />
        {!compact && <WindowStat win={win30} label="Last 30 days" />}
        <TopPlayStat topPlay={topPlay} />
      </div>

      {insights.length > 0 && (
        <ul className={styles.insights}>
          {insights.slice(0, compact ? 1 : 3).map(i => (
            <InsightLine key={i.key} text={i.text} tone={i.tone} />
          ))}
        </ul>
      )}
    </section>
  );
}
