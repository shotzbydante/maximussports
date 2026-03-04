import SlideShell from './SlideShell';
import styles from './OddsInsightsSlide3.module.css';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

export default function OddsInsightsSlide3({ data, asOf, slideNumber, slideTotal, ...rest }) {
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const games = data?.odds?.games ?? [];

  // Top 4 best ATS + top 4 worst
  const best = (atsLeaders.best ?? []).slice(0, 4);
  const worst = (atsLeaders.worst ?? []).slice(0, 4);

  // Top 3 picks
  let topPicks = [];
  try {
    const picks = buildMaximusPicks({ games, atsLeaders });
    topPicks = [...(picks.atsPicks ?? []), ...(picks.mlPicks ?? [])].slice(0, 3);
  } catch { /* ignore */ }

  function recStr(row) {
    if (!row) return '—';
    const r = row.last30 || row.rec || row.season || null;
    if (!r) return '—';
    if (typeof r === 'string') return r;
    if (r.wins != null && r.losses != null) return `${r.wins}–${r.losses}`;
    return String(r);
  }

  const hasAts = best.length > 0 || worst.length > 0;

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="light"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 3}</div>
      <h2 className={styles.title}>ATS Leaders +<br />Top Leans</h2>
      <div className={styles.divider} />

      {/* Two column: best / worst ATS */}
      {hasAts && (
        <div className={styles.atsColumns}>
          <div className={styles.col}>
            <div className={styles.colLabel}>🔥 BEST ATS (L30)</div>
            {best.map((r, i) => (
              <div key={i} className={styles.atsRow}>
                <span className={styles.atsRank}>{i + 1}</span>
                <span className={styles.atsName}>{r.team || r.name || '—'}</span>
                <span className={styles.atsRec}>{recStr(r)}</span>
              </div>
            ))}
          </div>
          <div className={styles.col}>
            <div className={styles.colLabel}>❄️ WORST ATS (L30)</div>
            {worst.map((r, i) => (
              <div key={i} className={styles.atsRow}>
                <span className={styles.atsRank}>{i + 1}</span>
                <span className={styles.atsName}>{r.team || r.name || '—'}</span>
                <span className={`${styles.atsRec} ${styles.atsRecDown}`}>{recStr(r)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top picks */}
      {topPicks.length > 0 && (
        <div className={styles.picksSection}>
          <div className={styles.picksLabel}>TODAY&apos;S LEANS</div>
          <div className={styles.picksList}>
            {topPicks.map((p, i) => (
              <div key={i} className={styles.pickRow}>
                <span className={styles.pickType}>{p.type === 'ats' ? 'ATS' : 'ML'}</span>
                <span className={styles.pickLine}>{p.pickLine || '—'}</span>
                <span className={styles.pickConf}>{confidenceLabel(p.confidence)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topPicks.length === 0 && !hasAts && (
        <div className={styles.empty}>No qualified data available yet today.</div>
      )}
    </SlideShell>
  );
}
