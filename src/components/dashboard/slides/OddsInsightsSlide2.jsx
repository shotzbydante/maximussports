import SlideShell from './SlideShell';
import styles from './OddsInsightsSlide2.module.css';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

const CONF_COLOR = {
  high:   { bg: 'rgba(45,138,110,0.18)', text: '#2d8a6e', border: 'rgba(45,138,110,0.35)' },
  medium: { bg: 'rgba(183,152,108,0.18)', text: '#B7986C', border: 'rgba(183,152,108,0.35)' },
  low:    { bg: 'rgba(60,121,180,0.12)', text: '#3C79B4', border: 'rgba(60,121,180,0.25)' },
};

function confStyle(level) {
  return CONF_COLOR[level === 2 ? 'high' : level === 1 ? 'medium' : 'low'] || CONF_COLOR.low;
}

function PickRow({ pick }) {
  const cs = confStyle(pick.confidence);
  return (
    <div className={styles.pickRow}>
      <div className={styles.pickTop}>
        <span className={styles.pickType}>ATS</span>
        <span
          className={styles.confBadge}
          style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}
        >
          {confidenceLabel(pick.confidence)}
        </span>
      </div>
      <div className={styles.pickLine}>{pick.pickLine || '—'}</div>
      {pick.whyValue && (
        <div className={styles.whyValue}>{pick.whyValue}</div>
      )}
      {pick.slipTips?.length > 0 && (
        <div className={styles.slipTip}>{pick.slipTips[0]}</div>
      )}
    </div>
  );
}

function MlPickRow({ pick }) {
  const cs = confStyle(pick.confidence);
  return (
    <div className={styles.pickRow}>
      <div className={styles.pickTop}>
        <span className={`${styles.pickType} ${styles.pickTypeML}`}>ML</span>
        <span className={styles.mlPrice}>{pick.mlPriceLabel}</span>
        <span
          className={styles.confBadge}
          style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}
        >
          {confidenceLabel(pick.confidence)}
        </span>
      </div>
      <div className={styles.pickLine}>{pick.pickTeam || '—'}</div>
      {pick.whyValue && (
        <div className={styles.whyValue}>{pick.whyValue}</div>
      )}
    </div>
  );
}

/**
 * Slide 2: ATS Leans (4-slide mode) OR ATS+ML combined (3-slide mode).
 * Determined by slideTotal prop.
 */
export default function OddsInsightsSlide2({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const { riskMode = 'standard', picksMode = 'top3' } = options;

  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { atsPicks: [], mlPicks: [] };
  try {
    picks = buildMaximusPicks({ games, atsLeaders });
  } catch { /* ignore */ }

  const maxPicks = picksMode === 'full' ? 5 : 3;

  // ATS picks — no risk filter needed for ATS
  const atsPicks = (picks.atsPicks ?? []).slice(0, maxPicks);

  // ML picks — apply risk mode filter (conservative hides odds > +800)
  let mlPicks = picks.mlPicks ?? [];
  if (riskMode === 'conservative') {
    mlPicks = mlPicks.filter(p => {
      if (!p.mlPriceLabel) return true;
      const n = parseInt(p.mlPriceLabel.replace('+', ''), 10);
      return isNaN(n) || n <= 800;
    });
  }

  const isCombined = !slideTotal || slideTotal <= 3;

  if (isCombined) {
    // Combined mode: 2 ATS + 2 ML
    const atsShow = atsPicks.slice(0, 2);
    const mlShow = mlPicks.slice(0, 2);
    const hasPicks = atsShow.length > 0 || mlShow.length > 0;

    return (
      <SlideShell
        asOf={asOf}
        accentColor="#B7986C"
        brandMode="standard"
        slideNumber={slideNumber}
        slideTotal={slideTotal}
        rest={rest}
      >
        <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 2}</div>
        <h2 className={styles.title}>ATS + ML<br />Leans</h2>
        <div className={styles.divider} />

        {!hasPicks ? (
          <div className={styles.empty}>No qualified leans available yet.</div>
        ) : (
          <div className={styles.combinedGrid}>
            {atsShow.length > 0 && (
              <div className={styles.colSection}>
                <div className={styles.colLabel}>ATS LEANS</div>
                <div className={styles.picksList}>
                  {atsShow.map((p, i) => <PickRow key={i} pick={p} />)}
                </div>
              </div>
            )}
            {mlShow.length > 0 && (
              <div className={styles.colSection}>
                <div className={styles.colLabel}>ML LEANS</div>
                <div className={styles.picksList}>
                  {mlShow.map((p, i) => <MlPickRow key={i} pick={p} />)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.disclaimer}>Algorithmic leans. Not financial advice.</div>
      </SlideShell>
    );
  }

  // 4-slide mode: ATS only
  return (
    <SlideShell
      asOf={asOf}
      accentColor="#B7986C"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 2}</div>
      <h2 className={styles.title}>ATS<br />Leans</h2>
      <div className={styles.divider} />

      {atsPicks.length === 0 ? (
        <div className={styles.empty}>No ATS leans qualify today.</div>
      ) : (
        <div className={styles.picksList}>
          {atsPicks.slice(0, 3).map((p, i) => <PickRow key={i} pick={p} />)}
        </div>
      )}

      <div className={styles.disclaimer}>Algorithmic leans. Not financial advice.</div>
    </SlideShell>
  );
}
