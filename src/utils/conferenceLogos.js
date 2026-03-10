/**
 * Conference logo resolution backed by ESPN CDN.
 *
 * Static mapping of our conference short-names → ESPN CDN URLs.
 * These are the official ESPN conference logos, served from ESPN's CDN
 * with CORS support (safe for html-to-image export).
 *
 * Discovery source:
 *   sports.core.api.espn.com/v2/sports/basketball/leagues/
 *   mens-college-basketball/seasons/{year}/types/2/groups/{id}
 */

const ESPN_CONF_LOGO_MAP = {
  'ACC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/acc.png',
  'A-10':          'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/atlantic_10.png',
  'Big East':      'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/big_east.png',
  'Big Ten':       'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/big_ten.png',
  'Big 12':        'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/big_12.png',
  'CUSA':          'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/conference_usa.png',
  'MAC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/mid_american.png',
  'MVC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/missouri_valley.png',
  'SEC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/sec.png',
  'WCC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/west_coast.png',
  'Mountain West': 'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/mountain_west.png',
  'AAC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/american.png',
  'Horizon':       'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/horizon.png',
  'Big West':      'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/big_west.png',
  'Ivy':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/ivy.png',
  'MAAC':          'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/maac.png',
  'Sun Belt':      'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/sun_belt.png',
  'SWAC':          'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/swac.png',
  'OVC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/ohio_valley.png',
  'NEC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/northeast.png',
  'WAC':           'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/wac.png',
  'Southland':     'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/southland.png',
  'Summit':        'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/summit.png',
};

/**
 * Returns the ESPN CDN URL for a conference logo, or null if unknown.
 * @param {string} conf - Conference short name (e.g. "ACC", "Big 12")
 */
export function getEspnConfLogoUrl(conf) {
  return ESPN_CONF_LOGO_MAP[conf] ?? null;
}

/**
 * Returns { src, alt } for a conference logo (used by shared ConferenceLogo component).
 * @param {string} conf - Conference short name
 */
export function getConferenceLogo(conf) {
  const url = ESPN_CONF_LOGO_MAP[conf];
  if (!url) return null;
  return { src: url, alt: `${conf} logo` };
}

/**
 * Returns all known conference → ESPN CDN logo mappings.
 */
export function getAllConfLogos() {
  return { ...ESPN_CONF_LOGO_MAP };
}
