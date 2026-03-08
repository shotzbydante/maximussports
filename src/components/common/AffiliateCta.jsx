/**
 * AffiliateCta — tasteful sportsbook affiliate call-to-action.
 *
 * Routes all clicks through the internal /api/affiliate/:offer endpoint so we:
 *   1. Own first-party click tracking before any redirect
 *   2. Keep raw WebPartners URLs off the frontend
 *
 * Props:
 *   offer      {string}                          — offer key (e.g. "xbet-ncaa")
 *   label      {string}                          — primary CTA text
 *   sublabel   {string}                          — optional muted secondary label
 *   brand      {"xbet"|"mybookie"}               — optional brand; renders a small logo left of label
 *   brandSize  {"sm"|"md"}                       — logo size; "sm" (14 px) in buttons, "md" (18 px) in module headers
 *   ariaLabel  {string}                          — optional rich aria-label (e.g. "View live odds for Duke vs UNC at XBet")
 *   slot       {string}                          — attribution placement (e.g. "high-interest-matchup")
 *   gameId     {string|number}                   — optional game ID for attribution
 *   team       {string}                          — optional team slug for attribution
 *   campaign   {string}                          — optional campaign override
 *   variant    {"subtle"|"primary"|"module"}     — visual style; default "subtle"
 *   className  {string}                          — optional extra class
 */

import { useCallback } from 'react';
import { track } from '../../analytics/index';
import styles from './AffiliateCta.module.css';

const DEFAULT_CAMPAIGN = 'odds-insights-launch';
const DEFAULT_SOURCE   = 'odds-insights';
const DEFAULT_PAGE     = 'odds-insights';

// ─── Brand mark SVG logos ─────────────────────────────────────────────────────

const BRAND_SIZE_PX = { sm: 14, md: 18 };

/**
 * Inline SVG brand mark — monochrome, uses currentColor so it inherits button text color.
 * Exported so the promo module header can also render it standalone.
 */
export function BrandMark({ brand, size = 'sm' }) {
  const px = BRAND_SIZE_PX[size] ?? 14;

  if (brand === 'xbet') {
    return (
      <span className={styles.brandMark} aria-hidden="true">
        {/* XBet: bold X cross — immediately recognisable at small sizes */}
        <svg
          className={styles.brandIcon}
          width={px}
          height={px}
          viewBox="0 0 14 14"
          fill="none"
        >
          <line x1="1.5" y1="1.5" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
          <line x1="12.5" y1="1.5" x2="1.5" y2="12.5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
        <span className={styles.brandName}>XBet</span>
      </span>
    );
  }

  if (brand === 'mybookie') {
    return (
      <span className={styles.brandMark} aria-hidden="true">
        {/* MyBookie: open book / M silhouette */}
        <svg
          className={styles.brandIcon}
          width={px}
          height={Math.round(px * 0.9)}
          viewBox="0 0 16 14"
          fill="none"
        >
          <path
            d="M1 12V2L8 8.5L15 2V12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.brandName}>MyBookie</span>
      </span>
    );
  }

  return null;
}

// ─── URL builder ──────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AffiliateCta({
  offer,
  label,
  sublabel,
  brand,
  brandSize = 'sm',
  ariaLabel,
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
      brand:    brand    || null,
      slot:     slot     || null,
      game_id:  gameId   || null,
      team:     team     || null,
      campaign: campaign || DEFAULT_CAMPAIGN,
      page:     DEFAULT_PAGE,
      source:   DEFAULT_SOURCE,
      variant:  variant  || null,
    });
  }, [offer, label, brand, slot, gameId, team, campaign, variant]);

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
      aria-label={ariaLabel || label}
    >
      {brand && (
        <>
          <BrandMark brand={brand} size={brandSize} />
          <span className={styles.brandSep} aria-hidden="true" />
        </>
      )}
      <span className={styles.ctaLabel}>{label}</span>
      {sublabel && <span className={styles.ctaSublabel}>{sublabel}</span>}
    </a>
  );
}
