/**
 * Gathers what the Daily Brief email is written from and builds its view
 * model (src/emails/dailyBrief/model.js).
 *
 * Everything here is what the app already serves, read the same way the
 * pages read it, so the email cannot say something the site does not:
 *   NFL  the scorecard (graded picks with their review notes, today's calls)
 *        and the home-page brief
 *   NBA  last night's finals, the picks ledger for that night, tonight's
 *        board and the home-page brief
 *
 * Each source is optional. One that is slow or down leaves its part of the
 * email out; it never holds up or fails the send.
 */
import { getJson } from '../_globalCache.js';
import { buildDailyBrief, ymdET, shiftYmd } from '../../src/emails/dailyBrief/model.js';

const SCORECARD_WAIT_MS = 15_000;
// A brief may be rewritten on request, which waits on the language model.
const BRIEF_WAIT_MS = 30_000;

async function getJsonUrl(url, waitMs, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), waitMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) { console.warn(`[dailyBrief] ${label} HTTP ${r.status}`); return null; }
    return await r.json();
  } catch (err) {
    console.warn(`[dailyBrief] ${label} failed: ${err?.name === 'AbortError' ? `no reply in ${waitMs}ms` : err?.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} baseUrl  this deployment's origin
 * @param {object} [have]   data the pipeline has already assembled
 * @param {Array}  [have.nbaResults]  last night's NBA finals
 * @param {object} [have.nbaBoard]    tonight's NBA picks board
 * @param {Date}   [have.now]
 */
export async function assembleDailyBrief(baseUrl, { nbaResults = [], nbaBoard = null, now = new Date() } = {}) {
  const yesterday = shiftYmd(ymdET(now), -1);
  const [scorecard, nflBrief, nbaBrief, ledger] = await Promise.all([
    getJsonUrl(`${baseUrl}/api/nfl/picks/scorecard?days=3`, SCORECARD_WAIT_MS, 'nfl scorecard'),
    getJsonUrl(`${baseUrl}/api/nfl/chat/homeSummary`, BRIEF_WAIT_MS, 'nfl brief'),
    getJsonUrl(`${baseUrl}/api/nba/chat/homeSummary`, BRIEF_WAIT_MS, 'nba brief'),
    getJson(`nba:picks:slate:${yesterday}`).catch(() => null),
  ]);

  const brief = buildDailyBrief({
    now,
    nfl: { scorecard: scorecard && !scorecard._error ? scorecard : null, brief: nflBrief?.brief || null },
    nba: { results: nbaResults, ledger, board: nbaBoard, brief: nbaBrief?.brief || null },
  });
  console.log('[dailyBrief]', JSON.stringify({
    subject: brief.subject,
    nfl: brief.nfl ? { yesterday: !!brief.nfl.yesterday, today: !!brief.nfl.today } : null,
    nba: brief.nba ? { lastNight: brief.nba.lastNight?.games?.length || 0, picksTonight: brief.nba.tonight?.pickCount || 0 } : null,
    sources: { scorecard: !!scorecard, nflBrief: !!nflBrief?.brief, nbaBrief: !!nbaBrief?.brief, ledger: !!ledger, nbaBoard: !!nbaBoard },
  }));
  return brief;
}
