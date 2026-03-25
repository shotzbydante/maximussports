/**
 * teamSnapshot.js
 *
 * Client-side normalizer that produces a canonical "team intelligence snapshot"
 * from the raw data surfaces returned by /api/team/[slug], /api/odds/teamNextLine/[slug],
 * /api/odds/championship, and the Maximus ATS computation.
 *
 * Consumers:
 *   - Team page (TeamPage.jsx)
 *   - Dashboard Social Content Studio — Team Intel slides
 *   - Dashboard Social Content Studio — caption builder (team template)
 *   - Future: email digests, share cards
 *
 * Usage:
 *   import { buildTeamSnapshot } from '../utils/teamSnapshot.js';
 *   const snapshot = buildTeamSnapshot({ teamPageData, teamNextLineData, teamChampOddsMap, rankMap });
 *
 * Shape is documented via JSDoc below. All fields are nullable — consumers must
 * guard for null before rendering.
 */

import { computeAtsFromScheduleAndHistory } from '../components/team/MaximusInsight.jsx';

// ─── News quality helpers ─────────────────────────────────────────────────────

const WATCH_SPAM_RE  = /\bhow to watch\b|\bwatch live\b|\bwhere to watch\b|\bstream live\b/i;
const NATIONAL_RE    = /\bncaa\b|\bcollege basketball\b|\bncaab\b|\bap poll\b|\btop 25\b/i;

/**
 * Score a single headline for relevance to the given team.
 * Higher score = more relevant. Used to sort and cap watch-spam.
 *
 * @param {{ title: string, source?: string }} headline
 * @param {string} teamName
 * @returns {number}
 */
function scoreHeadline(headline, teamName) {
  const title = (headline.title || headline.headline || '').toLowerCase();
  const name  = (teamName || '').toLowerCase();

  let score = 0;

  // Direct mention of team name — highest signal
  if (name && title.includes(name.split(' ').slice(-1)[0])) score += 40;
  if (name && title.includes(name)) score += 20;

  // Recency bonus (headlines older than 7 days get penalised)
  if (headline.pubDate) {
    const ageDays = (Date.now() - new Date(headline.pubDate).getTime()) / 86_400_000;
    if (ageDays <= 1)  score += 15;
    else if (ageDays <= 3)  score += 8;
    else if (ageDays <= 7)  score += 3;
    else                    score -= 5;
  }

  // Penalty for generic "how to watch" / stream spam
  if (WATCH_SPAM_RE.test(title)) score -= 30;

  // Mild boost for national-context stories (still relevant but generic)
  if (NATIONAL_RE.test(title)) score += 5;

  return score;
}

const NEAR_DUPE_WINDOW = 5; // chars to compare for near-duplicate detection

/**
 * Deduplicate near-identical syndicated stories by title similarity.
 * Keeps the first occurrence in the array.
 *
 * @param {Array<{ title: string }>} headlines
 * @returns {Array}
 */
function dedupeHeadlines(headlines) {
  const seen = [];
  return headlines.filter(h => {
    const t = (h.title || h.headline || '').slice(0, 50).toLowerCase().replace(/\W/g, '');
    // Check if a very similar title was already seen
    const isDupe = seen.some(s => {
      if (Math.abs(s.length - t.length) > NEAR_DUPE_WINDOW) return false;
      let diffs = 0;
      for (let i = 0; i < Math.min(s.length, t.length); i++) {
        if (s[i] !== t[i]) diffs++;
        if (diffs > 4) return false;
      }
      return true;
    });
    if (!isDupe) seen.push(t);
    return !isDupe;
  });
}

/**
 * Select top headlines for a team: rank by relevance, dedupe, cap watch-spam.
 *
 * @param {Array}  rawHeadlines
 * @param {string} teamName
 * @param {number} [maxCount=5]
 * @returns {Array}
 */
function selectTopHeadlines(rawHeadlines, teamName, maxCount = 5) {
  if (!rawHeadlines?.length) return [];

  const scored = rawHeadlines.map(h => ({ ...h, _score: scoreHeadline(h, teamName) }));
  scored.sort((a, b) => b._score - a._score);

  const deduped = dedupeHeadlines(scored);

  // Cap watch-spam: no more than 1 watch/stream story in top results
  let watchCount = 0;
  const filtered = deduped.filter(h => {
    const isWatchSpam = WATCH_SPAM_RE.test((h.title || h.headline || '').toLowerCase());
    if (isWatchSpam) {
      watchCount++;
      return watchCount <= 1;
    }
    return true;
  });

  // eslint-disable-next-line no-unused-vars
  return filtered.slice(0, maxCount).map(({ _score: _omit, ...rest }) => rest);
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

/**
 * Derive a short personality string based on recent ATS form.
 * Used as a quick "vibe" label for team intel content.
 *
 * @param {{ last7?: { coverPct: number|null }, last30?: { coverPct: number|null } }} ats
 * @param {string|null} tier
 * @returns {string}
 */
export function teamPersonality(ats, tier) {
  const pct = ats?.last7?.coverPct ?? ats?.last30?.coverPct ?? null;

  if (pct === null) {
    if (tier === 'Lock')            return 'Championship-caliber. Sharp money pays attention.';
    if (tier === 'Should be in')    return 'Solid résumé. Right in the mix.';
    if (tier === 'Work to do')      return 'Playing from behind. Need results.';
    return 'Building momentum — every game counts.';
  }

  if (pct >= 65)  return `Covering at ${pct}% — the market hasn't caught up.`;
  if (pct >= 55)  return `Trending ATS at ${pct}%. Sharp bettors are watching.`;
  if (pct >= 45)  return `Hovering around the number at ${pct}%.`;
  if (pct >= 35)  return `Struggling ATS at ${pct}%. Contrarian opportunity?`;
  return `Tough stretch against the number (${pct}%). Value in the other direction.`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TeamSnapshot
 * @property {string}      slug                  - Team slug
 * @property {string}      displayName           - Team display name
 * @property {string|null} logo                  - Logo URL (from team object if available)
 * @property {string|null} conference
 * @property {number|null} rank                  - Current AP/CBS ranking
 * @property {string|null} tier                  - oddsTier: 'Lock'|'Should be in'|...
 * @property {number|null} championshipOdds      - American odds (negative = more likely)
 * @property {string|null} record                - W-L record string from schedule
 * @property {{ last7, last30, season }} ats     - ATS records per window
 * @property {object|null} nextGame              - Next upcoming event from schedule
 * @property {object|null} nextLine              - Next game odds line (consensus)
 * @property {string[]}    topHeadlines          - Top 3–5 quality-ranked headlines
 * @property {Array}       topVideos             - Top video items (pass-through from caller)
 * @property {string}      personality           - Short Maximus voice string
 * @property {object|null} _debug                - Debug metadata (null unless debug=true)
 */

/**
 * Build a canonical team intelligence snapshot from raw API data.
 *
 * All source objects are nullable — the function returns safe defaults.
 *
 * @param {{
 *   slug:               string,
 *   teamPageData:       object|null,   // from /api/team/[slug]
 *   teamNextLineData:   object|null,   // from /api/odds/teamNextLine/[slug]
 *   champOddsMap:       object,        // { [slug]: { bestChanceAmerican, american } }
 *   topVideos?:         Array,         // pre-fetched video items
 *   debug?:             boolean,
 * }} opts
 * @returns {TeamSnapshot}
 */
export function buildTeamSnapshot({
  slug,
  teamPageData   = null,
  teamNextLineData = null,
  champOddsMap   = {},
  topVideos      = [],
  debug          = false,
}) {
  const team        = teamPageData?.team ?? null;
  const displayName = team?.name ?? slug ?? '';
  const conference  = team?.conference ?? null;
  const tier        = team?.oddsTier ?? null;
  const rank        = teamPageData?.rank ?? null;

  // ── ATS ───────────────────────────────────────────────────────────────────
  // Compute from schedule + oddsHistory (same logic as MaximusInsight on Team Page)
  const ats = (teamPageData?.schedule && teamPageData?.oddsHistory && displayName)
    ? computeAtsFromScheduleAndHistory(
        teamPageData.schedule,
        teamPageData.oddsHistory,
        displayName,
      )
    : { last7: null, last30: null, season: null };

  // ── Championship odds ────────────────────────────────────────────────────
  const oddsEntry     = champOddsMap[slug] ?? champOddsMap[displayName] ?? null;
  const championshipOdds = oddsEntry?.bestChanceAmerican ?? oddsEntry?.american ?? null;

  // ── Record (from schedule events) ────────────────────────────────────────
  const events  = teamPageData?.schedule?.events ?? [];
  const finals  = events.filter(e => e.isFinal || (e.gameStatus || '').toLowerCase().includes('final'));
  const record  = finals.length > 0
    ? (() => {
        let w = 0, l = 0;
        for (const e of finals) {
          const hs = parseInt(e.homeScore ?? e.homeTeamScore, 10);
          const as = parseInt(e.awayScore ?? e.awayTeamScore, 10);
          if (isNaN(hs) || isNaN(as)) continue;
          const teamIsHome = (e.homeTeam || '').toLowerCase().includes(
            displayName.toLowerCase().split(' ').slice(-1)[0]
          );
          const won = teamIsHome ? hs > as : as > hs;
          if (won) w++; else l++;
        }
        return w + l > 0 ? `${w}-${l}` : null;
      })()
    : null;

  // ── Next game ─────────────────────────────────────────────────────────────
  const upcoming = events.filter(
    e => !e.isFinal && !(e.gameStatus || '').toLowerCase().includes('final')
  ).sort((a, b) => new Date(a.date ?? a.gameDate) - new Date(b.date ?? b.gameDate));

  const nextGame = upcoming[0] ?? null;
  const nextLine = teamNextLineData ?? null;

  // ── Headlines ─────────────────────────────────────────────────────────────
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentNews   = (teamPageData?.teamNews ?? []).filter(
    n => new Date(n.pubDate || 0).getTime() >= sevenDaysAgo
  );
  const allNews      = recentNews.length >= 3
    ? recentNews
    : (teamPageData?.teamNews ?? []);

  const topHeadlines = selectTopHeadlines(allNews, displayName, 5);

  // ── Personality ───────────────────────────────────────────────────────────
  const personality  = teamPersonality(ats, tier);

  // ── Debug metadata ────────────────────────────────────────────────────────
  const _debug = debug ? {
    newsTotal:    allNews.length,
    newsFiltered: topHeadlines.length,
    atsSource:    teamPageData?.schedule ? 'computed' : 'missing',
    rankSource:   rank != null ? 'api' : 'missing',
  } : null;

  return {
    slug,
    displayName,
    logo:            team?.logo ?? null,
    conference,
    rank,
    tier,
    championshipOdds,
    record,
    ats,
    nextGame,
    nextLine,
    topHeadlines,
    topVideos,
    personality,
    _debug,
  };
}
