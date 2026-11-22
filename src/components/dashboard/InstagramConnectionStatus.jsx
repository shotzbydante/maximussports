import { useEffect, useState } from 'react';
import { getAuthHeaders } from '../../lib/authHeaders';
import styles from './InstagramConnectionStatus.module.css';

/**
 * Says, before anyone presses Post, whether Instagram publishing can work.
 * Reads /api/instagram/status (admin only). A dead token used to surface
 * only as a failed publish; this puts the reason and the fix on screen.
 */
export default function InstagramConnectionStatus() {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/instagram/status', { headers: await getAuthHeaders() });
        const data = await res.json().catch(() => null);
        if (!cancelled) setState({ loading: false, data: res.ok ? data : null });
      } catch {
        if (!cancelled) setState({ loading: false, data: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.loading) return <p className={styles.checking}>Checking Instagram connection…</p>;
  const d = state.data;
  if (!d) return <p className={`${styles.box} ${styles.warn}`} role="status">Could not check the Instagram connection.</p>;

  if (d.ok) {
    const days = d.token?.daysLeft;
    return (
      <p className={`${styles.box} ${styles.ok}`} role="status">
        <b>Connected{d.username ? ` as @${d.username}` : ''}.</b>{' '}
        {days != null ? `Token renews weekly; ${days} days left.` : 'Token expiry is unknown until the first weekly refresh runs.'}
      </p>
    );
  }

  return (
    <div className={`${styles.box} ${styles.bad}`} role="alert">
      <b>Instagram is not connected. Posting will fail.</b>
      <span>{d.error?.message}</span>
      {d.error?.action && <span className={styles.action}>{d.error.action}</span>}
    </div>
  );
}
