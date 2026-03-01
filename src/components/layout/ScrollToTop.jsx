/**
 * On route change: scroll to top, or scroll hash target into view when location.hash is set.
 * Renders nothing — side-effect only.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      const el = id ? document.getElementById(id) : null;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'auto', block: 'start' });
        });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);
  return null;
}
