/**
 * FinishSetupNudge — one line for a signed-in account that has not been
 * through setup (no username yet). New accounts go straight to the page they
 * signed up to see; this is the way back to teams, emails and the avatar.
 * Dismissed for the browser session with the ×.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { track } from '../../analytics/index';
import styles from './FinishSetupNudge.module.css';

const KEY = 'mx_setup_nudge_dismissed';

export default function FinishSetupNudge() {
  const { user } = useAuth();
  // The account this browser has found without a username, if any.
  const [pendingFor, setPendingFor] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    try { if (sessionStorage.getItem(KEY) === '1') return undefined; } catch { /* ignore */ }
    const sb = getSupabase();
    if (!sb) return undefined;
    let cancelled = false;
    sb.from('profiles').select('username').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => { if (!cancelled && !error && !data?.username) setPendingFor(user.id); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  if (!user || pendingFor !== user.id) return null;
  const dismiss = () => {
    try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setPendingFor(null);
  };
  return (
    <aside className={styles.nudge} aria-label="Finish setting up">
      <span className={styles.text}><b>You’re in.</b> Pick your teams and choose your emails when you have a minute.</span>
      <Link to="/settings" className={styles.go} onClick={() => track('setup_nudge_clicked', {})}>Set up</Link>
      <button type="button" className={styles.x} onClick={dismiss} aria-label="Dismiss">&times;</button>
    </aside>
  );
}
