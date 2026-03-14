import styles from './BracketControls.module.css';

export default function BracketControls({
  saveStatus,
  totalPicks,
  totalGames,
  isPreSelection,
  onAutoFill,
  onClearBracket,
  onClearRound,
}) {
  return (
    <div className={styles.controls}>
      <div className={styles.left}>
        <button
          className={styles.primaryBtn}
          onClick={onAutoFill}
          disabled={isPreSelection}
          title="Auto-fill entire bracket using Maximus model"
        >
          <span className={styles.btnIcon}>◆</span>
          Auto-Fill with Maximus
        </button>
        <button
          className={styles.secondaryBtn}
          onClick={() => onClearRound?.(1)}
          disabled={isPreSelection || totalPicks === 0}
        >
          Clear Round
        </button>
        <button
          className={styles.dangerBtn}
          onClick={onClearBracket}
          disabled={totalPicks === 0}
        >
          Reset Bracket
        </button>
      </div>
      <div className={styles.right}>
        <SaveIndicator status={saveStatus} />
        <span className={styles.pickCount}>
          {totalPicks} / {totalGames} picks
        </span>
      </div>
    </div>
  );
}

function SaveIndicator({ status }) {
  if (status === 'saving') {
    return <span className={styles.saveSaving}>Saving…</span>;
  }
  if (status === 'saved') {
    return <span className={styles.saveSaved}>Saved ✓</span>;
  }
  if (status === 'error') {
    return <span className={styles.saveError}>Save failed</span>;
  }
  return null;
}
