/**
 * Maps normalized source names to their primary domain.
 * Used to resolve publication logo images via Google's favicon CDN.
 *
 * Key = lowercased, trimmed source name as it appears in the feed's `source`
 * field. Variants and common typos are listed alongside the canonical entry.
 */
const SOURCE_TO_DOMAIN = {
  // Yahoo
  'yahoo sports':       'sports.yahoo.com',
  'yahoo':              'sports.yahoo.com',
  'yahoosports':        'sports.yahoo.com',

  // CBS
  'cbs sports':         'cbssports.com',
  'cbs':                'cbssports.com',

  // ESPN
  'espn':               'espn.com',

  // Fox
  'fox sports':         'foxsports.com',
  'fox':                'foxsports.com',

  // The Athletic
  'the athletic':       'theathletic.com',
  'athletic':           'theathletic.com',

  // 247Sports
  '247sports':          '247sports.com',
  '247 sports':         '247sports.com',

  // Bleacher Report
  'bleacher report':    'bleacherreport.com',
  'b/r':                'bleacherreport.com',

  // NBC
  'nbc sports':         'nbcsports.com',
  'nbc':                'nbcsports.com',

  // SI / Sports Illustrated
  'si.com':             'si.com',
  'sports illustrated': 'si.com',

  // USA Today
  'usa today':          'usatoday.com',
  'usa today sports':   'usatoday.com',

  // Rivals / On3
  'rivals':             'rivals.com',
  'on3':                'on3.com',
  'on3 sports':         'on3.com',

  // AP
  'ap':                 'apnews.com',
  'associated press':   'apnews.com',

  // Others
  'stadium':            'watchstadium.com',
  'the spun':           'thespun.com',
  'college spun':       'thespun.com',
  'fansided':           'fansided.com',
  'outkick':            'outkick.com',
  'saturday tradition': 'saturdaytradition.com',
  'sports reference':   'sports-reference.com',
  'ncaa':               'ncaa.com',
  'college basketball network': 'watchstadium.com',
};

/**
 * Sources that have a dedicated brand-quality logo asset shipped in /public.
 * These are used instead of the generic favicon when a full wordmark or
 * brand treatment is appropriate (e.g. in headlines, story attribution).
 */
const SOURCE_BRAND_LOGOS = {
  'yahoo sports': '/logos/yahoo-sports.png',
  'yahoo':        '/logos/yahoo-sports.png',
  'yahoosports':  '/logos/yahoo-sports.png',
};

/**
 * Normalizes a raw source string:
 *   - lowercases and trims
 *   - strips leading "www."
 *   - strips trailing punctuation / whitespace
 */
function normalizeSource(source) {
  return (source || '')
    .toLowerCase()
    .trim()
    .replace(/^www\./, '')
    .replace(/[.,;:!?]+$/, '');
}

/**
 * Returns a Google favicon CDN URL (64 px) for the given source name,
 * or null if the source cannot be mapped to a known domain.
 *
 * @param {string} source - The article's `source` field (e.g. "ESPN")
 * @returns {string|null}
 */
export function getPublicationLogoUrl(source) {
  const key = normalizeSource(source);
  const domain = SOURCE_TO_DOMAIN[key];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Returns a local brand logo asset path for sources that have one,
 * or null for all other sources. Brand logos are full wordmarks or
 * official treatments — higher quality than favicons.
 *
 * @param {string} source
 * @returns {string|null}
 */
export function getSourceBrandLogo(source) {
  const key = normalizeSource(source);
  return SOURCE_BRAND_LOGOS[key] || null;
}

/**
 * Returns true if the source string matches Yahoo Sports (any variant).
 *
 * @param {string} source
 * @returns {boolean}
 */
export function isYahooSports(source) {
  const key = normalizeSource(source);
  return key === 'yahoo sports' || key === 'yahoo' || key === 'yahoosports';
}
