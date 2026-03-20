/**
 * Slack-inspired workspace switcher.
 * Renders above "Navigate" in the sidebar.
 * Consumes workspace context — never hardcodes sport logic.
 */

import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import styles from './WorkspaceSwitcher.module.css';

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
    <path d="M3 4L5 6L7 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function WorkspaceSwitcher() {
  const { workspace, workspaceId, visibleWorkspaces, switchWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (visibleWorkspaces.length <= 1) return null;

  return (
    <div className={styles.root} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.activeIcon}>{workspace.emoji}</span>
        <span className={styles.activeLabel}>{workspace.shortLabel}</span>
        <span className={styles.chevron}><ChevronIcon /></span>
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox" aria-label="Switch workspace">
          <div className={styles.dropdownHeader}>Workspaces</div>
          {visibleWorkspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              role="option"
              aria-selected={ws.id === workspaceId}
              className={`${styles.option} ${ws.id === workspaceId ? styles.optionActive : ''}`}
              onClick={() => {
                switchWorkspace(ws.id);
                setOpen(false);
              }}
            >
              <span className={styles.optionIcon}>{ws.emoji}</span>
              <span className={styles.optionContent}>
                <span className={styles.optionLabel}>{ws.label}</span>
                {!ws.access.public && (
                  <span className={styles.sandboxBadge}>SANDBOX</span>
                )}
              </span>
              {ws.id === workspaceId && (
                <span className={styles.check}><CheckIcon /></span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
