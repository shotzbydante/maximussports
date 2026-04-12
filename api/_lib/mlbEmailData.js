/**
 * assembleMlbEmailData — canonical MLB-only data source for all email paths.
 *
 * Every MLB email entry point (run-daily, send-test, preview, global-send)
 * MUST use this helper instead of calling NCAAM sources (fetchScoresSource,
 * fetchRankingsSource, fetchNewsAggregateSource, getAtsLeadersPipeline).
 *
 * Sources:
 *   /api/mlb/news/headlines      → MLB-only Google News RSS headlines
 *   /api/mlb/live/homeFeed       → ESPN MLB scoreboard + odds enrichment
 *   /api/mlb/chat/homeSummary    → AI-generated MLB editorial narrative
 *
 * @param {string} baseUrl — e.g. "http://localhost:3000" or "https://maximussports.ai"
 * @param {object} [opts]
 * @param {boolean} [opts.includeSummary=true] — fetch the AI narrative (slower; skip for picks/digest)
 * @param {boolean} [opts.includePicks=false] — fetch picks board + run buildMlbPicks (for picks email)
 * @returns {Promise<MlbEmailPayload>}
 */

const NCAAM_CONTAMINATION_KEYWORDS = [
  'college basketball', 'ncaa', 'transfer portal', 'ap top 25',
  'final four', 'march madness', 'sweet 16', 'elite eight',
  'ncaam', 'men\'s college basketball', 'cbb',
];

/**
 * Validate that headlines are actually MLB content.
 * Returns filtered array with contaminated items removed.
 * Logs warnings if contamination is detected.
 */
function validateMlbHeadlines(headlines) {
  if (!Array.isArray(headlines) || headlines.length === 0) return headlines;

  const clean = [];
  let contaminated = 0;

  for (const h of headlines) {
    const title = (h.title || '').toLowerCase();
    const isContaminated = NCAAM_CONTAMINATION_KEYWORDS.some(kw => title.includes(kw));
    if (isContaminated) {
      contaminated++;
      console.warn(`[mlbEmailData] CONTAMINATION BLOCKED: "${h.title}"`);
    } else {
      clean.push(h);
    }
  }

  if (contaminated > 0) {
    console.warn(`[mlbEmailData] Blocked ${contaminated}/${headlines.length} non-MLB headlines`);
  }

  return clean;
}

/**
 * Validate that scores are actually MLB games (not college basketball).
 */
function validateMlbScores(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return scores;

  return scores.filter(g => {
    const teams = `${g.homeTeam || ''} ${g.awayTeam || ''}`.toLowerCase();
    const isContaminated = NCAAM_CONTAMINATION_KEYWORDS.some(kw => teams.includes(kw));
    if (isContaminated) {
      console.warn(`[mlbEmailData] SCORE CONTAMINATION BLOCKED: ${g.awayTeam} vs ${g.homeTeam}`);
      return false;
    }
    return true;
  });
}

import { buildLeadersEditorialHook } from '../../src/data/mlb/seasonLeaders.js';

export async function assembleMlbEmailData(baseUrl, opts = {}) {
  const { includeSummary = true, includePicks = false } = opts;

  const fetches = [
    fetch(`${baseUrl}/api/mlb/news/headlines`)
      .then(r => r.ok ? r.json() : { headlines: [] })
      .catch(() => ({ headlines: [] })),
    fetch(`${baseUrl}/api/mlb/live/homeFeed`)
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({})),
    fetch(`${baseUrl}/api/mlb/leaders`)
      .then(r => r.ok ? r.json() : { categories: {} })
      .catch(() => ({ categories: {} })),
    fetch(`${baseUrl}/api/mlb/odds/championship`)
      .then(r => r.ok ? r.json() : { odds: {} })
      .catch(() => ({ odds: {} })),
  ];

  if (includeSummary) {
    fetches.push(
      fetch(`${baseUrl}/api/mlb/chat/homeSummary`)
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}))
    );
  }

  if (includePicks) {
    fetches.push(
      fetch(`${baseUrl}/api/mlb/picks/built`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );
  }

  const results = await Promise.allSettled(fetches);
  const [mlbNewsResult, mlbLiveResult, mlbLeadersResult, mlbChampOddsResult, ...rest] = results;
  const mlbSummaryResult = includeSummary ? rest.shift() : null;
  const mlbPicksBuiltResult = includePicks ? rest.shift() : null;

  // Headlines
  const mlbNews = mlbNewsResult.status === 'fulfilled' ? mlbNewsResult.value : {};
  const rawHeadlines = (mlbNews.headlines || []).map(h => ({
    title: h.title,
    link: h.link,
    source: h.source,
    pubDate: h.time || null,
  }));
  const headlines = validateMlbHeadlines(rawHeadlines);

  // Live scores
  const mlbLive = mlbLiveResult.status === 'fulfilled' ? mlbLiveResult.value : {};
  const liveGames = [...(mlbLive.liveNow || []), ...(mlbLive.startingSoon || [])];
  const rawScores = liveGames.map(g => ({
    homeTeam: g.homeTeam || g.home?.name || '',
    awayTeam: g.awayTeam || g.away?.name || '',
    homeScore: g.homeScore ?? g.home?.score ?? null,
    awayScore: g.awayScore ?? g.away?.score ?? null,
    gameStatus: g.status || g.gameStatus || 'Scheduled',
    statusType: g.statusType || '',
    spread: g.spread || null,
    overUnder: g.overUnder || g.total || null,
    moneylineHome: g.moneylineHome || null,
  }));
  const scoresToday = validateMlbScores(rawScores);

  // AI narrative summary
  let narrativeParagraph = '';
  let botIntelBullets = [];
  if (includeSummary && mlbSummaryResult?.status === 'fulfilled') {
    const mlbSummary = mlbSummaryResult.value;
    if (mlbSummary?.summary) {
      narrativeParagraph = mlbSummary.summary;
      botIntelBullets = mlbSummary.summary
        .split(/\n+/)
        .map(l => l.trim())
        .filter(l => l.length > 30 && l.length < 300)
        .slice(0, 4);
    }
  }

  // Picks board (from /api/mlb/picks/built — pre-built server-side)
  let picksBoard = null;
  if (includePicks) {
    if (mlbPicksBuiltResult?.status === 'fulfilled') {
      const builtData = mlbPicksBuiltResult.value;
      if (builtData?.categories) {
        picksBoard = builtData;
        const c = builtData.categories;
        const total = (c.pickEms?.length || 0) + (c.ats?.length || 0) + (c.leans?.length || 0) + (c.totals?.length || 0);
        console.log(`[mlbEmailData] Picks received: total=${total} pickEms=${c.pickEms?.length || 0} ats=${c.ats?.length || 0} leans=${c.leans?.length || 0} totals=${c.totals?.length || 0}`);
        if (builtData._error) {
          console.warn(`[mlbEmailData] Picks endpoint reported error: ${builtData._error}`);
        }
        if (builtData._debug) {
          console.log(`[mlbEmailData] Picks debug: totalGames=${builtData._debug.totalGames} upcoming=${builtData._debug.upcoming} enriched=${builtData._debug.enriched}`);
        }
      } else {
        console.warn(`[mlbEmailData] /api/mlb/picks/built returned no categories:`, JSON.stringify(builtData)?.slice(0, 300));
      }
    } else {
      console.error(`[mlbEmailData] Picks fetch FAILED: status=${mlbPicksBuiltResult?.status} reason=${mlbPicksBuiltResult?.reason?.message || 'unknown'}`);
    }
  }

  // Season leaders editorial hook + raw data
  const mlbLeadersData = mlbLeadersResult?.status === 'fulfilled' ? mlbLeadersResult.value : {};
  const leadersEditorial = buildLeadersEditorialHook(mlbLeadersData) || null;

  // Championship odds — normalize to { [slug]: { american, bestChanceAmerican } }
  const champOddsRaw = mlbChampOddsResult?.status === 'fulfilled' ? mlbChampOddsResult.value : {};
  const champOdds = champOddsRaw?.odds || champOddsRaw || {};

  console.log(`[mlbEmailData] Assembled: ${headlines.length} headlines, ${scoresToday.length} games, ${botIntelBullets.length} intel bullets, narrative=${!!narrativeParagraph}, picks=${!!picksBoard}, leaders=${!!leadersEditorial}, champOdds=${Object.keys(champOdds).length}`);

  return {
    headlines,
    scoresToday,
    narrativeParagraph,
    botIntelBullets,
    picksBoard,
    leadersEditorial,
    leadersCategories: mlbLeadersData?.categories || {},
    champOdds,
    // Empty NCAAM-specific fields so templates don't break
    rankingsTop25: [],
    atsLeaders: { best: [], worst: [] },
    oddsGames: [],
    modelSignals: [],
    tournamentMeta: {},
  };
}
