import { useState } from 'react';
import styles from './SaveBracketModal.module.css';

export default function SaveBracketModal({
  currentName = '',
  mode = 'rename',
  onSave,
  onClose,
}) {
  const [name, setName] = useState(
    mode === 'saveAs' ? '' : currentName,
  );

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  }

  const isRename = mode === 'rename';
  const title = isRename ? 'Rename Bracket' : 'Save Bracket As';
  const buttonLabel = isRename ? 'Rename' : 'Save';
  const placeholder = isRename ? 'Enter bracket name' : 'My Madness Bracket';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose} type="button">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            maxLength={40}
            autoFocus
          />
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onClose} type="button">
              Cancel
            </button>
            <button className={styles.saveBtn} type="submit" disabled={!name.trim()}>
              {buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
