/**
 * Team config for Reddit integration.
 * slug -> used in URLs
 * name -> display name
 * subreddit -> primary subreddit (optional)
 * keywords -> fallback search terms for r/CollegeBasketball
 */
export const TEAMS = [
  { slug: 'michigan-wolverines', name: 'Michigan Wolverines', subreddit: 'MichiganWolverines', keywords: 'Michigan basketball' },
  { slug: 'illinois-fighting-illini', name: 'Illinois Fighting Illini', subreddit: 'UIUC', keywords: 'Illinois basketball' },
  { slug: 'purdue-boilermakers', name: 'Purdue Boilermakers', subreddit: 'Purdue', keywords: 'Purdue basketball' },
  { slug: 'nebraska-cornhuskers', name: 'Nebraska Cornhuskers', subreddit: 'Huskers', keywords: 'Nebraska basketball' },
  { slug: 'michigan-state-spartans', name: 'Michigan State Spartans', subreddit: 'theonlycolors', keywords: 'Michigan State basketball' },
  { slug: 'florida-gators', name: 'Florida Gators', subreddit: 'FloridaGators', keywords: 'Florida basketball' },
  { slug: 'vanderbilt-commodores', name: 'Vanderbilt Commodores', subreddit: 'vanderbilt', keywords: 'Vanderbilt basketball' },
  { slug: 'alabama-crimson-tide', name: 'Alabama Crimson Tide', subreddit: 'rolltide', keywords: 'Alabama basketball' },
  { slug: 'arkansas-razorbacks', name: 'Arkansas Razorbacks', subreddit: 'razorbacks', keywords: 'Arkansas basketball' },
  { slug: 'tennessee-volunteers', name: 'Tennessee Volunteers', subreddit: 'ockytop', keywords: 'Tennessee basketball' },
  { slug: 'duke-blue-devils', name: 'Duke Blue Devils', subreddit: 'CollegeBasketball', keywords: 'Duke basketball' },
  { slug: 'virginia-cavaliers', name: 'Virginia Cavaliers', subreddit: 'UVA', keywords: 'Virginia basketball' },
  { slug: 'louisville-cardinals', name: 'Louisville Cardinals', subreddit: 'AllHail', keywords: 'Louisville basketball' },
  { slug: 'north-carolina-tar-heels', name: 'North Carolina Tar Heels', subreddit: 'tarheels', keywords: 'North Carolina basketball' },
  { slug: 'clemson-tigers', name: 'Clemson Tigers', subreddit: 'ClemsonTigers', keywords: 'Clemson basketball' },
  { slug: 'arizona-wildcats', name: 'Arizona Wildcats', subreddit: 'UofArizona', keywords: 'Arizona basketball' },
  { slug: 'houston-cougars', name: 'Houston Cougars', subreddit: 'UniversityOfHouston', keywords: 'Houston basketball' },
  { slug: 'iowa-state-cyclones', name: 'Iowa State Cyclones', subreddit: 'cyclONEnation', keywords: 'Iowa State basketball' },
  { slug: 'kansas-jayhawks', name: 'Kansas Jayhawks', subreddit: 'jayhawks', keywords: 'Kansas basketball' },
  { slug: 'texas-tech-red-raiders', name: 'Texas Tech Red Raiders', subreddit: 'TexasTech', keywords: 'Texas Tech basketball' },
  { slug: 'byu-cougars', name: 'BYU Cougars', subreddit: 'BYU', keywords: 'BYU basketball' },
];

export function getTeamBySlug(slug) {
  return TEAMS.find((t) => t.slug === slug);
}
