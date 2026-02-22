/**
 * ATS (Against The Spread) computation helpers.
 * Spread is quoted for the away team: away +X, home -X.
 * Our team covers if (ourScore + ourSpread) > oppScore.
 * Push if equal, loss if less.
 */

/**
 * Parse spread string to number (e.g. "+3.5" -> 3.5, "-3" -> -3).
 * @param {string} spread - e.g. "+3.5", "-3", "3.5"
 * @returns {number|null}
 */
export function parseSpread(spread) {
  if (spread == null || spread === '') return null;
  const s = String(spread).trim();
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}

/**
 * Compute ATS result for a team given final score and that team's spread.
 * Spread: positive = underdog (team gets points), negative = favorite (team gives points).
 * @param {number|string} teamScore - Our team's final score
 * @param {number|string} oppScore - Opponent's final score
 * @param {string|number} teamSpread - Our spread (e.g. "+3.5" or -3.5 for home -3.5)
 * @returns {'W'|'L'|'P'}
 */
export function computeATS(teamScore, oppScore, teamSpread) {
  const ourScore = typeof teamScore === 'string' ? parseFloat(teamScore) : Number(teamScore);
  const theirScore = typeof oppScore === 'string' ? parseFloat(oppScore) : Number(oppScore);
  const spread = typeof teamSpread === 'number' ? teamSpread : parseSpread(teamSpread);

  if (isNaN(ourScore) || isNaN(theirScore) || spread == null) return null;

  const ourAdjusted = ourScore + spread;
  const margin = ourAdjusted - theirScore;

  if (Math.abs(margin) < 0.001) return 'P'; // push (account for float)
  return margin > 0 ? 'W' : 'L';
}

/**
 * Get our team's spread from odds game, given we are home or away.
 * Odds API: away outcome has positive point (e.g. +3.5), home has negative (e.g. -3.5).
 * @param {object} oddsGame - { homeTeam, awayTeam, spread }
 * @param {string} teamName - Our team display name
 * @param {'home'|'away'} homeAway - Whether we are home or away
 * @returns {string|null} - Our spread as string (e.g. "+3.5" or "-3")
 */
export function getOurSpread(oddsGame, teamName, homeAway) {
  if (!oddsGame?.spread) return null;
  const spreadNum = parseSpread(oddsGame.spread);
  if (spreadNum == null) return null;
  // Odds API spread is for away: away +X, home -X
  const ourSpread = homeAway === 'away' ? spreadNum : -spreadNum;
  return ourSpread > 0 ? `+${ourSpread}` : String(ourSpread);
}

/**
 * Compute ATS for our team from schedule event + matched odds.
 * @param {object} ev - Schedule event { ourScore, oppScore, homeAway, opponent, homeTeam, awayTeam }
 * @param {object|null} oddsGame - { homeTeam, awayTeam, spread }
 * @param {string} teamName - Our team name
 * @returns {'W'|'L'|'P'|null}
 */
export function computeATSForEvent(ev, oddsGame, teamName) {
  if (!ev || ev.ourScore == null || ev.oppScore == null || !oddsGame?.spread) return null;
  const ourSpread = getOurSpread(oddsGame, teamName, ev.homeAway);
  if (ourSpread == null) return null;
  return computeATS(ev.ourScore, ev.oppScore, ourSpread);
}

/**
 * Aggregate ATS record from list of outcomes.
 * @param {Array<'W'|'L'|'P'>} outcomes - Filter out null
 * @returns {{ w: number, l: number, p: number, total: number, coverPct: number }}
 */
export function aggregateATS(outcomes) {
  const filtered = outcomes.filter((o) => o === 'W' || o === 'L' || o === 'P');
  const w = filtered.filter((o) => o === 'W').length;
  const l = filtered.filter((o) => o === 'L').length;
  const p = filtered.filter((o) => o === 'P').length;
  const total = filtered.length;
  const decided = w + l;
  const coverPct = decided > 0 ? Math.round((w / decided) * 100) : null;
  return { w, l, p, total, coverPct };
}
