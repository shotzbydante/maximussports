/**
 * GET /api/venues/aerial?sport=nfl
 *   Which venues in a sport have a Google Maps flyover. Free to call and
 *   cached at the edge; it also finds or queues videos for venues it has
 *   not checked yet.
 *     { ok, sport, venues: { BUF: { state, name } }, capped }
 *
 * GET /api/venues/aerial?sport=nfl&team=BUF
 *   Fresh, short-lived links for one team's home venue. Never cached:
 *   Google's links expire, and its terms do not allow storing them.
 *     { ok, state: 'active', name, poster, mp4Low, mp4Medium, durationSec }
 *
 * Either call takes &budget=landing from the logged-out home page. Its
 * lookups also count against a smaller monthly share of their own
 * (AERIAL_LANDING_LOOKUP_CAP), so public traffic cannot spend the
 * allowance the app's game modules rely on.
 *
 * `state` is one of active, processing (Google is rendering it), none (no
 * 3D imagery, or not a US venue), unknown, error, capped, rate_limited,
 * unconfigured.
 */

import { getJson, setJson, tryAcquireLock, incrWithTtl } from '../_globalCache.js';
import {
  getAerialKey, getCoverage, getFlyover, getMonthlyCap, lookupsThisMonth,
  flyoverBudget, getLandingCap, landingLookupsThisMonth,
} from '../_lib/aerialView.js';
import { FLYOVER_SPORTS, flyoverTeamKey } from '../../src/sports/venues/flyoverVenues.js';

const deps = { getJson, setJson, tryAcquireLock, incrWithTtl };

function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.headers?.['x-real-ip'] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const sport = String(req.query?.sport || '').toLowerCase();
  if (!FLYOVER_SPORTS.includes(sport)) return res.status(400).json({ ok: false, error: 'unknown_sport' });

  if (!getAerialKey()) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: false, sport, state: 'unconfigured', venues: {} });
  }

  // `budget=landing` marks the logged-out home page, which has its own share of the month's lookups.
  const budget = flyoverBudget(req.query?.budget);

  try {
    const team = req.query?.team ? flyoverTeamKey(sport, req.query.team) : null;
    if (team) {
      const flyover = await getFlyover(sport, team, deps, { ip: clientIp(req), budget });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: flyover.state === 'active', sport, team, ...flyover });
    }

    const [{ venues }, used, landingUsed] = await Promise.all([
      getCoverage(sport, deps),
      lookupsThisMonth(deps),
      budget === 'landing' ? landingLookupsThisMonth(deps) : 0,
    ]);
    const capped = used >= getMonthlyCap() || (budget === 'landing' && landingUsed >= getLandingCap());
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({ ok: true, sport, venues, capped });
  } catch (err) {
    console.warn('[venues/aerial]', err?.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: false, sport, state: 'error', venues: {} });
  }
}
