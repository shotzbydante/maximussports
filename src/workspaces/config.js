/**
 * Central workspace/sport registry.
 *
 * Every supported workspace is declared here with its capabilities,
 * labels, routing base, and access rules. Downstream code should
 * import from this module rather than hardcoding sport assumptions.
 */

import { isNbaPlayoffs } from '../sports/nba/season.js';

export const WorkspaceId = /** @type {const} */ ({
  CBB: 'cbb',
  MLB: 'mlb',
  NBA: 'nba',
  NFL: 'nfl',
});

/**
 * Season lifecycle states — canonical source of truth for all
 * downstream behavior (routing, emails, UI, cards).
 *
 * - 'active'    → live season, full product functionality
 * - 'completed' → season over, offseason mode (no emails, no live polling,
 *                  team cards show tournament finish, Home shows champion)
 * - 'preseason' → future: offseason with forward-looking content
 *
 * Seasonal checklist — when a season ends or starts, update that workspace's
 * `seasonState`, `championship`, `recap` and `nextSeason` together:
 *   - `championship` + `recap` describe the most recently completed season.
 *     They render as the full offseason recap while `completed`, and as a
 *     compact "defending champion" card once the next season is `active`.
 *   - `nextSeason.firstGameAt` drives the offseason countdown clock. It is
 *     only shown while the workspace is `completed`.
 */
export const SeasonState = /** @type {const} */ ({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PRESEASON: 'preseason',
});

/** @typedef {'cbb' | 'mlb' | 'nba' | 'nfl'} WorkspaceIdType */

/**
 * @typedef {Object} WorkspaceConfig
 * @property {WorkspaceIdType} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {string} routeBase        - URL prefix ('' for legacy CBB, '/mlb' for MLB)
 * @property {string} emoji
 * @property {string} sportKey         - canonical ESPN / Odds API sport key
 * @property {Object} capabilities
 * @property {boolean} capabilities.bracketology
 * @property {boolean} capabilities.contentStudio
 * @property {boolean} capabilities.champOdds
 * @property {boolean} capabilities.atsLeaders
 * @property {boolean} capabilities.conferenceIntel
 * @property {boolean} capabilities.oddsInsights
 * @property {boolean} capabilities.teamIntel
 * @property {boolean} capabilities.games
 * @property {boolean} capabilities.newsFeed
 * @property {boolean} capabilities.picks
 * @property {Object} access
 * @property {boolean} access.public
 * @property {string[]} [access.allowedEmails]
 * @property {Object} labels
 * @property {'active'|'completed'|'preseason'} seasonState
 * @property {Object} [championship]   - result of the most recently completed season
 * @property {Object} [recap]          - recap copy + facts for that season
 * @property {Object} [nextSeason]     - first game of the next season (countdown target)
 * @property {{ paused?: boolean }} [emails] - hold this sport's own emails while in season
 */

/** @type {Record<WorkspaceIdType, WorkspaceConfig>} */
export const WORKSPACES = {
  [WorkspaceId.NFL]: {
    id: WorkspaceId.NFL,
    label: 'National Football League',
    shortLabel: 'NFL',
    routeBase: '/nfl',
    emoji: '\u{1F3C8}',
    // No local league mark is bundled yet; team logos already load from the
    // same CDN. WorkspaceLogo falls back to the emoji if this fails to load.
    logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
    sportKey: 'americanfootball_nfl',
    seasonState: SeasonState.ACTIVE,
    capabilities: {
      bracketology: false,
      seasonIntel: true,
      // Slides and captions live in features/nfl/contentStudio. Autopost is
      // not built for NFL; posting is manual from the admin Content Studio.
      contentStudio: true,
      champOdds: true,
      atsLeaders: false,
      conferenceIntel: true,
      leagueIntel: false,
      divisionIntel: true,
      oddsInsights: true,
      teamIntel: true,
      games: true,
      newsFeed: true,
      picks: true,
    },
    access: { public: true },
    labels: {
      sportName: 'NFL Football',
      intelligence: 'NFL Intelligence',
      teamIntel: 'Team Intel',
      picks: 'Odds Insights',
      games: 'Games',
      news: 'News Feed',
    },
    /** Sport-aware theme — field green */
    theme: {
      mascot: '/mascot.png',
      accent: '#1f9d6b',
      accentRgb: '31, 157, 107',
      gradientBg: 'radial-gradient(ellipse at center, #0a1f18 0%, #06130f 60%, #020705 100%)',
      loadingTitle: 'Initializing NFL Intelligence',
      loadingSubtext: 'Reading the board\u2026',
      splashKey: '__maximus_nfl_splash_shown',
    },
  },
  [WorkspaceId.CBB]: {
    id: WorkspaceId.CBB,
    label: 'NCAA College Basketball',
    shortLabel: 'NCAAM',
    routeBase: '/ncaam',
    emoji: '\u{1F3C0}',
    logo: '/ncaa-logo.png',
    sportKey: 'basketball_ncaab',
    // 2026-27 tipped off Nov 2, 2026 and runs through the national title
    // game on Apr 5, 2027. Flip back to COMPLETED (and refresh `championship`
    // + `recap`, add `nextSeason`) once that game is final.
    seasonState: SeasonState.ACTIVE,
    /**
     * NCAAM emails (briefing, team digest, picks) were suspended for the
     * 2026 offseason and have not been sent this season. They stay paused
     * until someone has checked a test send against this season's data;
     * remove this flag to resume the daily sends.
     */
    emails: { paused: true },
    /** Most recently completed season — drives the Home champion card */
    championship: {
      year: 2026,
      seasonLabel: '2025-26',
      eventName: 'March Madness 2026',
      championTitle: 'National champion',
      defendingTitle: 'Defending national champion',
      champion: 'Michigan Wolverines',
      championSlug: 'michigan-wolverines',
      runnerUp: 'UConn Huskies',
      runnerUpSlug: 'uconn-huskies',
      score: '69-63',
      scoreLabel: 'Championship final',
      decidedOn: '2026-04-06',
      venue: 'Lucas Oil Stadium, Indianapolis',
      headline: 'Michigan finishes atop March Madness 2026.',
    },
    recap: {
      paragraphs: [
        'Michigan beat UConn 69-63 on April 6 at Lucas Oil Stadium in Indianapolis to win the national championship. It is the second title in program history and the first since 1989, and it ended a 26-year championship drought for the Big Ten.',
        'The Wolverines finished 37-3 under Dusty May. They reached the final with a 91-73 win over Arizona, while UConn got there by beating Illinois 71-62. Michigan guard Elliot Cadeau was named the Final Four\u2019s Most Outstanding Player.',
      ],
      facts: [
        { label: 'Title game', value: 'Michigan 69, UConn 63' },
        { label: 'Champion\u2019s record', value: '37-3' },
        { label: 'Most Outstanding Player', value: 'Elliot Cadeau' },
        { label: 'Final Four', value: 'Michigan, UConn, Arizona, Illinois' },
      ],
    },
    capabilities: {
      bracketology: true,
      contentStudio: true,
      champOdds: true,
      atsLeaders: true,
      conferenceIntel: true,
      oddsInsights: true,
      teamIntel: true,
      games: true,
      newsFeed: true,
      picks: true,
    },
    access: { public: true },
    labels: {
      sportName: 'College Basketball',
      intelligence: 'College Basketball Intelligence',
      teamIntel: 'Team Intel Hub',
      picks: 'Odds Insights',
      games: 'Games',
      news: 'News Feed',
    },
    /** Sport-aware theme — colors, mascot, loading copy */
    theme: {
      mascot: '/mascot-basketball.png',
      accent: '#3885e0',
      accentRgb: '56, 133, 224',
      gradientBg: 'radial-gradient(ellipse at center, #0a1628 0%, #060d1a 60%, #020408 100%)',
      loadingTitle: 'Initializing Tournament Intelligence',
      loadingSubtext: 'Loading Bracketology\u2026',
      splashKey: '__maximus_cbb_splash_shown',
    },
  },

  [WorkspaceId.MLB]: {
    id: WorkspaceId.MLB,
    label: 'Major League Baseball',
    shortLabel: 'MLB',
    routeBase: '/mlb',
    emoji: '\u{26BE}',
    logo: '/mlb-logo.png',
    sportKey: 'baseball_mlb',
    // The 2026 season ended Oct 28, 2026 (World Series Game 5). Flip back to
    // ACTIVE on Opening Night 2027.
    seasonState: SeasonState.COMPLETED,
    /** Most recently completed season — drives the offseason recap */
    championship: {
      year: 2026,
      seasonLabel: '2026',
      eventName: 'World Series 2026',
      championTitle: 'World Series champion',
      defendingTitle: 'Defending World Series champion',
      champion: 'Milwaukee Brewers',
      championSlug: 'mil',
      runnerUp: 'Tampa Bay Rays',
      runnerUpSlug: 'tb',
      score: '4-1',
      scoreLabel: 'World Series',
      decidedOn: '2026-10-28',
      venue: 'Tropicana Field, St. Petersburg',
      headline: 'Milwaukee wins the first World Series title in franchise history.',
    },
    recap: {
      paragraphs: [
        'The Milwaukee Brewers are World Series champions for the first time. They beat the Tampa Bay Rays in five games, closing it out with a 4-1 win at Tropicana Field on October 28. Catcher William Contreras was named Series MVP.',
        'Milwaukee had the best record in baseball at 103-59, a franchise record and the club\u2019s first 100-win season. The Brewers then went 11-2 in October: past the Padres in the Division Series, a four-game sweep of the two-time defending champion Dodgers in the NLCS, and the Rays in the Fall Classic. It was the franchise\u2019s first World Series appearance since 1982.',
        'The major awards went to first-time winners, all by unanimous vote. Houston\u2019s Yordan Alvarez and the Cubs\u2019 Pete Crow-Armstrong were the MVPs, and the Yankees\u2019 Cam Schlittler and Milwaukee\u2019s Jacob Misiorowski took the Cy Young Awards.',
      ],
      facts: [
        { label: 'World Series', value: 'Brewers 4, Rays 1' },
        { label: 'Champion\u2019s record', value: '103-59' },
        { label: 'Postseason', value: '11-2' },
        { label: 'World Series MVP', value: 'William Contreras' },
      ],
      honors: [
        { label: 'AL MVP', value: 'Yordan Alvarez', team: 'HOU' },
        { label: 'NL MVP', value: 'Pete Crow-Armstrong', team: 'CHC' },
        { label: 'AL Cy Young', value: 'Cam Schlittler', team: 'NYY' },
        { label: 'NL Cy Young', value: 'Jacob Misiorowski', team: 'MIL' },
      ],
    },
    /**
     * First regular-season game of the next season — drives the countdown.
     * MLB's 2027 schedule opens with a single Opening Night game on Netflix
     * (matchup and first pitch not yet announced); the 14-game traditional
     * Opening Day follows on Mar 25. Until a time is announced the clock runs
     * to 8:00 PM ET. Update `firstGameAt` and set `timeConfirmed: true` when
     * MLB announces it, or if the schedule moves (the CBA expires Dec 1, 2026).
     */
    nextSeason: {
      year: 2027,
      label: 'Opening Night 2027',
      shortLabel: 'Opening Night',
      firstGameAt: '2027-03-24T20:00:00-04:00',
      timeConfirmed: false,
      timeNote: 'first pitch time TBD',
      dateLabel: 'Wednesday, March 24, 2027',
      detail: 'One game on Netflix, matchup to be announced. The full Opening Day slate follows on Thursday, March 25.',
    },
    capabilities: {
      bracketology: false,
      seasonIntel: true,
      contentStudio: true,
      champOdds: true,
      atsLeaders: false,
      conferenceIntel: false,
      leagueIntel: true,
      divisionIntel: true,
      oddsInsights: true,
      teamIntel: true,
      games: true,
      newsFeed: true,
      picks: true,
    },
    access: {
      public: true,
    },
    /* badge removed — MLB is production-ready */
    labels: {
      sportName: 'Major League Baseball',
      intelligence: 'MLB Intelligence',
      teamIntel: 'Team Intel',
      picks: 'Odds Insights',
      games: 'Games',
      news: 'News Feed',
    },
    /** Sport-aware theme — colors, mascot, loading copy */
    theme: {
      mascot: '/mascot-mlb.png',
      accent: '#b8293d',
      accentRgb: '184, 41, 61',
      gradientBg: 'radial-gradient(ellipse at center, #1a0a10 0%, #0e0610 60%, #060208 100%)',
      loadingTitle: 'Initializing MLB Intelligence',
      loadingSubtext: 'Calibrating projections\u2026',
      splashKey: '__maximus_mlb_splash_shown',
    },
  },
  [WorkspaceId.NBA]: {
    id: WorkspaceId.NBA,
    label: 'National Basketball Association',
    shortLabel: 'NBA',
    routeBase: '/nba',
    emoji: '\u{1F3C0}',
    logo: '/nba-logo.png',
    sportKey: 'basketball_nba',
    seasonState: SeasonState.ACTIVE,
    capabilities: {
      // The bracket only means something from the play-in to the Finals.
      // During the regular season it would show last spring's field, so the
      // nav link, the home shortcut and the page itself are off until then.
      // The dates live in src/sports/nba/season.js.
      bracketology: isNbaPlayoffs(),
      seasonIntel: false,
      contentStudio: true,
      champOdds: true,
      atsLeaders: false,
      conferenceIntel: true,
      leagueIntel: false,
      divisionIntel: false,
      oddsInsights: true,
      teamIntel: true,
      games: true,
      newsFeed: true,
      picks: true,
    },
    access: { public: true },
    labels: {
      sportName: 'NBA Basketball',
      intelligence: 'NBA Intelligence',
      teamIntel: 'Team Intel',
      picks: 'Odds Insights',
      games: 'Games',
      news: 'News Feed',
    },
    /** Sport-aware theme — NBA Daily Briefing identity: black + gold */
    theme: {
      mascot: '/mascot-basketball.png',
      accent: '#d4af37',
      accentRgb: '212, 175, 55',
      gradientBg: 'radial-gradient(ellipse at center, #1a1408 0%, #0d0a04 60%, #050403 100%)',
      loadingTitle: 'Initializing NBA Intelligence',
      loadingSubtext: 'Loading court data\u2026',
      splashKey: '__maximus_nba_splash_shown',
    },
  },
};

export const WORKSPACE_LIST = Object.values(WORKSPACES);

/**
 * Order sports appear in wherever every sport is listed together (home
 * hub, cross-sport navigation). In-season sports lead; within a season
 * state this fixed order applies.
 */
const WORKSPACE_DISPLAY_ORDER = [WorkspaceId.NFL, WorkspaceId.NBA, WorkspaceId.MLB, WorkspaceId.CBB];

/** @param {WorkspaceConfig[]} list */
export function orderWorkspacesForDisplay(list) {
  const rank = (ws) => {
    const i = WORKSPACE_DISPLAY_ORDER.indexOf(ws.id);
    return (ws.seasonState === SeasonState.ACTIVE ? 0 : 100) + (i === -1 ? 50 : i);
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/** Default workspace — the sport whose nav shows on pages that are not
 *  sport-specific (home, dashboard, settings). NCAAM is in season; MLB held
 *  this slot until its 2026 season ended. Keep it on an in-season sport. */
export const DEFAULT_WORKSPACE_ID = WorkspaceId.CBB;

export function getWorkspace(id) {
  return WORKSPACES[id] ?? WORKSPACES[DEFAULT_WORKSPACE_ID];
}

/** Check if a workspace's season is in a given state */
export function isSeasonState(workspaceId, state) {
  const ws = WORKSPACES[workspaceId];
  return ws?.seasonState === state;
}

/** Check if a workspace's season is active (not completed/preseason) */
export function isSeasonActive(workspaceId) {
  return isSeasonState(workspaceId, SeasonState.ACTIVE);
}

/** Get the active-season workspace ID (for default routing) */
export function getActiveSeasonWorkspaceId() {
  for (const ws of WORKSPACE_LIST) {
    if (ws.seasonState === SeasonState.ACTIVE) return ws.id;
  }
  return DEFAULT_WORKSPACE_ID;
}

/** Check if a workspace's season is over (offseason recap mode) */
export function isSeasonCompleted(workspaceId) {
  return isSeasonState(workspaceId, SeasonState.COMPLETED);
}
