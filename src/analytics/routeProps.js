/**
 * routeProps — what a URL path means for analytics.
 *
 * Every pageview and event carries these, so usage can be broken down by
 * sport, page and team without each page having to say what it is.
 *
 *   /nfl                  → { sport: 'nfl',   page_type: 'home' }
 *   /nfl/teams/bills      → { sport: 'nfl',   page_type: 'team', team_slug: 'bills' }
 *   /ncaam/insights       → { sport: 'ncaam', page_type: 'picks' }
 *   /settings             → { page_type: 'settings' }
 */

export const SPORTS = ['ncaam', 'nba', 'mlb', 'nfl'];

/** Workspace ids differ from the URL/sport name for college basketball. */
const WORKSPACE_TO_SPORT = { cbb: 'ncaam', mlb: 'mlb', nba: 'nba', nfl: 'nfl' };

export function sportFromWorkspace(workspaceId) {
  return WORKSPACE_TO_SPORT[workspaceId] || null;
}

/** Second path segment → page type, shared by all sports. */
const SECTION_TO_PAGE_TYPE = {
  games: 'games',
  teams: 'teams',
  insights: 'picks',
  'odds-insights': 'picks',
  news: 'news',
  'season-model': 'season_model',
  'season-intel': 'season_model',
  compare: 'compare',
  bracketology: 'bracketology',
  alerts: 'alerts',
  friends: 'friends',
  join: 'join',
  'college-basketball-picks-today': 'seo_picks',
  'march-madness-betting-intelligence': 'seo_hub',
};

const TOP_LEVEL_PAGE_TYPE = {
  settings: 'settings',
  dashboard: 'dashboard',
  privacy: 'legal',
  terms: 'legal',
  contact: 'contact',
  share: 'share',
  auth: 'auth',
  render: 'render',
};

/**
 * @param {string} pathname
 * @returns {{ sport?: string, page_type: string, team_slug?: string }}
 */
export function describeRoute(pathname) {
  const parts = String(pathname || '/').split('?')[0].split('/').filter(Boolean);
  if (parts.length === 0) return { page_type: 'landing' };

  const [first, second, third] = parts.map((p) => p.toLowerCase());

  if (SPORTS.includes(first)) {
    if (!second) return { sport: first, page_type: 'home' };
    if (second === 'teams' && third) return { sport: first, page_type: 'team', team_slug: third };
    if (second === 'games' && third) return { sport: first, page_type: 'game' };
    return { sport: first, page_type: SECTION_TO_PAGE_TYPE[second] || 'other' };
  }

  return { page_type: TOP_LEVEL_PAGE_TYPE[first] || 'other' };
}
