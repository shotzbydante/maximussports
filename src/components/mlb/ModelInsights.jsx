/**
 * ModelInsights — actionable intelligence cards derived from season model data.
 * 7 high-signal insights. Each card is clickable → scrolls to team in the board.
 */
import { useMemo } from 'react';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import styles from './ModelInsights.module.css';

function deriveInsights(teams) {
  if (!teams.length) return [];

  const byWins = [...teams].sort((a, b) => b.projectedWins - a.projectedWins);
  const byDeltaPos = [...teams].sort((a, b) => (b.marketDelta || 0) - (a.marketDelta || 0));
  const byDeltaNeg = [...teams].sort((a, b) => (a.marketDelta || 0) - (b.marketDelta || 0));
  const byRange = [...teams].sort((a, b) => (b.ceiling - b.floor) - (a.ceiling - a.floor));
  const byFloor = [...teams].sort((a, b) => b.floor - a.floor);
  const byConf = [...teams].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  const top = byWins[0];
  const best = byDeltaPos[0];
  const over = byDeltaNeg[0];
  const vol = byRange[0];
  const flr = byFloor[0];
  const conf = byConf[0];
  // Outlier: biggest absolute delta, excluding best/over
  const outlier = [...teams]
    .sort((a, b) => Math.abs(b.marketDelta || 0) - Math.abs(a.marketDelta || 0))
    .find(t => t.slug !== best.slug && t.slug !== over.slug) || best;

  return [
    {
      type: 'top',
      label: 'Top Projection',
      tag: 'Highest model win total',
      team: top,
      metric: `${top.projectedWins}W`,
      metricLabel: 'projected',
      detail: `${top.floor}–${top.ceiling} range · ${top.champOdds} WS`,
      color: 'accent',
      valueLean: null,
    },
    {
      type: 'value',
      label: 'Best Value',
      tag: 'Win total lean: Over',
      team: best,
      metric: `+${best.marketDelta}`,
      metricLabel: 'vs market',
      detail: `${best.projectedWins}W proj · ${best.marketWinTotal ?? '—'} mkt line`,
      color: 'green',
      valueLean: 'Futures value watch',
    },
    {
      type: 'overvalued',
      label: 'Market Premium',
      tag: 'Win total lean: Under',
      team: over,
      metric: `${over.marketDelta}`,
      metricLabel: 'vs market',
      detail: `${over.projectedWins}W proj · ${over.marketWinTotal ?? '—'} mkt line`,
      color: 'red',
      valueLean: 'Market appears rich',
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
      valueLean: null,
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
      valueLean: 'Strong floor vs title price',
    },
    {
      type: 'confidence',
      label: 'Highest Confidence',
      tag: 'Most stable projection',
      team: conf,
      metric: conf.confidenceTier,
      metricLabel: 'confidence',
      detail: `${conf.projectedWins}W proj · ${conf.floor}–${conf.ceiling}`,
      color: 'navy',
      valueLean: null,
    },
    {
      type: 'outlier',
      label: 'Model Outlier',
      tag: outlier.marketDelta > 0 ? 'Model significantly above market' : 'Model significantly below market',
      team: outlier,
      metric: `${outlier.marketDelta > 0 ? '+' : ''}${outlier.marketDelta}`,
      metricLabel: 'vs market',
      detail: `${outlier.projectedWins}W proj · ${outlier.signals?.[0] || ''}`,
      color: outlier.marketDelta > 0 ? 'teal' : 'amber',
      valueLean: 'Consensus divergence',
    },
  ];
}

export default function ModelInsights({ teams, onTeamClick }) {
  const insights = useMemo(() => deriveInsights(teams), [teams]);

  if (!insights.length) return null;

  const handleClick = (slug) => {
    if (onTeamClick) onTeamClick(slug);
  };

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>Model Insights</h3>
        <span className={styles.subtitle}>Actionable signals from the Maximus projection engine</span>
      </div>
      <div className={styles.grid}>
        {insights.map(ins => {
          const logo = getMlbEspnLogoUrl(ins.team.slug);
          return (
            <button
              key={ins.type}
              type="button"
              className={`${styles.card} ${styles[`c_${ins.color}`] || ''}`}
              onClick={() => handleClick(ins.team.slug)}
            >
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
              {ins.valueLean && (
                <span className={styles.cardValueLean}>{ins.valueLean}</span>
              )}
              <span className={styles.cardTag}>{ins.tag}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
