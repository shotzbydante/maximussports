import SlideShell from './SlideShell';
import styles from './OddsInsightsSlide4.module.css';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';

function recStr(row) {
  if (!row) return '—';
  const r = row.last30 || row.rec || row.season || null;
  if (!r) return '—';
  if (typeof r === 'string') return r;
  if (r.wins != null && r.losses != null) return `${r.wins}–${r.losses}`;
  return String(r);
}

/**
 * Slide 4 (4-slide mode only): Totals informational + quick market notes (ATS leaders).
 */
export default function OddsInsightsSlide4({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { totalsPicks: [] };
  try {
    picks = buildMaximusPicks({ games, atsLeaders });
  } catch { /* ignore */ }

  const totalsPicks = picks.totalsPicks ?? [];
  const best = (atsLeaders.best ?? []).slice(0, 4);
  const worst = (atsLeaders.worst ?? []).slice(0, 4);
  const hasAts = best.length > 0 || worst.length > 0;

  // Quick market stats
  const gamesWithOdds = games.filter(g => g.spread != null || g.homeSpread != null || g.total != null);
  const totalsArr = gamesWithOdds.map(g => parseFloat(g.total ?? 0)).filter(x => x > 0);
  const medTotal = totalsArr.length > 0
    ? totalsArr.sort((a, b) => a - b)[Math.floor(totalsArr.length / 2)]
    : null;

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="light"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 4}</div>
      <h2 className={styles.title}>Totals &amp;<br />Market Notes</h2>
      <div className={styles.divider} />

      {/* Totals list */}
      {totalsPicks.length > 0 && (
        <div className={styles.totalsSection}>
          <div className={styles.sectionLabel}>
            O/U LINES
            {medTotal ? <span className={styles.medLabel}> · Median: {medTotal.toFixed(1)}</span> : null}
          </div>
          <div className={styles.totalsList}>
            {totalsPicks.slice(0, 4).map((p, i) => (
              <div key={i} className={styles.totalsRow}>
                <span className={styles.totalsMatchup}>{p.matchup}</span>
                <span className={styles.totalsLine}>{p.pickLine}</span>
              </div>
            ))}
          </div>
          <div className={styles.totalsNote}>
            Totals are informational — no model projection delta yet.
          </div>
        </div>
      )}

      {/* ATS leaders */}
      {hasAts && (
        <div className={styles.atsSection}>
          <div className={styles.sectionLabel}>ATS LEADERS (L30)</div>
          <div className={styles.atsColumns}>
            <div className={styles.col}>
              {best.map((r, i) => (
                <div key={i} className={styles.atsRow}>
                  <span className={styles.atsRank}>{i + 1}</span>
                  <span className={styles.atsName}>{r.team || r.name || '—'}</span>
                  <span className={styles.atsRec}>{recStr(r)}</span>
                </div>
              ))}
            </div>
            <div className={styles.col}>
              {worst.map((r, i) => (
                <div key={i} className={styles.atsRow}>
                  <span className={styles.atsRank}>{i + 1}</span>
                  <span className={styles.atsName}>{r.team || r.name || '—'}</span>
                  <span className={`${styles.atsRec} ${styles.atsRecDown}`}>{recStr(r)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!hasAts && totalsPicks.length === 0 && (
        <div className={styles.empty}>Market data loading. Check back closer to tip-off.</div>
      )}
    </SlideShell>
  );
}
