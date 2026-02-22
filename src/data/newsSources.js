/**
 * News source registry — national feeds + team-specific RSS.
 * Google News is per-team via /api/news/team/[slug] (query-based, not listed here).
 */

export const NATIONAL_FEEDS = [
  { id: 'yahoo', name: 'Yahoo Sports', url: 'https://sports.yahoo.com/ncaab/rss.xml' },
  { id: 'cbs', name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/college-basketball/' },
  { id: 'ncaa', name: 'NCAA.com', url: 'https://www.ncaa.com/rss/feeds/college-basketball' },
];

export const TEAM_FEEDS = {
  'michigan-wolverines': [
    { id: 'mgoblog', name: 'MGoBlog', url: 'https://mgoblog.com/rss' },
  ],
  'michigan-state-spartans': [
    { id: 'theonlycolors', name: 'The Only Colors', url: 'https://www.theonlycolors.com/rss/current.xml' },
  ],
  'purdue-boilermakers': [
    { id: 'hammerandrails', name: 'Hammer & Rails', url: 'https://www.hammerandrails.com/rss/current.xml' },
  ],
  'illinois-fighting-illini': [
    { id: 'ontheblock', name: 'On The Block', url: 'https://www.ontheblockblog.com/rss/current.xml' },
  ],
  'nebraska-cornhuskers': [
    { id: 'cornnation', name: 'Corn Nation', url: 'https://www.cornnation.com/rss/current.xml' },
  ],
  'wisconsin-badgers': [
    { id: 'buckys5thquarter', name: "Bucky's 5th Quarter", url: 'https://www.buckys5thquarter.com/rss/current.xml' },
  ],
  'iowa-hawkeyes': [
    { id: 'blackheartgoldpants', name: 'Black Heart Gold Pants', url: 'https://www.blackheartgoldpants.com/rss/current.xml' },
  ],
  'ohio-state-buckeyes': [
    { id: 'landgrantholyland', name: 'Land Grant Holy Land', url: 'https://www.landgrantholyland.com/rss/current.xml' },
  ],
  'duke-blue-devils': [
    { id: 'dukebball', name: 'Duke Basketball Report', url: 'https://www.dukebasketballreport.com/rss/current.xml' },
  ],
  'north-carolina-tar-heels': [
    { id: 'tarheelblog', name: 'Tar Heel Blog', url: 'https://www.tarheelblog.com/rss/current.xml' },
  ],
  'kentucky-wildcats': [
    { id: 'aseaofblue', name: 'A Sea of Blue', url: 'https://www.aseaofblue.com/rss/current.xml' },
  ],
  'tennessee-volunteers': [
    { id: 'rockytoptalk', name: 'Rocky Top Talk', url: 'https://www.rockytoptalk.com/rss/current.xml' },
  ],
  'alabama-crimson-tide': [
    { id: 'rollbamaroll', name: 'Roll Bama Roll', url: 'https://www.rollbamaroll.com/rss/current.xml' },
  ],
  'florida-gators': [
    { id: 'alligatorarmy', name: 'Alligator Army', url: 'https://www.alligatorarmy.com/rss/current.xml' },
  ],
  'arkansas-razorbacks': [
    { id: 'arkansasfight', name: 'Arkansas Fight', url: 'https://www.arkansasfight.com/rss/current.xml' },
  ],
  'auburn-tigers': [
    { id: 'collegeandmagnolia', name: 'College and Magnolia', url: 'https://www.collegeandmagnolia.com/rss/current.xml' },
  ],
  'georgia-bulldogs': [
    { id: 'dawgnation', name: 'Dawg Nation', url: 'https://www.dawgnation.com/rss/' },
  ],
  'houston-cougars': [
    { id: 'undefeated', name: 'Underdog or UH Blog', url: 'https://www.undefeated.com/rss/' },
  ],
  'kansas-jayhawks': [
    { id: 'rockchalktalk', name: 'Rock Chalk Talk', url: 'https://www.rockchalktalk.com/rss/current.xml' },
  ],
  'texas-tech-red-raiders': [
    { id: 'vivathematadors', name: 'Viva The Matadors', url: 'https://www.vivathematadors.com/rss/current.xml' },
  ],
  'arizona-wildcats': [
    { id: 'beardown', name: 'Bear Down Arizona', url: 'https://www.beardown.com/rss/current.xml' },
  ],
  'uconn-huskies': [
    { id: 'uconnhuskies', name: 'The UConn Blog', url: 'https://theuconnblog.com/feed/' },
  ],
};
