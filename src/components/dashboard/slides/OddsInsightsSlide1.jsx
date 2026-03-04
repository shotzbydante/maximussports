import SlideShell from './SlideShell';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';
import styles from './OddsInsightsSlide1.module.css';

export default function OddsInsightsSlide1({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { atsPicks: [], mlPicks: [], totalsPicks: [] };
  try {
    picks = buildMaximusPicks({ games, atsLeaders });
  } catch { /* ignore */ }

  const atsPicks = picks.atsPicks ?? [];
  const mlPicks = picks.mlPicks ?? [];
  const totalsPicks = picks.totalsPicks ?? [];
  const allPicks = [...atsPicks, ...mlPicks];
  const totalCount = allPicks.length;

  const strongestPick = allPicks.reduce((best, p) =>
    (p.confidence ?? 0) > (best?.confidence ?? -1) ? p : best, null);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  const CONF_COLOR = {
    high:   { bg: 'rgba(45,138,110,0.18)', text: '#2d8a6e', border: 'rgba(45,138,110,0.35)' },
    medium: { bg: 'rgba(183,152,108,0.18)', text: '#B7986C', border: 'rgba(183,152,108,0.35)' },
    low:    { bg: 'rgba(60,121,180,0.12)', text: '#3C79B4', border: 'rgba(60,121,180,0.25)' },
  };

  const confKey = strongestPick
    ? (strongestPick.confidence === 2 ? 'high' : strongestPick.confidence === 1 ? 'medium' : 'low')
    : 'low';
  const confStyle = CONF_COLOR[confKey];

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.datePill}>{today}</div>
      <div className={styles.titleSup}>MAXIMUS PICKS</div>
      <h2 className={styles.title}>Today&apos;s<br />Picks Card</h2>
      <div className={styles.divider} />

      {totalCount === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p className={styles.emptyTitle}>No qualified leans today</p>
          <p className={styles.emptyText}>The model found no edges meeting its threshold. Check back closer to tip-off.</p>
        </div>
      ) : (
        <>
          <div className={styles.countGrid}>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{totalCount}</span>
              <span className={styles.countLabel}>Total Leans</span>
            </div>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{atsPicks.length}</span>
              <span className={styles.countLabel}>ATS</span>
            </div>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{mlPicks.length}</span>
              <span className={styles.countLabel}>Moneyline</span>
            </div>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{totalsPicks.length}</span>
              <span className={styles.countLabel}>Totals</span>
            </div>
          </div>

          {strongestPick && (
            <div className={styles.featuredPick}>
              <div className={styles.featuredLabel}>STRONGEST LEAN</div>
              <div className={styles.featuredLine}>{strongestPick.pickLine}</div>
              {strongestPick.whyValue && (
                <div className={styles.featuredWhy}>{strongestPick.whyValue}</div>
              )}
              <div className={styles.featuredConf}>
                <span
                  className={styles.confBadge}
                  style={{ background: confStyle.bg, color: confStyle.text, border: `1px solid ${confStyle.border}` }}
                >
                  {confidenceLabel(strongestPick.confidence)} Confidence
                </span>
              </div>
            </div>
          )}
        </>
      )}

      <div className={styles.disclaimer}>Algorithmic leans only. Not financial advice. 21+</div>
    </SlideShell>
  );
}
