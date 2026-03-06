/**
 * getTeamEmoji.js
 *
 * Returns a single tasteful mascot/identity emoji for a team.
 * Used in Team Intel captions and select Daily Briefing copy.
 *
 * Rules:
 *   - One emoji max per usage site
 *   - Falls back to "" (empty string) when no confident mapping exists
 *   - Keys are team slugs (from getTeamSlug) or common normalized team name fragments
 */

/** Slug → emoji. One entry per team, no duplication. */
const SLUG_EMOJI = {
  // Wildcats
  'villanova':         '🐾',
  'kentucky':          '🐾',
  'arizona':           '🐾',
  'kansas-state':      '🐾',
  'davidson':          '🐾',

  // Blue Devils
  'duke':              '😈',

  // Tigers
  'lsu':               '🐯',
  'clemson':           '🐯',
  'memphis':           '🐯',
  'auburn':            '🐯',
  'missouri':          '🐯',

  // Bears / Bruins
  'baylor':            '🐻',
  'ucla':              '🐻',
  'california':        '🐻',

  // Huskies / Dogs
  'uconn':             '🐶',
  'washington':        '🐶',
  'northeastern':      '🐶',

  // Gators / Crocs
  'florida':           '🐊',

  // Longhorns / Bulls
  'texas':             '🤘',
  'south-florida':     '🐂',

  // Wolverines
  'michigan':          '🦡',

  // Spartans
  'michigan-state':    '⚔️',
  'san-jose-state':    '⚔️',

  // Boilermakers
  'purdue':            '🔩',

  // Crimson Tide
  'alabama':           '🌊',

  // Buckeyes
  'ohio-state':        '🌰',

  // Cardinal / Tree
  'stanford':          '🌲',

  // Hurricanes
  'miami':             '🌀',

  // Razorbacks
  'arkansas':          '🐗',

  // Badgers
  'wisconsin':         '🦡',

  // Hawkeyes
  'iowa':              '👁️',

  // Jayhawks
  'kansas':            '🦅',

  // Hawkeyes / Cyclones
  'iowa-state':        '🌪️',

  // Cowboys
  'oklahoma-state':    '🤠',

  // Sooners
  'oklahoma':          '⚡',

  // Horned Frogs
  'tcu':               '🐸',

  // Red Raiders
  'texas-tech':        '🤠',

  // Aggies
  'texas-am':          '🐕',

  // Seminoles
  'florida-state':     '🪶',

  // Ducks
  'oregon':            '🦆',

  // Sun Devils
  'arizona-state':     '😈',

  // Cougars
  'houston':           '🐆',
  'byu':               '🦁',
  'washington-state':  '🐆',

  // Heels / Tar Heels
  'north-carolina':    '💙',

  // Wolfpack
  'nc-state':          '🐺',

  // Cavaliers
  'virginia':          '⚔️',

  // Pirates
  'east-carolina':     '🏴‍☠️',
  'seton-hall':        '🏴‍☠️',

  // Mountaineers
  'west-virginia':     '⛰️',

  // Golden Gophers
  'minnesota':         '🦫',

  // Illini
  'illinois':          '🌽',

  // Hoosiers
  'indiana':           '🏀',

  // Terrapins / Turtles
  'maryland':          '🐢',

  // Scarlet Knights
  'rutgers':           '⚔️',

  // Owls
  'rice':              '🦉',
  'florida-atlantic':  '🦉',
  'temple':            '🦉',

  // Eagles
  'boston-college':    '🦅',
  'eastern-michigan':  '🦅',
  'american':          '🦅',

  // Wildcats (generic fallback)
  'new-mexico-state':  '🐾',

  // Penguins
  'youngstown-state':  '🐧',

  // Sharks
  'nova-southeastern': '🦈',
};

/**
 * Get a mascot/identity emoji for a team.
 *
 * @param {string|null} slug  - Normalized team slug (from getTeamSlug)
 * @param {string} [name]     - Fallback: team display name for keyword matching
 * @returns {string} Single emoji character, or "" if no confident match
 */
export function getTeamEmoji(slug, name = '') {
  if (slug && SLUG_EMOJI[slug]) return SLUG_EMOJI[slug];

  // Keyword fallback on team name (handles mascot words not covered by slug map)
  const n = (name || '').toLowerCase();
  if (/wildcat/.test(n))    return '🐾';
  if (/tiger/.test(n))      return '🐯';
  if (/bear|bruin/.test(n)) return '🐻';
  if (/gator/.test(n))      return '🐊';
  if (/duck/.test(n))       return '🦆';
  if (/huskie|husky/.test(n)) return '🐶';
  if (/wolverine/.test(n))  return '🦡';
  if (/badger/.test(n))     return '🦡';
  if (/spartan/.test(n))    return '⚔️';
  if (/eagle/.test(n))      return '🦅';
  if (/hawk/.test(n))       return '🦅';
  if (/owl/.test(n))        return '🦉';
  if (/wolf|wolf/.test(n))  return '🐺';
  if (/hurricane/.test(n))  return '🌀';
  if (/cyclone/.test(n))    return '🌪️';
  if (/cowboy/.test(n))     return '🤠';
  if (/pirate/.test(n))     return '🏴‍☠️';
  if (/razorback/.test(n))  return '🐗';
  if (/cougar|puma/.test(n)) return '🐆';
  if (/cardinal/.test(n))   return '🌲';
  if (/devil/.test(n))      return '😈';
  if (/buckeye/.test(n))    return '🌰';
  if (/seminole/.test(n))   return '🪶';
  if (/mountaineer/.test(n)) return '⛰️';
  if (/crimson tide/.test(n)) return '🌊';
  if (/longhorn/.test(n))   return '🤘';
  if (/boilermaker/.test(n)) return '🔩';
  if (/jayhawk/.test(n))    return '🦅';

  return '';
}
