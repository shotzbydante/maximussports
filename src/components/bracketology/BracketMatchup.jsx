import { useState } from 'react';
import { getConfidenceTier, getBracketTier } from '../../utils/confidenceTier';
import styles from './BracketMatchup.module.css';

export default function BracketMatchup({
  matchup,
  userPick,
  pickOrigin,
  prediction,
  onPick,
  onMaximusPick,
  compact = false,
  showCompare = false,
  maximusPick = null,
}) {
  const { topTeam, bottomTeam, matchupId, status, winner } = matchup;
  const [showTooltip, setShowTooltip] = useState(false);

  const topSelected = userPick === 'top' || userPick === topTeam?.slug || userPick === topTeam?.teamId;
  const bottomSelected = userPick === 'bottom' || userPick === bottomTeam?.slug || userPick === bottomTeam?.teamId;
  const hasResult = winner != null;
  const isReady = status === 'ready' || status === 'final' || status === 'live';
  const isWaiting = status === 'waiting';

  const isDivergent = showCompare && maximusPick && userPick && maximusPick !== userPick;
  const confLabel = prediction?.confidenceLabel;

  const tier = prediction
    ? getConfidenceTier(prediction.winProbability, prediction.isUpset)
    : null;

  const bracketTier = prediction ? getBracketTier(prediction) : null;

  function handlePick(position) {
    if (isWaiting) return;
    const team = position === 'top' ? topTeam : bottomTeam;
    if (!team?.slug && !team?.teamId && team?.isPlaceholder) return;
    onPick(matchupId, position);
  }

  function handleMaximus(e) {
    e.stopPropagation();
    if (prediction && onMaximusPick) {
      const position = prediction.winner === topTeam ? 'top' : 'bottom';
      onMaximusPick(matchupId, position);
    }
  }

  return (
    <div
      className={`
        ${styles.matchup}
        ${compact ? styles.compact : ''}
        ${isWaiting ? styles.waiting : ''}
        ${isDivergent ? styles.divergent : ''}
      `}
      onMouseEnter={() => prediction && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {isDivergent && <span className={styles.divergeBadge} title="Your pick differs from Maximus">DIFF</span>}

      <TeamSlot
        team={topTeam}
        selected={topSelected}
        hasResult={hasResult}
        isWinner={winner === topTeam?.slug}
        isWaiting={isWaiting}
        pickOrigin={topSelected ? pickOrigin : null}
        isMaximusPick={showCompare && maximusPick === 'top'}
        onClick={() => handlePick('top')}
      />

      <div className={styles.divider}>
        {prediction && isReady && (
          <div className={styles.dividerActions}>
            <button
              className={`${styles.maximusBtn} ${pickOrigin === 'maximus' ? styles.maximusBtnActive : ''}`}
              onClick={handleMaximus}
              title={`Use Maximus: ${prediction.winner?.shortName || prediction.winner?.name} (${confLabel})`}
            >
              <span className={styles.maximusIcon}>◆</span>
              <span className={styles.maximusBtnLabel}>Maximus</span>
            </button>
            {bracketTier && (
              <span
                className={`${styles.tierChip} ${styles[bracketTier.cssClass]}`}
                title={`${bracketTier.label} — ${Math.round((prediction.winProbability ?? 0.5) * 100)}%`}
              >
                {bracketTier.indicator && <span className={styles.tierIndicator}>{bracketTier.indicator}</span>}
                <span className={styles.tierIcon}>{bracketTier.icon}</span>
                <span className={styles.tierLabel}>{bracketTier.label}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <TeamSlot
        team={bottomTeam}
        selected={bottomSelected}
        hasResult={hasResult}
        isWinner={winner === bottomTeam?.slug}
        isWaiting={isWaiting}
        pickOrigin={bottomSelected ? pickOrigin : null}
        isMaximusPick={showCompare && maximusPick === 'bottom'}
        onClick={() => handlePick('bottom')}
      />

      {showTooltip && prediction && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipHeader}>
            <span className={styles.tooltipWinner}>{prediction.winner?.shortName || prediction.winner?.name}</span>
            {bracketTier && (
              <span className={`${styles.tooltipConf} ${styles[bracketTier.cssClass]}`}>{bracketTier.label}</span>
            )}
          </div>
          {prediction.winProbability != null && (
            <span className={styles.tooltipProb}>
              {Math.round(prediction.winProbability * 100)}% win probability
            </span>
          )}
          {prediction.bracketTierLabel && (
            <span className={styles.tooltipTier}>
              {prediction.bracketTierLabel}
            </span>
          )}
          {prediction.isUpset && (
            <span className={styles.tooltipUpset}>
              Upset: {prediction.winner?.seed}-seed over {prediction.loser?.seed}-seed
            </span>
          )}
          {prediction.upsetTrigger && (
            <span className={styles.tooltipUpsetTrigger}>{prediction.upsetTrigger.signal}</span>
          )}
          {prediction.signals?.length > 0 && (
            <span className={styles.tooltipSignal}>{prediction.signals[0]}</span>
          )}
          {prediction.signals?.length > 1 && (
            <span className={styles.tooltipSignal}>{prediction.signals[1]}</span>
          )}
          {prediction.tournamentPrior?.applied && (
            <span className={styles.tooltipSignal}>{prediction.tournamentPrior.rationale}</span>
          )}
        </div>
      )}
    </div>
  );
}

function TeamSlot({ team, selected, hasResult, isWinner, isWaiting, pickOrigin, isMaximusPick, onClick }) {
  const isEmpty = !team || team.isPlaceholder;
  const isClickable = !isEmpty && !isWaiting;

  return (
    <button
      type="button"
      className={`
        ${styles.teamSlot}
        ${selected ? styles.selected : ''}
        ${isWinner ? styles.winner : ''}
        ${hasResult && !isWinner ? styles.eliminated : ''}
        ${isEmpty ? styles.empty : ''}
        ${isClickable ? styles.clickable : ''}
        ${pickOrigin === 'maximus' ? styles.maximusPicked : ''}
        ${isMaximusPick && !selected ? styles.maximusWouldPick : ''}
      `}
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
    >
      <span className={styles.seed}>{team?.seed ?? '—'}</span>
      {team?.logo && !isEmpty && (
        <img
          src={team.logo}
          alt=""
          className={styles.teamLogo}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      <span className={styles.teamName}>
        {isEmpty ? (isWaiting ? '...' : 'TBD') : (team.shortName || team.name)}
      </span>
      {selected && (
        <span className={`${styles.pickBadge} ${pickOrigin === 'maximus' ? styles.pickBadgeMaximus : ''}`}>
          {pickOrigin === 'maximus' ? '◆' : '✓'}
        </span>
      )}
    </button>
  );
}
