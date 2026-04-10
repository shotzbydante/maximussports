/**
 * GuestClickGate — intercepts link clicks for unauthenticated users.
 *
 * Wraps a section of a page. For guests, any click on an <a> tag or
 * element with [data-gated] redirects to the onboarding flow instead
 * of navigating. Authenticated users are unaffected.
 *
 * Usage:
 *   <GuestClickGate>
 *     <BriefingContent />
 *   </GuestClickGate>
 *
 * To mark specific buttons as gated:
 *   <button data-gated>Pin Team</button>
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Paths that guests may navigate to freely
const ALLOWED_PATHS = ['/', '/mlb', '/ncaam', '/settings', '/privacy', '/terms'];

function isAllowedHref(href) {
  if (!href) return false;
  try {
    const url = new URL(href, window.location.origin);
    // External links are always allowed
    if (url.origin !== window.location.origin) return true;
    const path = url.pathname.replace(/\/$/, '') || '/';
    return ALLOWED_PATHS.some(p => path === p);
  } catch {
    return false;
  }
}

export default function GuestClickGate({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleClick = useCallback((e) => {
    // Authenticated users pass through
    if (user) return;

    // Check if the click target (or ancestor) is a gated element
    const target = e.target.closest('a[href], [data-gated], button[data-gated]');
    if (!target) return;

    // [data-gated] elements always gate
    if (target.hasAttribute('data-gated')) {
      e.preventDefault();
      e.stopPropagation();
      navigate('/settings');
      return;
    }

    // <a> tags: check if href is allowed
    if (target.tagName === 'A') {
      const href = target.getAttribute('href');
      if (href && !isAllowedHref(href)) {
        e.preventDefault();
        e.stopPropagation();
        navigate('/settings');
      }
    }
  }, [user, navigate]);

  // Authenticated users get no wrapper overhead
  if (user) return <>{children}</>;

  return (
    <div onClick={handleClick} style={{ cursor: 'default' }}>
      {children}
    </div>
  );
}
