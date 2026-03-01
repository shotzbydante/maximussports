/**
 * AnalyticsRouteListener — fires analytics.pageview() on every route change.
 *
 * Dedupes by pathname so React StrictMode's double-effect invocation does not
 * send duplicate events.  Renders nothing — side-effects only.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { pageview } from '../../analytics/index';

export default function AnalyticsRouteListener() {
  const { pathname } = useLocation();
  const lastFiredRef = useRef(null);

  useEffect(() => {
    // Skip if we already fired for this exact pathname (guards StrictMode double-run)
    if (lastFiredRef.current === pathname) return;
    lastFiredRef.current = pathname;
    pageview(pathname);
  }, [pathname]);

  return null;
}
