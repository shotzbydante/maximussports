/**
 * Team config for news integration.
 * slug -> URL path
 * name -> display name
 * keywords -> Google News search terms (e.g. "Michigan basketball")
 */
export const TEAMS = [
  { slug: 'michigan-wolverines', name: 'Michigan Wolverines', keywords: 'Michigan basketball' },
  { slug: 'illinois-fighting-illini', name: 'Illinois Fighting Illini', keywords: 'Illinois basketball' },
  { slug: 'purdue-boilermakers', name: 'Purdue Boilermakers', keywords: 'Purdue basketball' },
  { slug: 'nebraska-cornhuskers', name: 'Nebraska Cornhuskers', keywords: 'Nebraska basketball' },
  { slug: 'michigan-state-spartans', name: 'Michigan State Spartans', keywords: 'Michigan State basketball' },
  { slug: 'florida-gators', name: 'Florida Gators', keywords: 'Florida basketball' },
  { slug: 'vanderbilt-commodores', name: 'Vanderbilt Commodores', keywords: 'Vanderbilt basketball' },
  { slug: 'alabama-crimson-tide', name: 'Alabama Crimson Tide', keywords: 'Alabama basketball' },
  { slug: 'arkansas-razorbacks', name: 'Arkansas Razorbacks', keywords: 'Arkansas basketball' },
  { slug: 'tennessee-volunteers', name: 'Tennessee Volunteers', keywords: 'Tennessee basketball' },
  { slug: 'duke-blue-devils', name: 'Duke Blue Devils', keywords: 'Duke basketball' },
  { slug: 'virginia-cavaliers', name: 'Virginia Cavaliers', keywords: 'Virginia basketball' },
  { slug: 'louisville-cardinals', name: 'Louisville Cardinals', keywords: 'Louisville basketball' },
  { slug: 'north-carolina-tar-heels', name: 'North Carolina Tar Heels', keywords: 'North Carolina basketball' },
  { slug: 'clemson-tigers', name: 'Clemson Tigers', keywords: 'Clemson basketball' },
  { slug: 'arizona-wildcats', name: 'Arizona Wildcats', keywords: 'Arizona basketball' },
  { slug: 'houston-cougars', name: 'Houston Cougars', keywords: 'Houston basketball' },
  { slug: 'iowa-state-cyclones', name: 'Iowa State Cyclones', keywords: 'Iowa State basketball' },
  { slug: 'kansas-jayhawks', name: 'Kansas Jayhawks', keywords: 'Kansas basketball' },
  { slug: 'texas-tech-red-raiders', name: 'Texas Tech Red Raiders', keywords: 'Texas Tech basketball' },
  { slug: 'byu-cougars', name: 'BYU Cougars', keywords: 'BYU basketball' },
];

export function getTeamBySlug(slug) {
  return TEAMS.find((t) => t.slug === slug);
}
