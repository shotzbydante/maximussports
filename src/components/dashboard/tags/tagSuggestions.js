/**
 * Static tag suggestion data for Social Content Studio.
 * Accounts are official/verified team, conference, or national media handles only.
 * Fan accounts and unverified handles are intentionally excluded.
 */

export const baseTags = [
  '@marchmadness',
  '@espn',
  '@CBSSports',
  '@NCAA',
  '@collegehoops',
  '@SportsCenter',
];

export const bySportsbookMedia = [
  '@ActionNetworkHQ',
  '@SportsLine',
  '@VegasInsider',
  '@TheAthletic',
  '@stadium',
];

export const byConference = {
  'ACC':           ['@theacc', '@ACCMBasketball'],
  'Big East':      ['@bigeast', '@BigEastMBB'],
  'Big Ten':       ['@bigten', '@B1GMBBall'],
  'Big 12':        ['@Big12Conference', '@Big12MBB'],
  'SEC':           ['@sec', '@SECMBasketball'],
  'AAC':           ['@TheAAC'],
  'Mountain West': ['@MountainWest', '@MWCsports'],
  'WCC':           ['@WCCsports'],
  'Atlantic 10':   ['@atlantic10'],
  'MVC':           ['@MVCsports'],
  'Pac-12':        ['@pac12', '@pac12mbb'],
  'American':      ['@TheAAC'],
  'Sun Belt':      ['@SunBeltSports'],
};

export const byTeamSlug = {
  'duke-blue-devils':            ['@dukebasketball', '@DukeAthletics', '@theacc'],
  'north-carolina-tar-heels':    ['@uncmbb', '@UNCAthletics', '@theacc'],
  'kentucky-wildcats':           ['@KentuckyMBB', '@UKAthletics', '@SECMBasketball'],
  'kansas-jayhawks':             ['@KUHoops', '@KUAthletics', '@Big12MBB'],
  'gonzaga-bulldogs':            ['@ZagsMBB', '@GonzagaAthletics', '@WCCsports'],
  'villanova-wildcats':          ['@NovaMBB', '@VillanovaU', '@BigEastMBB'],
  'houston-cougars':             ['@UHCougarsMBB', '@UHCougars', '@TheAAC'],
  'connecticut-huskies':         ['@UConnMBB', '@UConnAthletics', '@BigEastMBB'],
  'purdue-boilermakers':         ['@PurdueMBB', '@PurdueAthletics', '@B1GMBBall'],
  'michigan-wolverines':         ['@umichbball', '@UMichAthletics', '@B1GMBBall'],
  'alabama-crimson-tide':        ['@AlabamaMBB', '@UA_Athletics', '@SECMBasketball'],
  'tennessee-volunteers':        ['@Vol_Hoops', '@UTAthletics', '@SECMBasketball'],
  'baylor-bears':                ['@BaylorMBB', '@BaylorAthletics', '@Big12MBB'],
  'texas-longhorns':             ['@TexasMBB', '@TexasAthletics', '@Big12MBB'],
  'creighton-bluejays':          ['@CreightonMBB', '@GoCreighton', '@BigEastMBB'],
  'marquette-golden-eagles':     ['@MarquetteMBB', '@MarquetteU', '@BigEastMBB'],
  'st-johns-red-storm':          ['@StJohnsMBBall', '@StJohnsU', '@BigEastMBB'],
  'seton-hall-pirates':          ['@SetonHallMBB', '@SetonHallU', '@BigEastMBB'],
  'xavier-musketeers':           ['@XavierMBB', '@XavierAthletics', '@BigEastMBB'],
  'providence-friars':           ['@FriarsMBB', '@PCAthletics', '@BigEastMBB'],
  'iowa-state-cyclones':         ['@CycloneMBB', '@CycloneATH', '@Big12MBB'],
  'arizona-wildcats':            ['@ArizonaMBB', '@ArizonaAthletics', '@pac12mbb'],
  'auburn-tigers':               ['@AuburnMBB', '@AuburnAthletics', '@SECMBasketball'],
  'michigan-state-spartans':     ['@MSU_Basketball', '@MSUSpartans', '@B1GMBBall'],
  'ohio-state-buckeyes':         ['@OhioStateMBK', '@OhioStateAthl', '@B1GMBBall'],
  'indiana-hoosiers':            ['@IndianaMBB', '@IndianaAthletics', '@B1GMBBall'],
  'illinois-fighting-illini':    ['@IlliniMBB', '@IlliniAthletics', '@B1GMBBall'],
  'florida-gators':              ['@GatorsHoops', '@FloridaGators', '@SECMBasketball'],
  'arkansas-razorbacks':         ['@RazorbackMBB', '@RazorbacksUA', '@SECMBasketball'],
  'memphis-tigers':              ['@MemphisHoops', '@GoTigersGo', '@TheAAC'],
  'iowa-hawkeyes':               ['@IowaHoops', '@IowaHawkeyes', '@B1GMBBall'],
  'wisconsin-badgers':           ['@BadgerMBB', '@UWBadgers', '@B1GMBBall'],
  'arizona-state-sun-devils':    ['@ASUMBasketball', '@SunDevilAthletics', '@pac12mbb'],
  'san-diego-state-aztecs':      ['@Aztec_MBB', '@SDSUAthletics', '@MWCsports'],
  'saint-marys-gaels':           ['@SMCMensBball', '@saintmarys', '@WCCsports'],
  'loyola-chicago-ramblers':     ['@LUCMensBball', '@RamblersATH', '@MVCsports'],
  'florida-state-seminoles':     ['@FSUHoops', '@FSU_Athletics', '@theacc'],
  'virginia-cavaliers':          ['@UVAMensHoops', '@UVAAthletics', '@theacc'],
  'virginia-tech-hokies':        ['@VTMensHoops', '@HokieSports', '@theacc'],
  'north-carolina-state-wolfpack': ['@PackMensBball', '@NCStateAthletics', '@theacc'],
  'miami-hurricanes':            ['@MiamiMBball', '@CanesAthletics', '@theacc'],
  'oklahoma-sooners':            ['@OUMBasketball', '@soonersports', '@Big12MBB'],
  'oklahoma-state-cowboys':      ['@OSUCowboyBB', '@OSUAthletics', '@Big12MBB'],
  'west-virginia-mountaineers':  ['@WVUhoops', '@WVUSports', '@Big12MBB'],
  'kansas-state-wildcats':       ['@KStateMBB', '@KStateAthletics', '@Big12MBB'],
  'texas-christian-horned-frogs':['@TCUMensHoops', '@TCUAthletics', '@Big12MBB'],
  'utah-utes':                   ['@UtahMBB', '@UtahAthletics', '@pac12mbb'],
  'oregon-ducks':                ['@OregonMBB', '@OregonAthletics', '@pac12mbb'],
  'ucla-bruins':                 ['@UCLAMensHoops', '@UCLAAthletics', '@pac12mbb'],
  'southern-cal-trojans':        ['@USCMensHoops', '@USCAthletics', '@pac12mbb'],
  'colorado-buffaloes':          ['@CUBuffsMBB', '@CUBuffsAth', '@pac12mbb'],
  'washington-huskies':          ['@UWMensBball', '@UWAthletics', '@pac12mbb'],
  'stanford-cardinal':           ['@StanfordMBB', '@StanfordSports', '@pac12mbb'],
  'miami-ohio-redhawks':         ['@MiamiOHMBB', '@MiamiOHAthletics'],
};

/**
 * Get suggested tags for a given context (up to 12).
 * Falls back gracefully if team not mapped.
 */
export function getTagsForContext({ template, teamSlug, conference, awaySlug, homeSlug, gameMode } = {}) {
  const seen = new Set();
  const result = [];

  function add(tags) {
    (tags || []).forEach(t => {
      if (t && !seen.has(t)) { seen.add(t); result.push(t); }
    });
  }

  switch (template) {
    case 'team': {
      if (teamSlug && byTeamSlug[teamSlug]) {
        add(byTeamSlug[teamSlug]);
      }
      if (conference && byConference[conference]) {
        add(byConference[conference]);
      }
      add(baseTags);
      break;
    }
    case 'game': {
      if (gameMode === 'tournament' || gameMode === 'upset-radar') {
        add(baseTags.slice(0, 3));
        if (gameMode === 'upset-radar') {
          add(['@ActionNetworkHQ', '@TheAthletic', '@SportsLine']);
        } else {
          add(['@ActionNetworkHQ', '@TheAthletic']);
        }
        break;
      }
      if (awaySlug && byTeamSlug[awaySlug]) add(byTeamSlug[awaySlug].slice(0, 2));
      if (homeSlug && byTeamSlug[homeSlug]) add(byTeamSlug[homeSlug].slice(0, 2));
      add(baseTags);
      break;
    }
    case 'daily': {
      add(baseTags);
      add(['@bigten', '@theacc', '@sec', '@bigeast', '@Big12Conference']);
      break;
    }
    case 'odds': {
      add(bySportsbookMedia);
      add(baseTags);
      break;
    }
    default:
      add(baseTags);
  }

  return result.slice(0, 12);
}
