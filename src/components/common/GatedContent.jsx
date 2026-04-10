/**
 * GatedContent — progressive content gating for unauthenticated users.
 *
 * Shows a preview of the content (top portion), then blurs the rest
 * with a gradient overlay and signup CTA.
 *
 * Usage:
 *   <GatedContent previewPercent={30}>
 *     <ExpensiveContent />
 *   </GatedContent>
 *
 * For authenticated users, renders children normally with no gating.
 */

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './GatedContent.module.css';

export default function GatedContent({
  children,
  previewPercent = 30,
  title = 'Unlock full MLB intelligence',
  subtitle = 'Create your free account to access picks, team intel, and edges.',
  ctaLabel = 'Create Free Account',
  ctaRoute = '/settings',
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  // Authenticated users see everything
  if (user) return <>{children}</>;

  const previewHeight = `${previewPercent}vh`;

  return (
    <div className={styles.gatedWrapper} ref={containerRef}>
      <div className={styles.preview} style={{ maxHeight: previewHeight }}>
        {children}
      </div>
      <div className={styles.blurred}>
        {children}
      </div>
      <div className={styles.overlay}>
        <div className={styles.overlayContent}>
          <div className={styles.lockIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 className={styles.overlayTitle}>{title}</h3>
          <p className={styles.overlaySubtitle}>{subtitle}</p>
          <button className={styles.ctaButton} onClick={() => navigate(ctaRoute)}>
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
