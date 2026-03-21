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
});

/** @typedef {'cbb' | 'mlb'} WorkspaceIdType */

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
    shortLabel: 'CBB',
    routeBase: '',
    emoji: '\u{1F3C0}',
    logo: '/ncaa-logo.png',
    sportKey: 'basketball_ncaab',
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
  },

  [WorkspaceId.MLB]: {
    id: WorkspaceId.MLB,
    label: 'Major League Baseball',
    shortLabel: 'MLB',
    routeBase: '/mlb',
    emoji: '\u{26BE}',
    logo: '/mlb-logo.png',
    sportKey: 'baseball_mlb',
    capabilities: {
      bracketology: false,
      contentStudio: true,
      champOdds: true,
      atsLeaders: false,
      conferenceIntel: false,
      oddsInsights: true,
      teamIntel: true,
      games: true,
      newsFeed: true,
      picks: true,
    },
    access: {
      public: false,
      allowedEmails: ['dantedicicco@gmail.com'],
    },
    labels: {
      sportName: 'Major League Baseball',
      intelligence: 'MLB Intelligence',
      teamIntel: 'Team Intel',
      picks: 'Maximus Picks',
      games: 'Games',
      news: 'News Feed',
    },
  },
};

export const WORKSPACE_LIST = Object.values(WORKSPACES);

export const DEFAULT_WORKSPACE_ID = WorkspaceId.CBB;

export function getWorkspace(id) {
  return WORKSPACES[id] ?? WORKSPACES[DEFAULT_WORKSPACE_ID];
}
