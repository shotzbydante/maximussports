/**
 * AffiliateCta — tasteful sportsbook affiliate call-to-action.
 *
 * Routes all clicks through the internal /api/affiliate/:offer endpoint so we:
 *   1. Own first-party click tracking before any redirect
 *   2. Keep raw WebPartners URLs off the frontend
 *
 * Props:
 *   offer    {string}                          — offer key (e.g. "xbet-ncaa")
 *   label    {string}                          — primary CTA text
 *   sublabel {string}                          — optional muted secondary label
 *   slot     {string}                          — attribution placement (e.g. "high-interest-matchup")
 *   gameId   {string|number}                   — optional game ID for attribution
 *   team     {string}                          — optional team slug for attribution
 *   campaign {string}                          — optional campaign override
 *   variant  {"subtle"|"primary"|"module"}     — visual style; default "subtle"
 *   className {string}                         — optional extra class
 */

import { useCallback } from 'react';
import { track } from '../../analytics/index';
import styles from './AffiliateCta.module.css';

const DEFAULT_CAMPAIGN = 'odds-insights-launch';
const DEFAULT_SOURCE   = 'odds-insights';
const DEFAULT_PAGE     = 'odds-insights';

/**
 * Build the internal redirect href with all attribution query params.
 * The backend /api/affiliate/[offer].js strips these before forwarding to the partner.
 */
function buildHref(offer, { slot, gameId, team, campaign, variant } = {}) {
  const params = new URLSearchParams({
    source:   DEFAULT_SOURCE,
    page:     DEFAULT_PAGE,
    campaign: campaign || DEFAULT_CAMPAIGN,
  });
  if (slot)   params.set('slot', slot);
  if (gameId) params.set('gameId', String(gameId));
  if (team)   params.set('team', team);
  if (variant && variant !== 'subtle') params.set('variant', variant);
  return `/api/affiliate/${offer}?${params.toString()}`;
}

export default function AffiliateCta({
  offer,
  label,
  sublabel,
  slot,
  gameId,
  team,
  campaign,
  variant = 'subtle',
  className,
}) {
  const href = buildHref(offer, { slot, gameId, team, campaign, variant });

  const handleClick = useCallback(() => {
    track('affiliate_click', {
      offer,
      label,
      slot:     slot     || null,
      game_id:  gameId   || null,
      team:     team     || null,
      campaign: campaign || DEFAULT_CAMPAIGN,
      page:     DEFAULT_PAGE,
      source:   DEFAULT_SOURCE,
      variant:  variant  || null,
    });
  }, [offer, label, slot, gameId, team, campaign, variant]);

  const cls = [
    styles.cta,
    variant === 'primary' ? styles.ctaPrimary
      : variant === 'module'  ? styles.ctaModule
      : styles.ctaSubtle,
    className,
  ].filter(Boolean).join(' ');

  return (
    <a
      href={href}
      className={cls}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      aria-label={label}
    >
      <span className={styles.ctaLabel}>{label}</span>
      {sublabel && <span className={styles.ctaSublabel}>{sublabel}</span>}
    </a>
  );
}
