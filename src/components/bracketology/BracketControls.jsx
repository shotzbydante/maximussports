import styles from './BracketControls.module.css';

function getBracketSourceLabel(bracketMode) {
  if (bracketMode === 'official') return 'Official ESPN';
  if (bracketMode === 'official_partial') return 'Partial ESPN data';
  return 'Projected (fallback)';
}

function getBracketSourceStyle(bracketMode) {
  if (bracketMode === 'official') return styles.officialTag;
  if (bracketMode === 'official_partial') return styles.partialTag;
  return styles.projectedTag;
}

export default function BracketControls({
  saveStatus,
  lastSaved,
  totalPicks,
  totalGames,
  bracketMode,
  bracketMeta,
  onAutoFill,
  onResetToMaximus,
  onClearBracket,
  onClearRound,
  onToggleCompare,
  showCompare,
}) {
  const timeStr = lastSaved
    ? lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const sourceLabel = getBracketSourceLabel(bracketMode);
  const sourceStyle = getBracketSourceStyle(bracketMode);
  const teamCount = bracketMeta?.realTeamCount || bracketMeta?.teamCount;
  const lastUpdated = bracketMeta?.lastUpdated;
  const updatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={styles.controls}>
      <div className={styles.left}>
        <button
          className={styles.primaryBtn}
          onClick={onAutoFill}
          title="Auto-fill entire bracket using Maximus model"
        >
          <span className={styles.btnIcon}>◆</span>
          Auto-Fill Maximus
        </button>
        <button
          className={styles.resetMaxBtn}
          onClick={onResetToMaximus}
          title="Replace all picks with Maximus selections"
        >
          Reset to Maximus
        </button>
        <button
          className={styles.secondaryBtn}
          onClick={() => onClearRound?.(1)}
          disabled={totalPicks === 0}
        >
          Clear Round
        </button>
        <button
          className={styles.dangerBtn}
          onClick={onClearBracket}
          disabled={totalPicks === 0}
        >
          Reset All
        </button>
        <div className={styles.divider} />
        <button
          className={`${styles.compareBtn} ${showCompare ? styles.compareActive : ''}`}
          onClick={onToggleCompare}
          disabled={totalPicks === 0}
        >
          {showCompare ? 'Hide' : 'Compare'} vs Maximus
        </button>
      </div>
      <div className={styles.right}>
        <SaveIndicator status={saveStatus} timeStr={timeStr} />
        <span className={styles.pickCount}>
          {totalPicks} / {totalGames}
        </span>
        <span className={sourceStyle} title={`Source: ${sourceLabel}${teamCount ? ` · ${teamCount} teams` : ''}${updatedStr ? ` · Updated ${updatedStr}` : ''}`}>
          {sourceLabel}
          {teamCount != null && <span className={styles.sourceDetail}> · {teamCount}T</span>}
        </span>
      </div>
    </div>
  );
}

function SaveIndicator({ status, timeStr }) {
  if (status === 'saving') {
    return <span className={styles.saveSaving}>Saving…</span>;
  }
  if (status === 'saved') {
    return (
      <span className={styles.saveSaved}>
        Saved {timeStr && <span className={styles.saveTime}>at {timeStr}</span>}
      </span>
    );
  }
  if (status === 'error') {
    return <span className={styles.saveError}>Save failed</span>;
  }
  if (status === 'local') {
    return <span className={styles.saveLocal}>Local only</span>;
  }
  if (timeStr) {
    return <span className={styles.saveIdle}>Last saved {timeStr}</span>;
  }
  return null;
}
