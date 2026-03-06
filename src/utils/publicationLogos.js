/**
 * Maps normalized source names to their primary domain.
 * Used to resolve publication logo images via Google's favicon CDN.
 *
 * Add entries here to support new sources — key = lowercased source name
 * exactly as it appears in the feed's `source` field.
 */
const SOURCE_TO_DOMAIN = {
  'yahoo sports':      'sports.yahoo.com',
  'cbs sports':        'cbssports.com',
  'espn':              'espn.com',
  'fox sports':        'foxsports.com',
  'the athletic':      'theathletic.com',
  '247sports':         '247sports.com',
  'bleacher report':   'bleacherreport.com',
  'nbc sports':        'nbcsports.com',
  'si.com':            'si.com',
  'sports illustrated':'si.com',
  'usa today':         'usatoday.com',
  'usa today sports':  'usatoday.com',
  'rivals':            'rivals.com',
  'on3':               'on3.com',
  'on3 sports':        'on3.com',
  'athletic':          'theathletic.com',
  'ap':                'apnews.com',
  'associated press':  'apnews.com',
  'stadium':           'watchstadium.com',
  'the spun':          'thespun.com',
  'fansided':          'fansided.com',
  'outkick':           'outkick.com',
  'college spun':      'thespun.com',
};

/**
 * Returns a Google favicon CDN URL for the given source name, or null if
 * the source is not in the map.
 *
 * @param {string} source - The article's `source` field (e.g. "ESPN")
 * @returns {string|null}
 */
export function getPublicationLogoUrl(source) {
  const key = (source || '').toLowerCase().trim();
  const domain = SOURCE_TO_DOMAIN[key];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}
