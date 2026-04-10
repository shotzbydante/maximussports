/**
 * StickyGuestCTA — premium floating bottom banner for unauthenticated users.
 *
 * Shows on home/briefing pages to encourage account creation.
 * Automatically hidden for authenticated users.
 * Dismissable per session.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './StickyGuestCTA.module.css';

export default function StickyGuestCTA({
  headline = 'Get the full Maximus Sports experience',
  ctaLabel = 'Create Free Account',
  ctaRoute = '/settings',
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  // Don't show for authenticated users or if dismissed
  if (user || dismissed) return null;

  return (
    <div className={styles.stickyBar}>
      <div className={styles.inner}>
        <div className={styles.textCol}>
          <p className={styles.headline}>{headline}</p>
          <p className={styles.sub}>Save teams, unlock insights, and personalize your feed.</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.ctaBtn} onClick={() => navigate(ctaRoute)}>
            {ctaLabel}
          </button>
          <button
            className={styles.dismissBtn}
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}
