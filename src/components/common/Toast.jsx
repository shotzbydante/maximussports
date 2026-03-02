/**
 * Lightweight toast notification.
 * Self-dismissing with CSS slide-in animation.
 * Usage: import { useToast, ToastContainer } from './Toast'
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import styles from './Toast.module.css';

let _showToast = null;

/**
 * Imperative API — call anywhere without prop drilling.
 * @param {string} message
 * @param {{ type?: 'success'|'error'|'info', duration?: number }} opts
 */
export function showToast(message, opts = {}) {
  if (_showToast) _showToast(message, opts);
}

/** Hook for use inside ToastContainer. */
function useToastQueue() {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const add = useCallback((message, { type = 'success', duration = 2800 } = {}) => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return { toasts, add };
}

/** Mount this once near the app root (already done in App.jsx when added). */
export default function ToastContainer() {
  const { toasts, add } = useToastQueue();

  useEffect(() => {
    _showToast = add;
    return () => { _showToast = null; };
  }, [add]);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${styles[t.type] || styles.success}`}
          role="status"
        >
          {t.type === 'success' && <span className={styles.icon} aria-hidden>✓</span>}
          {t.type === 'error'   && <span className={styles.icon} aria-hidden>✕</span>}
          {t.type === 'info'    && <span className={styles.icon} aria-hidden>ℹ</span>}
          <span className={styles.message}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
