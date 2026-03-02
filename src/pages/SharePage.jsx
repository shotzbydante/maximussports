/**
 * SharePage — SPA-side handler for /share/:id
 *
 * In production, Vercel rewrites /share/:id → /api/share/render which returns
 * full HTML with OG tags + redirect. This component handles the case where the
 * SPA catches the route (dev mode, or direct navigation after SPA hydration).
 *
 * It fetches the share payload and redirects to the destination path.
 */

import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { track } from '../analytics/index';

export default function SharePage() {
  const { id } = useParams();
  const [dest, setDest] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) { setDest('/'); return; }

    // In dev: fetch directly from the render API to get the destination.
    // In prod: this component won't even mount — Vercel serves the HTML page first.
    fetch(`/api/share/render?id=${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.text();
      })
      .then((html) => {
        // Extract destination from the meta-refresh tag
        const match = html.match(/content="0;\s*url=([^"]+)"/i);
        if (match && match[1]) {
          const url = match[1];
          // If it's a full URL pointing to our origin, extract the path
          try {
            const parsed = new URL(url);
            if (parsed.origin === window.location.origin) {
              setDest(parsed.pathname + parsed.search + parsed.hash);
            } else {
              window.location.href = url;
            }
          } catch {
            setDest(url.startsWith('/') ? url : '/');
          }
        } else {
          setDest('/');
        }
        track('seo_landing_view', { placement: 'share_page', share_id: id });
      })
      .catch(() => {
        setError(true);
      });
  }, [id]);

  if (error) return <Navigate to="/" replace />;
  if (dest)  return <Navigate to={dest} replace />;

  // Loading state — brief flash before redirect
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      color: 'rgba(255,255,255,0.5)',
      fontSize: 14,
    }}>
      Loading…
    </div>
  );
}
