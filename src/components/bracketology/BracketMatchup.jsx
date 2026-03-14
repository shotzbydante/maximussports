import styles from './BracketMatchup.module.css';

export default function BracketMatchup({
  matchup,
  userPick,
  pickOrigin,
  prediction,
  onPick,
  onMaximusPick,
  isPreSelection,
  compact = false,
}) {
  const { topTeam, bottomTeam, matchupId, status, winner } = matchup;

  const topSelected = userPick === 'top' || userPick === topTeam?.slug || userPick === topTeam?.teamId;
  const bottomSelected = userPick === 'bottom' || userPick === bottomTeam?.slug || userPick === bottomTeam?.teamId;
  const hasResult = winner != null;
  const isReady = status === 'ready' || status === 'final' || status === 'live';
  const isWaiting = status === 'waiting';

  function handlePick(position) {
    if (isPreSelection || isWaiting) return;
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
    <div className={`${styles.matchup} ${compact ? styles.compact : ''} ${isWaiting ? styles.waiting : ''}`}>
      <TeamSlot
        team={topTeam}
        selected={topSelected}
        hasResult={hasResult}
        isWinner={winner === topTeam?.slug}
        isPreSelection={isPreSelection}
        isWaiting={isWaiting}
        pickOrigin={topSelected ? pickOrigin : null}
        onClick={() => handlePick('top')}
      />
      <div className={styles.divider}>
        {prediction && isReady && !isPreSelection && (
          <button
            className={styles.maximusBtn}
            onClick={handleMaximus}
            title={`Maximus pick: ${prediction.winner?.shortName || prediction.winner?.name} (${prediction.confidenceLabel})`}
          >
            <span className={styles.maximusIcon}>◆</span>
          </button>
        )}
      </div>
      <TeamSlot
        team={bottomTeam}
        selected={bottomSelected}
        hasResult={hasResult}
        isWinner={winner === bottomTeam?.slug}
        isPreSelection={isPreSelection}
        isWaiting={isWaiting}
        pickOrigin={bottomSelected ? pickOrigin : null}
        onClick={() => handlePick('bottom')}
      />
    </div>
  );
}

function TeamSlot({ team, selected, hasResult, isWinner, isPreSelection, isWaiting, pickOrigin, onClick }) {
  const isEmpty = !team || team.isPlaceholder;
  const isClickable = !isEmpty && !isPreSelection && !isWaiting;

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
      `}
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
    >
      <span className={styles.seed}>
        {team?.seed ?? '—'}
      </span>
      {team?.logo && !isEmpty && (
        <img
          src={team.logo}
          alt=""
          className={styles.teamLogo}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      <span className={styles.teamName}>
        {isEmpty
          ? (isPreSelection ? 'TBD' : (isWaiting ? 'Winner of…' : 'TBD'))
          : (team.shortName || team.name)
        }
      </span>
      {selected && (
        <span className={styles.pickBadge}>
          {pickOrigin === 'maximus' ? '◆' : '✓'}
        </span>
      )}
    </button>
  );
}
