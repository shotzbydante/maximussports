/**
 * Central workspace/sport registry.
 *
 * Every supported workspace is declared here with its capabilities,
 * labels, routing base, and access rules. Downstream code should
 * import from this module rather than hardcoding sport assumptions.
 */

export const WorkspaceId = /** @type {const} */ ({
  CBB: 'cbb',
  MLB: 'mlb',
  NBA: 'nba',
});

/**
 * Season lifecycle states — canonical source of truth for all
 * downstream behavior (routing, emails, UI, cards).
 *
 * - 'active'    → live season, full product functionality
 * - 'completed' → season over, offseason mode (no emails, no live polling,
 *                  team cards show tournament finish, Home shows champion)
 * - 'preseason' → future: offseason with forward-looking content
 */
export const SeasonState = /** @type {const} */ ({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PRESEASON: 'preseason',
});

/** @typedef {'cbb' | 'mlb' | 'nba'} WorkspaceIdType */

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
 */

/** @type {Record<WorkspaceIdType, WorkspaceConfig>} */
export const WORKSPACES = {
  [WorkspaceId.CBB]: {
    id: WorkspaceId.CBB,
    label: 'NCAA College Basketball',
    shortLabel: 'NCAAM',
    routeBase: '/ncaam',
    emoji: '\u{1F3C0}',
    logo: '/ncaa-logo.png',
    sportKey: 'basketball_ncaab',
    seasonState: SeasonState.COMPLETED,
    /** Championship result — drives the Home editorial hero and offseason mode */
    championship: {
      year: 2026,
      champion: 'Michigan Wolverines',
      championSlug: 'michigan-wolverines',
      runnerUp: 'UConn Huskies',
      runnerUpSlug: 'uconn-huskies',
      score: '69-63',
      headline: 'Michigan finishes atop March Madness 2026.',
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
      mascot: '/mascot.png',
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
    seasonState: SeasonState.ACTIVE,
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
      bracketology: true,
      seasonIntel: false,
      contentStudio: false,
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
      intelligence: 'NBA Playoffs Intelligence',
      teamIntel: 'Team Intel',
      picks: 'Odds Insights',
      games: 'Games',
      news: 'News Feed',
    },
    /** Sport-aware theme — deep navy palette */
    theme: {
      mascot: '/mascot.png',
      accent: '#1d428a',
      accentRgb: '29, 66, 138',
      gradientBg: 'radial-gradient(ellipse at center, #0a1628 0%, #060d1a 60%, #020408 100%)',
      loadingTitle: 'Initializing NBA Intelligence',
      loadingSubtext: 'Loading court data\u2026',
      splashKey: '__maximus_nba_splash_shown',
    },
  },
};

export const WORKSPACE_LIST = Object.values(WORKSPACES);

/** Default workspace — MLB is the active season sport.
 *  Change back to CBB when NCAAM season resumes. */
export const DEFAULT_WORKSPACE_ID = WorkspaceId.MLB;

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
