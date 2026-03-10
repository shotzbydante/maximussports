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

  // Cornhuskers
  'nebraska':          '🌽',

  // Illini
  'illinois':          '🔸',

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

  // Volunteers
  'tennessee':         '🍊',

  // Ramblers / Flames
  'illinois-chicago':  '🔥',

  // Gamecocks
  'south-carolina':    '🐓',

  // Blue Hens
  'delaware':          '🐔',

  // Friars
  'providence':        '✝️',

  // Flyers
  'dayton':            '✈️',

  // Panthers
  'pitt':              '🐾',
  'northern-iowa':     '🐾',
  'eastern-washington':'🐾',
  'milwaukee':         '🐾',

  // Mustangs
  'smu':               '🐎',

  // Wichita State Shockers
  'wichita-state':     '⚡',

  // Xavier Musketeers
  'xavier':            '⚔️',

  // Gonzaga Bulldogs
  'gonzaga':           '🐶',

  // Saint Mary's Gaels
  'saint-marys':       '💰',

  // Saint John's Red Storm
  'st-johns':          '🌩️',

  // Marquette Golden Eagles
  'marquette':         '🦅',

  // Creighton Bluejays
  'creighton':         '🐦',

  // DePaul Blue Demons
  'depaul':            '😈',

  // Butler Bulldogs
  'butler':            '🐶',

  // Georgetown Hoyas
  'georgetown':        '🐾',

  // Notre Dame Fighting Irish
  'notre-dame':        '☘️',

  // Syracuse Orange
  'syracuse':          '🍊',

  // Cincinnati Bearcats
  'cincinnati':        '🐻',

  // UCF Knights
  'ucf':               '⚔️',

  // Utah Utes
  'utah':              '🔴',

  // Colorado Buffaloes
  'colorado':          '🦬',

  // Nevada Wolf Pack
  'nevada':            '🐺',

  // UNLV Rebels
  'unlv':              '🏴‍☠️',

  // San Diego State Aztecs
  'san-diego-state':   '🌵',

  // New Mexico Lobos
  'new-mexico':        '🐺',

  // Fresno State Bulldogs
  'fresno-state':      '🐶',

  // Boise State Broncos
  'boise-state':       '🐎',

  // Army / Navy / Air Force
  'army':              '🪖',
  'navy':              '⚓',
  'air-force':         '✈️',

  // VCU Rams
  'vcu':               '🐏',

  // Richmond Spiders
  'richmond':          '🕷️',

  // UAB Blazers
  'uab':               '🔥',
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
  if (/bronco/.test(n))     return '🐎';
  if (/mustang/.test(n))    return '🐎';
  if (/ram|sheep/.test(n))  return '🐏';
  if (/irish/.test(n))      return '☘️';
  if (/orange/.test(n))     return '🍊';
  if (/volunteer/.test(n))  return '🍊';
  if (/panther/.test(n))    return '🐾';
  if (/bulldog/.test(n))    return '🐶';
  if (/penguin/.test(n))    return '🐧';
  if (/spider/.test(n))     return '🕷️';
  if (/blazer/.test(n))     return '🔥';
  if (/shocker/.test(n))    return '⚡';
  if (/flyer/.test(n))      return '✈️';
  if (/friar/.test(n))      return '✝️';
  if (/knight/.test(n))     return '⚔️';
  if (/musketeer/.test(n))  return '⚔️';
  if (/gamecock/.test(n))   return '🐓';
  if (/buffalo|bison|bull/.test(n)) return '🦬';

  return '';
}
