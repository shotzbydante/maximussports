/**
 * Join — landing page for invite links (/join?ref=UUID).
 *
 * Stores the referral code in localStorage for post-signup attribution,
 * then redirects:
 *   - authenticated users → /dashboard
 *   - unauthenticated users → /settings (sign-up / sign-in entry point)
 *
 * Never renders blank — shows a branded loading state while auth resolves.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Join() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const ref = searchParams.get('ref');
  const hasStoredRef = useRef(false);

  useEffect(() => {
    if (ref && !hasStoredRef.current) {
      try { localStorage.setItem('ms_referral_code', ref); } catch { /* private browsing */ }
      hasStoredRef.current = true;
    }
  }, [ref]);

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/settings', { replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: '12px',
      fontFamily: "'DM Sans', Arial, Helvetica, sans-serif",
    }}>
      <span style={{
        fontSize: '14px', fontWeight: 800, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: '#0f2440',
      }}>
        MAXIMUS SPORTS
      </span>
      <p style={{ fontSize: '14px', color: '#4a5568', margin: 0 }}>
        Redirecting you&hellip;
      </p>
    </div>
  );
}
