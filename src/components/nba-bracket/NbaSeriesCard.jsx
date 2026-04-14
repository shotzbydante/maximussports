/**
 * NbaSeriesCard — renders a single playoff series matchup.
 * Shows seeds, logos, team names, series score, spread, and prediction.
 */
import styles from './NbaSeriesCard.module.css';

export default function NbaSeriesCard({ matchup, prediction, userPick, onPick, compact = false }) {
  if (!matchup) return null;
  const { topTeam, bottomTeam, matchupId, status, seriesScore, spread, network, startDate } = matchup;
  const isWaiting = status === 'waiting';
  const topSelected = userPick === 'top';
  const bottomSelected = userPick === 'bottom';

  function handlePick(position) {
    if (isWaiting) return;
    const team = position === 'top' ? topTeam : bottomTeam;
    if (!team || team.isPlaceholder) return;
    onPick(matchupId, position);
  }

  const confTier = prediction?.confidenceLabel;

  return (
    <div className={`${styles.card} ${isWaiting ? styles.cardWaiting : ''} ${compact ? styles.cardCompact : ''}`}>
      {/* Spread badge */}
      {spread && <span className={styles.spreadBadge}>{spread}</span>}

      {/* Top team */}
      <button
        type="button"
        className={`${styles.teamSlot} ${topSelected ? styles.teamSelected : ''}`}
        onClick={() => handlePick('top')}
        disabled={isWaiting || topTeam?.isPlaceholder}
      >
        {topTeam?.logo && <img src={topTeam.logo} alt="" className={styles.logo} width={20} height={20} loading="lazy" />}
        <span className={styles.seed}>{topTeam?.seed ?? ''}</span>
        <span className={styles.teamName}>{topTeam?.shortName || topTeam?.name || 'TBD'}</span>
        {seriesScore && !topTeam?.isPlaceholder && (
          <span className={styles.seriesWins}>{seriesScore.top}</span>
        )}
      </button>

      {/* Bottom team */}
      <button
        type="button"
        className={`${styles.teamSlot} ${bottomSelected ? styles.teamSelected : ''}`}
        onClick={() => handlePick('bottom')}
        disabled={isWaiting || bottomTeam?.isPlaceholder}
      >
        {bottomTeam?.logo && <img src={bottomTeam.logo} alt="" className={styles.logo} width={20} height={20} loading="lazy" />}
        <span className={styles.seed}>{bottomTeam?.seed ?? ''}</span>
        <span className={styles.teamName}>{bottomTeam?.shortName || bottomTeam?.name || 'TBD'}</span>
        {seriesScore && !bottomTeam?.isPlaceholder && (
          <span className={styles.seriesWins}>{seriesScore.bottom}</span>
        )}
      </button>

      {/* Meta row */}
      <div className={styles.meta}>
        {startDate && <span className={styles.metaDate}>{startDate}</span>}
        {network && <span className={styles.metaNetwork}>{network}</span>}
        {prediction && (
          <span className={`${styles.predBadge} ${styles[`pred${confTier}`] || ''}`}>
            {prediction.seriesCall}
          </span>
        )}
      </div>
    </div>
  );
}
