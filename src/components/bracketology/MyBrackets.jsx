import { useState } from 'react';
import styles from './MyBrackets.module.css';

export default function MyBrackets({
  brackets = [],
  activeBracketId,
  onLoad,
  onDelete,
  onRename,
  onCreateNew,
  onClose,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function handleStartRename(bracket) {
    setRenamingId(bracket.id);
    setRenameValue(bracket.bracket_name || '');
  }

  function handleConfirmRename() {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleConfirmRename();
    if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
  }

  function getChampionFromPicks(picks) {
    if (!picks || !picks.champ) return null;
    return picks.champ;
  }

  function getPickCount(picks) {
    return picks ? Object.keys(picks).length : 0;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>My Brackets</h3>
        <button className={styles.closeBtn} onClick={onClose} type="button">&times;</button>
      </div>

      <div className={styles.actions}>
        <button className={styles.newBtn} onClick={onCreateNew} type="button">
          + New Bracket
        </button>
      </div>

      <div className={styles.list}>
        {brackets.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>📋</span>
            <p className={styles.emptyText}>No saved brackets yet</p>
            <p className={styles.emptyHint}>Start picking to save your first bracket</p>
          </div>
        )}

        {brackets.map((b) => {
          const isActive = b.id === activeBracketId;
          const pickCount = getPickCount(b.picks);
          const progress = Math.round((pickCount / 63) * 100);
          const champion = getChampionFromPicks(b.picks);

          return (
            <div
              key={b.id}
              className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
            >
              {renamingId === b.id ? (
                <div className={styles.renameRow}>
                  <input
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleConfirmRename}
                    autoFocus
                    maxLength={40}
                  />
                </div>
              ) : (
                <div className={styles.cardHeader}>
                  <span className={styles.cardName}>
                    {b.bracket_name || 'Untitled Bracket'}
                    {isActive && <span className={styles.activeBadge}>Active</span>}
                  </span>
                  <button
                    className={styles.renameBtn}
                    onClick={() => handleStartRename(b)}
                    type="button"
                    title="Rename"
                  >
                    ✎
                  </button>
                </div>
              )}

              <div className={styles.cardMeta}>
                <span className={styles.metaItem}>{pickCount}/63 picks</span>
                <span className={styles.metaDot}>·</span>
                <span className={styles.metaItem}>{progress}%</span>
                {champion && (
                  <>
                    <span className={styles.metaDot}>·</span>
                    <span className={styles.metaChamp}>🏆 {champion}</span>
                  </>
                )}
              </div>

              <div className={styles.cardProgress}>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className={styles.cardFooter}>
                <span className={styles.cardDate}>{formatDate(b.updated_at)}</span>
                <div className={styles.cardActions}>
                  {!isActive && (
                    <button
                      className={styles.loadBtn}
                      onClick={() => onLoad(b.id)}
                      type="button"
                    >
                      Load
                    </button>
                  )}
                  {confirmDeleteId === b.id ? (
                    <div className={styles.confirmDelete}>
                      <span className={styles.confirmText}>Delete?</span>
                      <button
                        className={styles.confirmYes}
                        onClick={() => { onDelete(b.id); setConfirmDeleteId(null); }}
                        type="button"
                      >
                        Yes
                      </button>
                      <button
                        className={styles.confirmNo}
                        onClick={() => setConfirmDeleteId(null)}
                        type="button"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setConfirmDeleteId(b.id)}
                      type="button"
                      title="Delete bracket"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
