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
  isGuest = false,
  bracketMeta,
  onAutoFill,
  onResetToMaximus,
  onClearBracket,
  onClearRound,
  onToggleCompare,
  showCompare,
  onSimulateEntire,
  onSimulateRest,
  onRegeneratePicks,
  simStats,
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
          className={styles.simulateBtn}
          onClick={onSimulateEntire}
          title="Simulate entire bracket — AI fills all 63 games with controlled randomness"
        >
          <span className={styles.btnIcon}>{'\u26A1'}</span>
          Simulate Entire Bracket
        </button>
        <button
          className={styles.simulateRestBtn}
          onClick={onSimulateRest}
          disabled={totalPicks === 0}
          title="Fill remaining games — preserves your manual picks"
        >
          Simulate Rest
        </button>
        <button
          className={styles.regenerateBtn}
          onClick={onRegeneratePicks}
          disabled={totalPicks === 0}
          title="Re-randomize Dice Rolls and Upset Specials — High Conviction picks stay fixed"
        >
          {'\uD83C\uDFB2'} Regenerate Picks
        </button>
        <div className={styles.divider} />
        <button
          className={styles.primaryBtn}
          onClick={onAutoFill}
          title="Auto-fill entire bracket using deterministic Maximus model"
        >
          <span className={styles.btnIcon}>{'\u25C6'}</span>
          Auto-Fill Maximus
        </button>
        <button
          className={styles.resetMaxBtn}
          onClick={onResetToMaximus}
          title="Replace all picks with Maximus selections"
        >
          Reset to Maximus
        </button>
        <div className={styles.divider} />
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
        {simStats && simStats.totalGames > 0 && (
          <SimStats stats={simStats} />
        )}
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

function SimStats({ stats }) {
  if (!stats) return null;
  return (
    <div className={styles.simStats}>
      {stats.highConviction > 0 && (
        <span className={styles.statHighConviction} title="High Conviction picks">
          {'\u25C6'} {stats.highConviction}
        </span>
      )}
      {stats.upsetSpecials > 0 && (
        <span className={styles.statUpsetSpecial} title="Upset Specials">
          {'\u26A0'} {stats.upsetSpecials}
        </span>
      )}
      {stats.diceRolls > 0 && (
        <span className={styles.statDiceRoll} title="Dice Rolls">
          {'\uD83C\uDFB2'} {stats.diceRolls}
        </span>
      )}
      {stats.upsets > 0 && (
        <span className={styles.statUpsets} title="Total upsets">
          {stats.upsets} upset{stats.upsets !== 1 ? 's' : ''}
        </span>
      )}
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
