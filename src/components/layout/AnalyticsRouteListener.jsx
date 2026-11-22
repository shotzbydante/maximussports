/**
 * AnalyticsRouteListener — fires analytics.pageview() on every route change,
 * and team_view when the route is an MLB, NBA or NFL team page.
 *
 * Dedupes by pathname so React StrictMode's double-effect invocation does not
 * send duplicate events.  Renders nothing — side-effects only.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { pageview, track } from '../../analytics/index';
import { describeRoute } from '../../analytics/routeProps';

export default function AnalyticsRouteListener() {
  const { pathname } = useLocation();
  const lastFiredRef = useRef(null);

  useEffect(() => {
    // Skip if we already fired for this exact pathname (guards StrictMode double-run)
    if (lastFiredRef.current === pathname) return;
    lastFiredRef.current = pathname;
    pageview(pathname);

    // team_view for the MLB, NBA and NFL team pages. The college basketball
    // team page fires its own, with conference and tier.
    const route = describeRoute(pathname);
    if (route.page_type === 'team' && route.sport !== 'ncaam') {
      track('team_view', { team_slug: route.team_slug, sport: route.sport });
    }
  }, [pathname]);

  return null;
}
