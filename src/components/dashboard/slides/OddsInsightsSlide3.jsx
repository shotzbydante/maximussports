import SlideShell from './SlideShell';
import styles from './OddsInsightsSlide3.module.css';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

const CONF_COLOR = {
  high:   { bg: 'rgba(45,138,110,0.18)', text: '#2d8a6e', border: 'rgba(45,138,110,0.35)' },
  medium: { bg: 'rgba(183,152,108,0.18)', text: '#B7986C', border: 'rgba(183,152,108,0.35)' },
  low:    { bg: 'rgba(60,121,180,0.12)', text: '#3C79B4', border: 'rgba(60,121,180,0.25)' },
};

function recStr(row) {
  if (!row) return '—';
  const r = row.last30 || row.rec || row.season || null;
  if (!r) return '—';
  if (typeof r === 'string') return r;
  if (r.wins != null && r.losses != null) return `${r.wins}–${r.losses}`;
  return String(r);
}

/**
 * Slide 3: ML Leans (4-slide mode) OR Totals + What to Watch (3-slide mode).
 * Determined by slideTotal prop.
 */
export default function OddsInsightsSlide3({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const { riskMode = 'standard', picksMode = 'top3' } = options;

  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { atsPicks: [], mlPicks: [], totalsPicks: [] };
  try {
    picks = buildMaximusPicks({ games, atsLeaders });
  } catch { /* ignore */ }

  // Apply risk mode filter to ML picks
  let mlPicks = picks.mlPicks ?? [];
  if (riskMode === 'conservative') {
    mlPicks = mlPicks.filter(p => {
      if (!p.mlPriceLabel) return true;
      const n = parseInt(p.mlPriceLabel.replace('+', ''), 10);
      return isNaN(n) || n <= 800;
    });
  }

  const totalsPicks = picks.totalsPicks ?? [];
  const best = (atsLeaders.best ?? []).slice(0, 3);
  const worst = (atsLeaders.worst ?? []).slice(0, 3);

  const isCombined = !slideTotal || slideTotal <= 3;

  if (!isCombined) {
    // 4-slide mode: ML leans only
    return (
      <SlideShell
        asOf={asOf}
        accentColor="#3C79B4"
        brandMode="standard"
        slideNumber={slideNumber}
        slideTotal={slideTotal}
        rest={rest}
      >
        <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 3}</div>
        <h2 className={styles.title}>Moneyline<br />Leans</h2>
        <div className={styles.divider} />

        {mlPicks.length === 0 ? (
          <div className={styles.empty}>No ML leans qualify today.{riskMode === 'conservative' ? ' (Conservative mode active)' : ''}</div>
        ) : (
          <div className={styles.mlList}>
            {mlPicks.slice(0, 3).map((p, i) => {
              const cs = CONF_COLOR[p.confidence === 2 ? 'high' : p.confidence === 1 ? 'medium' : 'low'] || CONF_COLOR.low;
              return (
                <div key={i} className={styles.mlCard}>
                  <div className={styles.mlCardTop}>
                    <span className={styles.mlBadge}>ML</span>
                    <span className={styles.mlPrice}>{p.mlPriceLabel}</span>
                    <span
                      className={styles.confBadge}
                      style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}
                    >
                      {confidenceLabel(p.confidence)}
                    </span>
                  </div>
                  <div className={styles.mlPickLine}>{p.pickTeam || p.pickLine || '—'}</div>
                  <div className={styles.mlMatchup}>{p.matchup}</div>
                  {p.whyValue && <div className={styles.mlWhy}>{p.whyValue}</div>}
                  {p.slipTips?.length > 0 && (
                    <div className={styles.slipTip}>{p.slipTips[0]}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.disclaimer}>Algorithmic leans. Not financial advice.</div>
      </SlideShell>
    );
  }

  // 3-slide mode: Totals + ATS context
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
      <h2 className={styles.title}>Totals +<br />Market Notes</h2>
      <div className={styles.divider} />

      {totalsPicks.length > 0 && (
        <div className={styles.totalsSection}>
          <div className={styles.sectionLabel}>O/U LINES</div>
          <div className={styles.totalsList}>
            {totalsPicks.slice(0, 3).map((p, i) => (
              <div key={i} className={styles.totalsRow}>
                <span className={styles.totalsMatchup}>{p.matchup}</span>
                <span className={styles.totalsLine}>{p.pickLine}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasAts ? (
        <div className={styles.atsSection}>
          <div className={styles.atsColumns}>
            <div className={styles.col}>
              <div className={styles.colLabel}>BEST ATS (L30)</div>
              {best.map((r, i) => (
                <div key={i} className={styles.atsRow}>
                  <span className={styles.atsRank}>{i + 1}</span>
                  <span className={styles.atsName}>{r.team || r.name || '—'}</span>
                  <span className={styles.atsRec}>{recStr(r)}</span>
                </div>
              ))}
            </div>
            <div className={styles.col}>
              <div className={styles.colLabel}>WORST ATS (L30)</div>
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
      ) : (
        <div className={styles.atsWarming}>
          <div className={styles.atsWarmingTitle}>ATS leaders warming</div>
          <div className={styles.atsWarmingText}>Coverage data populates throughout the day. Regenerate to check for updates.</div>
        </div>
      )}
    </SlideShell>
  );
}
