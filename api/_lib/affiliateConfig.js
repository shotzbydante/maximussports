/**
 * Central affiliate offer configuration for Maximus Sports.
 * All outbound sportsbook links are managed here — never import this on the frontend.
 * Frontend should call /api/affiliate/:offer routes to trigger redirects.
 *
 * Partner: WebPartners
 * Brands: XBet, MyBookie
 */

/**
 * @typedef {Object} AffiliateCompliance
 * @property {boolean} [requiresAge21] - Offer is restricted to 21+ users
 * @property {boolean} [usOnly] - Offer is US traffic only
 * @property {string[]} [blockedStates] - State codes where this offer cannot run (e.g. ["NY", "NJ"])
 */

/**
 * @typedef {Object} AffiliateOffer
 * @property {string} key - URL-safe identifier used in redirect routes (e.g. "xbet-ncaa")
 * @property {string} brand - Parent sportsbook brand (e.g. "xbet", "mybookie")
 * @property {string} label - Human-readable label for logging and admin display
 * @property {string} url - Destination WebPartners tracking URL (never exposed in API responses)
 * @property {boolean} active - Set to false to stop traffic without deleting the record
 * @property {AffiliateCompliance} [compliance] - Optional flags for future geo/age gating
 */

/** @type {AffiliateOffer[]} */
const AFFILIATE_OFFERS = [
  {
    key: 'xbet-ncaa',
    brand: 'xbet',
    label: 'XBet NCAA Promo',
    url: 'https://record.webpartners.co/_HSjxL9LMlaLlmAXNMCHcM2Nd7ZgqdRLk/1/',
    active: true,
    compliance: {
      requiresAge21: true,
      usOnly: false,
      // TODO: populate blockedStates when compliance requirements are confirmed
    },
  },
  {
    key: 'xbet-welcome',
    brand: 'xbet',
    label: 'XBet Welcome Bonus',
    url: 'https://record.webpartners.co/_HSjxL9LMlaLhIFuQAd3mRWNd7ZgqdRLk/1/',
    active: true,
    compliance: {
      requiresAge21: true,
      usOnly: false,
    },
  },
  {
    key: 'mybookie-welcome',
    brand: 'mybookie',
    label: 'MyBookie Welcome Bonus',
    url: 'https://record.webpartners.co/_HSjxL9LMlaIxuOePL6NGnGNd7ZgqdRLk/1/',
    active: true,
    compliance: {
      requiresAge21: true,
      usOnly: false,
    },
  },
  {
    key: 'mybookie-betback',
    brand: 'mybookie',
    label: 'MyBookie Bet-Back Offer',
    url: 'https://record.webpartners.co/_HSjxL9LMlaJoP3wYGGIoeWNd7ZgqdRLk/1/',
    active: true,
    compliance: {
      requiresAge21: true,
      usOnly: false,
    },
  },
];

/** O(1) lookup map by offer key — built once at module load. */
const OFFERS_BY_KEY = Object.fromEntries(AFFILIATE_OFFERS.map((o) => [o.key, o]));

export { AFFILIATE_OFFERS, OFFERS_BY_KEY };
