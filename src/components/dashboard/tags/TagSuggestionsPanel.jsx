import { useEffect, useState } from 'react';
import { getTagsForContext } from './tagSuggestions';
import styles from './TagSuggestionsPanel.module.css';

function storageKey({ template, teamSlug, awaySlug, homeSlug }) {
  return `maximus_tags_${template}_${teamSlug || ''}_${awaySlug || ''}_${homeSlug || ''}`;
}

export default function TagSuggestionsPanel({ template, teamSlug, conference, awaySlug, homeSlug }) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const key = storageKey({ template, teamSlug, awaySlug, homeSlug });
  const suggested = getTagsForContext({ template, teamSlug, conference, awaySlug, homeSlug });

  const [customText, setCustomText] = useState(() => {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      setCustomText(saved || '');
    } catch { setCustomText(''); }
  }, [key]);

  const displayTags = customText.trim()
    ? customText.split(/[\s,\n]+/).filter(t => t.startsWith('@'))
    : suggested;

  function handleSave() {
    try { localStorage.setItem(key, customText); } catch {}
    setEditing(false);
  }

  function handleReset() {
    try { localStorage.removeItem(key); } catch {}
    setCustomText('');
    setEditing(false);
  }

  function handleCopy() {
    const text = displayTags.join(' ');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className={styles.panel}>
      <button className={styles.panelHeader} onClick={() => setCollapsed(c => !c)}>
        <span className={styles.panelTitle}>Suggested Tags</span>
        <div className={styles.headerRight}>
          <span className={styles.count}>{displayTags.length}</span>
          <span className={styles.chevron}>{collapsed ? '▶' : '▼'}</span>
        </div>
      </button>

      {!collapsed && (
        <div className={styles.panelBody}>
          <div className={styles.tagCloud}>
            {displayTags.map((t, i) => (
              <span key={i} className={styles.tagChip}>{t}</span>
            ))}
            {displayTags.length === 0 && (
              <span className={styles.emptyTags}>No tags for this context</span>
            )}
          </div>

          <div className={styles.actions}>
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy tags'}
            </button>
            <button className={styles.editBtn} onClick={() => setEditing(e => !e)}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {editing && (
            <div className={styles.editArea}>
              <textarea
                className={styles.textarea}
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder={suggested.join(' ')}
                rows={4}
              />
              <div className={styles.editActions}>
                <button className={styles.saveBtn} onClick={handleSave}>Save</button>
                <button className={styles.resetBtn} onClick={handleReset}>Reset to defaults</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
