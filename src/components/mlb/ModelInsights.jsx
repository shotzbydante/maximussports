/**
 * ModelInsights — actionable intelligence cards derived from season model data.
 * Shows 5 high-signal insights: Best Value, Overvalued, High Variance,
 * Strongest Floor, Model Outlier.
 */
import { useMemo } from 'react';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import styles from './ModelInsights.module.css';

function deriveInsights(teams) {
  if (!teams.length) return [];

  const byDeltaPos = [...teams].sort((a, b) => (b.marketDelta || 0) - (a.marketDelta || 0));
  const byDeltaNeg = [...teams].sort((a, b) => (a.marketDelta || 0) - (b.marketDelta || 0));
  const byRange = [...teams].sort((a, b) => (b.ceiling - b.floor) - (a.ceiling - a.floor));
  const byFloor = [...teams].sort((a, b) => b.floor - a.floor);
  // Model outlier = biggest absolute delta
  const byAbsDelta = [...teams].sort((a, b) => Math.abs(b.marketDelta || 0) - Math.abs(a.marketDelta || 0));

  const best = byDeltaPos[0];
  const over = byDeltaNeg[0];
  const vol = byRange[0];
  const flr = byFloor[0];
  const outlier = byAbsDelta.find(t => t.slug !== best.slug && t.slug !== over.slug) || byAbsDelta[0];

  return [
    {
      type: 'value',
      label: 'Best Value',
      tag: 'Model likes more than market',
      team: best,
      metric: `+${best.marketDelta}`,
      metricLabel: 'vs market',
      detail: `${best.projectedWins}W proj · ${best.marketWinTotal ?? '—'} mkt line`,
      color: 'green',
    },
    {
      type: 'overvalued',
      label: 'Market Premium',
      tag: 'Market above model',
      team: over,
      metric: `${over.marketDelta}`,
      metricLabel: 'vs market',
      detail: `${over.projectedWins}W proj · ${over.marketWinTotal ?? '—'} mkt line`,
      color: 'red',
    },
    {
      type: 'variance',
      label: 'Widest Range',
      tag: 'Most uncertain outcome',
      team: vol,
      metric: `${vol.ceiling - vol.floor}W`,
      metricLabel: 'spread',
      detail: `${vol.floor}–${vol.ceiling} range · ${vol.confidenceTier} conf.`,
      color: 'amber',
    },
    {
      type: 'floor',
      label: 'Strongest Floor',
      tag: 'Safest contender profile',
      team: flr,
      metric: `${flr.floor}W`,
      metricLabel: 'floor',
      detail: `${flr.projectedWins}W proj · ${flr.confidenceTier} conf.`,
      color: 'green',
    },
    {
      type: 'outlier',
      label: 'Model Outlier',
      tag: 'Biggest model vs consensus gap',
      team: outlier,
      metric: `${outlier.marketDelta > 0 ? '+' : ''}${outlier.marketDelta}`,
      metricLabel: 'vs market',
      detail: `${outlier.projectedWins}W proj · ${outlier.signals?.[0] || ''}`,
      color: outlier.marketDelta > 0 ? 'teal' : 'amber',
    },
  ];
}

export default function ModelInsights({ teams }) {
  const insights = useMemo(() => deriveInsights(teams), [teams]);

  if (!insights.length) return null;

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>Model Insights</h3>
        <span className={styles.subtitle}>Actionable signals from the projection engine</span>
      </div>
      <div className={styles.grid}>
        {insights.map(ins => {
          const logo = getMlbEspnLogoUrl(ins.team.slug);
          return (
            <div key={ins.type} className={`${styles.card} ${styles[`c_${ins.color}`] || ''}`}>
              <span className={styles.cardLabel}>{ins.label}</span>
              <div className={styles.cardTeam}>
                {logo && <img src={logo} alt="" className={styles.cardLogo} width={22} height={22} loading="lazy" />}
                <span className={styles.cardName}>{ins.team.name}</span>
              </div>
              <div className={styles.cardMetric}>
                <span className={styles.cardMetricVal}>{ins.metric}</span>
                <span className={styles.cardMetricLbl}>{ins.metricLabel}</span>
              </div>
              <span className={styles.cardDetail}>{ins.detail}</span>
              <span className={styles.cardTag}>{ins.tag}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
