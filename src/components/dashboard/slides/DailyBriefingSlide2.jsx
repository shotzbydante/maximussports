import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';
import styles from './DailyBriefingSlide2.module.css';
import SlideShell from './SlideShell';

export default function DailyBriefingSlide2({ data, asOf, ...rest }) {
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { atsPicks: [], mlPicks: [], totalsPicks: [] };
  try {
    picks = buildMaximusPicks({ games, atsLeaders });
  } catch {
    // silently ignore — show empty state
  }

  const topAts = (picks.atsPicks || []).slice(0, 2);
  const topMl  = (picks.mlPicks || []).slice(0, 1);
  const allPicks = [...topAts, ...topMl].slice(0, 3);

  const CONF_COLOR = {
    high:   { bg: 'rgba(45,138,110,0.18)', text: '#2d8a6e', border: 'rgba(45,138,110,0.35)' },
    medium: { bg: 'rgba(183,152,108,0.18)', text: '#8a6e35', border: 'rgba(183,152,108,0.35)' },
    low:    { bg: 'rgba(60,121,180,0.12)', text: '#3C79B4', border: 'rgba(60,121,180,0.25)' },
  };

  return (
    <SlideShell asOf={asOf} accentColor="#B7986C" rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>MAXIMUS PICKS</div>
        <h2 className={styles.title}>Today&rsquo;s<br />Strongest Leans</h2>
      </div>

      <div className={styles.divider} />

      {allPicks.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p className={styles.emptyTitle}>No qualified leans right now</p>
          <p className={styles.emptyText}>
            Check back closer to tip-off when lines sharpen.
          </p>
        </div>
      ) : (
        <div className={styles.picksList}>
          {allPicks.map((pick, i) => {
            const conf = (pick.confidence === 2 ? 'high' : pick.confidence === 1 ? 'medium' : 'low');
            const c = CONF_COLOR[conf] || CONF_COLOR.low;
            const isAts = pick.type === 'ats' || pick.atsEdge != null;
            return (
              <div key={i} className={styles.pickCard}>
                <div className={styles.pickTop}>
                  <span className={styles.pickType}>{isAts ? 'ATS' : 'ML'}</span>
                  <span
                    className={styles.confBadge}
                    style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                  >
                    {confidenceLabel(pick.confidence)}
                  </span>
                </div>
                <div className={styles.pickLine}>{pick.pickLine || '—'}</div>
                {(pick.atsEdge != null || pick.valueGap != null) && (
                  <div className={styles.pickEdge}>
                    Edge: {pick.atsEdge != null
                      ? `${(pick.atsEdge * 100).toFixed(0)}%`
                      : `+${(pick.valueGap * 100).toFixed(0)}%`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.disclaimer}>
        All leans are algorithmic. Not financial advice.
      </div>
    </SlideShell>
  );
}
