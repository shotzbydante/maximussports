/**
 * AuthGateModal — lightweight prompt shown when a guest tries
 * a gated action (pin team, follow, subscribe, etc.).
 * Routes user to /settings for sign-in / account creation.
 *
 * Renders via portal to document.body so it is never clipped by
 * parent overflow or displaced by parent transforms (which would
 * break position:fixed on mobile Safari).
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  animation: 'authGateIn 0.15s ease-out',
  overscrollBehavior: 'none',
};

const cardStyle = {
  background: 'var(--color-bg-elevated, #fff)',
  border: '1px solid var(--color-border-light, rgba(0,0,0,0.08))',
  borderRadius: 'var(--radius-card, 14px)',
  width: '100%',
  maxWidth: 360,
  padding: '28px 24px 20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
  textAlign: 'center',
  boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 12px 40px rgba(0,0,0,0.08)',
  maxHeight: 'calc(100vh - 32px)',
  maxHeight: 'calc(100dvh - 32px)',
  overflowY: 'auto',
};

const iconWrap = {
  width: 52,
  height: 52,
  borderRadius: '50%',
  background: 'rgba(60,121,180,0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-primary, #3c79b4)',
};

const titleStyle = {
  fontFamily: 'var(--font-display, system-ui)',
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'var(--color-text, #1a1a2e)',
  margin: 0,
};

const descStyle = {
  fontSize: '0.85rem',
  color: 'var(--color-text-muted, #888)',
  margin: 0,
  lineHeight: 1.5,
};

const btnPrimary = {
  width: '100%',
  height: 42,
  background: 'var(--color-primary, #3c79b4)',
  color: '#fff',
  fontFamily: 'var(--font-sans, system-ui)',
  fontSize: '0.88rem',
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--pill-radius, 100px)',
  cursor: 'pointer',
};

const btnSecondary = {
  width: '100%',
  height: 38,
  background: 'transparent',
  color: 'var(--color-text-muted, #888)',
  fontFamily: 'var(--font-sans, system-ui)',
  fontSize: '0.82rem',
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
};

export default function AuthGateModal({ onClose, message }) {
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    // Lock body scroll while modal is open
    const scrollY = window.scrollY;
    const { body } = document;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      body.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [onClose]);

  return createPortal(
    <div style={overlayStyle}>
      <div ref={ref} style={cardStyle} role="dialog" aria-modal="true" aria-label="Sign in required">
        <div style={iconWrap}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h3 style={titleStyle}>Unlock your edge</h3>
        <p style={descStyle}>
          {message || 'Create a free account to save your teams, get personalized picks, and unlock daily intel.'}
        </p>
        <button
          type="button"
          style={btnPrimary}
          onClick={() => { onClose(); navigate('/settings'); }}
        >
          Get Started — Free
        </button>
        <button type="button" style={btnSecondary} onClick={onClose}>
          Keep browsing
        </button>
      </div>
    </div>,
    document.body,
  );
}
