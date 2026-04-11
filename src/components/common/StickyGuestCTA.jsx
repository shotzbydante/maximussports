/**
 * StickyGuestCTA — premium floating bottom banner for unauthenticated users.
 *
 * Shows on OPEN pages (home, briefings) to encourage account creation.
 * Automatically hidden on PREVIEW pages (which have their own in-page gate)
 * and for authenticated users. Dismissable per session.
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRouteAccess } from '../../hooks/useAuthGate';
import styles from './StickyGuestCTA.module.css';

export default function StickyGuestCTA({
  headline = 'Get the full Maximus Sports experience',
  ctaLabel = 'Create Free Account',
  ctaRoute = '/settings',
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);

  // Hide for authenticated users
  if (user) return null;
  // Hide if dismissed this session
  if (dismissed) return null;
  // Hide on preview-gated pages (they have their own in-page CTA)
  if (getRouteAccess(location.pathname) === 'preview') return null;

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
