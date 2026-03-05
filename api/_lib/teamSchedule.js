/* global process */
/**
 * Team schedule utilities shared by email templates and Home API responses.
 *
 * Provides:
 *  - findTeamGame(team, scores)        — multi-strategy match against a scores array
 *  - getTeamTodaySummary(team, scores) — returns { hasGame, game, gameInfo, nextNote }
 *
 * "Today" is computed in America/Los_Angeles by default (used for cron-sent emails).
 * All matching is done without relying solely on last-word heuristics, which fail when
 * ESPN returns shortDisplayName ("Duke") vs our full name ("Duke Blue Devils").
 */

/**
 * Build a set of lowercase string tokens used for fuzzy name matching.
 * Covers: full name words, slug parts, and short-name heuristics.
 *
 * @param {{ name?: string, slug?: string }} team
 * @returns {string[]}
 */
function teamMatchTokens(team) {
  const tokens = new Set();
  const name = (team.name || '').toLowerCase().trim();
  const slug = (team.slug || '').toLowerCase().trim();

  if (name) {
    // Every individual word (≥3 chars) is a token
    for (const w of name.split(/\s+/)) {
      if (w.length >= 3) tokens.add(w);
    }
    // Full name
    tokens.add(name);
    // First word (school / city: "Duke", "Kansas", "UConn")
    const words = name.split(/\s+/);
    if (words[0]) tokens.add(words[0]);
  }

  if (slug) {
    // Each segment of the slug: "duke-blue-devils" → ["duke","blue","devils"]
    for (const part of slug.split('-')) {
      if (part.length >= 3) tokens.add(part);
    }
    // First slug segment: "duke"
    tokens.add(slug.split('-')[0]);
  }

  return Array.from(tokens);
}

/**
 * Returns true if the game's homeTeam or awayTeam matches the given team.
 *
 * Tries multiple strategies to survive ESPN returning either the full display name
 * ("Duke Blue Devils") or only the short display name ("Duke").
 *
 * @param {{ name?: string, slug?: string }} team
 * @param {{ homeTeam?: string, awayTeam?: string }} game
 * @returns {boolean}
 */
export function teamMatchesGame(team, game) {
  if (!team || !game) return false;
  const tokens = teamMatchTokens(team);
  const home = (game.homeTeam || '').toLowerCase();
  const away = (game.awayTeam || '').toLowerCase();

  for (const token of tokens) {
    if (home.includes(token) || away.includes(token)) return true;
  }
  return false;
}

/**
 * Find the game for a given team from a scores array.
 *
 * @param {{ name: string, slug: string }} team
 * @param {Array<{homeTeam:string,awayTeam:string,gameStatus?:string,startTime?:string}>} scores
 * @returns {object|null}
 */
export function findTeamGame(team, scores) {
  if (!team || !Array.isArray(scores)) return null;
  return scores.find(g => teamMatchesGame(team, g)) || null;
}

/**
 * Compute "today" as YYYY-MM-DD in a given IANA timezone.
 *
 * @param {Date}   [now]
 * @param {string} [tz='America/Los_Angeles']
 * @returns {string}  e.g. "2026-03-05"
 */
export function getTodayInTz(now = new Date(), tz = 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}

/**
 * Format a UTC ISO date string as a human-readable local time.
 * e.g. "7:00 PM PT"
 *
 * @param {string} isoString
 * @param {string} [tz='America/Los_Angeles']
 * @returns {string}
 */
function formatGameTime(isoString, tz = 'America/Los_Angeles') {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
      timeZoneName: 'short',
    });
  } catch {
    return '';
  }
}

/**
 * Determine whether a game's startTime falls on "today" in the given timezone.
 *
 * @param {{ startTime?: string }} game
 * @param {string} todayStr  — "YYYY-MM-DD"
 * @param {string} [tz='America/Los_Angeles']
 * @returns {boolean}
 */
function gameIsToday(game, todayStr, tz = 'America/Los_Angeles') {
  if (!game?.startTime) return false;
  try {
    const d = new Date(game.startTime);
    const gameDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    return gameDate === todayStr;
  } catch {
    return false;
  }
}

/**
 * High-level summary of a team's game status for a given day.
 *
 * Returns:
 *  {
 *    hasGame:  boolean,
 *    game:     object|null,       — the raw matched game object
 *    gameInfo: string,            — human-readable HTML string for use in email
 *    gameInfoText: string,        — plain-text version for text emails
 *    isToday:  boolean,
 *  }
 *
 * @param {{ name: string, slug: string }} team
 * @param {Array}  scores        — today's score objects from fetchScoresSource()
 * @param {string} [tz='America/Los_Angeles']
 */
export function getTeamTodaySummary(team, scores, tz = 'America/Los_Angeles') {
  const now = new Date();
  const todayStr = getTodayInTz(now, tz);

  if (process.env?.NODE_ENV !== 'production') {
    console.log(`[teamSchedule] team=${team?.slug} today=${todayStr} scoresCount=${scores?.length ?? 0}`);
  }

  const game = findTeamGame(team, scores);

  if (!game) {
    return {
      hasGame: false,
      game: null,
      gameInfo: `<span style="color:#4a5568;font-size:11px;">No game today — check the app for upcoming schedule</span>`,
      gameInfoText: 'No game today',
      isToday: false,
    };
  }

  // Determine opponent from team's perspective
  const isHome = (game.homeTeam || '').toLowerCase().includes(
    (team.name || '').split(' ')[0].toLowerCase()
  ) || (team.slug || '').split('-').some(part =>
    (game.homeTeam || '').toLowerCase().includes(part)
  );

  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const homeAwayLabel = isHome ? 'vs' : '@';
  const status = game.gameStatus || game.status || 'Scheduled';
  const timeStr = formatGameTime(game.startTime, tz);

  const isLive = /\d|halftime|progress/i.test(status);
  const isFinal = /final|postponed/i.test(status);

  let gameInfo = '';
  let gameInfoText = '';

  if (isFinal) {
    gameInfo = `<span style="color:#3d9c74;font-size:11px;font-weight:600;">${homeAwayLabel} ${opponent || 'TBD'} &mdash; Final</span>`;
    gameInfoText = `${homeAwayLabel} ${opponent || 'TBD'} — Final`;
  } else if (isLive) {
    gameInfo = `<span style="color:#e06c3a;font-size:11px;font-weight:700;">LIVE: ${homeAwayLabel} ${opponent || 'TBD'} &mdash; ${status}</span>`;
    gameInfoText = `LIVE: ${homeAwayLabel} ${opponent || 'TBD'} — ${status}`;
  } else {
    const timeLabel = timeStr ? ` &mdash; ${timeStr}` : '';
    const timeLabelText = timeStr ? ` — ${timeStr}` : '';
    gameInfo = `<span style="color:#5a9fd4;font-size:11px;font-weight:600;">${homeAwayLabel} ${opponent || 'TBD'}${timeLabel}</span>`;
    gameInfoText = `${homeAwayLabel} ${opponent || 'TBD'}${timeLabelText}`;
  }

  return {
    hasGame: true,
    game,
    gameInfo,
    gameInfoText,
    isToday: gameIsToday(game, todayStr, tz),
  };
}

/**
 * Absolute URL for a team logo, suitable for use in email <img> tags.
 * Local assets are resolved to the production domain.
 *
 * @param {{ slug?: string, logo?: string }} team
 * @param {string} [baseUrl='https://maximussports.ai']
 * @returns {string|null}
 */
export function teamLogoUrl(team, baseUrl = 'https://maximussports.ai') {
  if (!team) return null;
  const path = team.logo || (team.slug ? `/logos/${team.slug}.svg` : null);
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${baseUrl}${path}`;
}
