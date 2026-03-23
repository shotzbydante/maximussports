/**
 * MlbModelOutlook — reusable team-level Maximus model projection module.
 *
 * Renders a premium "Maximus Projection" card showing projected wins,
 * range, confidence, badges, drivers, and rationale for a single team.
 * Pulls from the same season-model source of truth as the board.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import MaximusModelIcon from './MaximusModelIcon';
import { getTeamProjection } from '../../data/mlb/seasonModel';
import styles from './MlbModelOutlook.module.css';

const BADGE_CLS = {
  'Stable Contender': 'bGreen', 'Market Favorite': 'bBlue', 'Model Overweight': 'bTeal',
  'Quiet Value': 'bTeal', 'Rotation-Led': 'bBlue', 'Balanced Depth': 'bGreen',
  'Fragile Upside': 'bAmber', 'High Variance': 'bAmber', 'Bullpen Risk': 'bAmber',
  'Top-Heavy': 'bAmber', 'Division Grinder': 'bDefault', 'Volatile Middle': 'bDefault',
  'Prospect Rich': 'bTeal', 'Rebuild Watch': 'bRed', 'Developing': 'bDefault',
};

export default function MlbModelOutlook({ teamSlug }) {
  const { buildPath } = useWorkspace();
  const proj = useMemo(() => getTeamProjection(teamSlug), [teamSlug]);

  if (!proj) return null;

  const tk = proj.takeaways || {};
  const dCls = proj.marketDelta > 0 ? styles.up : proj.marketDelta < 0 ? styles.dn : '';

  return (
    <section className={styles.outlook}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <MaximusModelIcon size={15} className={styles.icon} />
          <h3 className={styles.title}>Maximus Projection</h3>
        </div>
        <Link to={buildPath('/season-model')} className={styles.modelLink}>
          Full Season Model &rarr;
        </Link>
      </div>

      <div className={styles.body}>
        {/* Hero stat + range */}
        <div className={styles.heroCluster}>
          <div className={styles.heroWins}>
            <span className={styles.heroNum}>{proj.projectedWins}</span>
            <span className={styles.heroLabel}>Projected Wins</span>
          </div>
          <div className={styles.rangeCluster}>
            <div className={styles.rangeStat}>
              <span className={styles.rangeVal}>{proj.floor}</span>
              <span className={styles.rangeLbl}>Floor</span>
            </div>
            <span className={styles.rangeDash}>–</span>
            <div className={styles.rangeStat}>
              <span className={styles.rangeVal}>{proj.ceiling}</span>
              <span className={styles.rangeLbl}>Ceiling</span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statCell}>
            <span className={styles.statLbl}>Playoff</span>
            <span className={styles.statVal}>{proj.playoffProb ?? '—'}%</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLbl}>Confidence</span>
            <span className={styles.statVal}>{proj.confidenceTier}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLbl}>vs Market</span>
            <span className={`${styles.statVal} ${dCls}`}>
              {proj.marketDelta > 0 ? '+' : ''}{proj.marketDelta}
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLbl}>Outlook</span>
            <span className={styles.statVal}>{proj.divOutlook}</span>
          </div>
        </div>

        {/* Badges */}
        <div className={styles.badgeRow}>
          {proj.signals?.map(s => (
            <span key={s} className={`${styles.badge} ${styles[BADGE_CLS[s]] || styles.bDefault}`}>{s}</span>
          ))}
        </div>

        {/* Takeaways */}
        <div className={styles.takeaways}>
          <span className={styles.tk}><b>Driver:</b> {tk.strongestDriver}</span>
          <span className={styles.tk}><b>Drag:</b> {tk.biggestDrag}</span>
          <span className={styles.tk}><b>Depth:</b> {tk.depthProfile}</span>
          <span className={styles.tk}><b>Risk:</b> {tk.riskProfile}</span>
        </div>

        {/* Rationale */}
        <p className={styles.rationale}>{proj.rationale}</p>
      </div>
    </section>
  );
}
