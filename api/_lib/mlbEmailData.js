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

export async function assembleMlbEmailData(baseUrl, opts = {}) {
  const { includeSummary = true } = opts;

  const fetches = [
    fetch(`${baseUrl}/api/mlb/news/headlines`)
      .then(r => r.ok ? r.json() : { headlines: [] })
      .catch(() => ({ headlines: [] })),
    fetch(`${baseUrl}/api/mlb/live/homeFeed`)
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({})),
  ];

  if (includeSummary) {
    fetches.push(
      fetch(`${baseUrl}/api/mlb/chat/homeSummary`)
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}))
    );
  }

  const [mlbNewsResult, mlbLiveResult, mlbSummaryResult] = await Promise.allSettled(fetches);

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

  console.log(`[mlbEmailData] Assembled: ${headlines.length} headlines, ${scoresToday.length} games, ${botIntelBullets.length} intel bullets, narrative=${!!narrativeParagraph}`);

  return {
    headlines,
    scoresToday,
    narrativeParagraph,
    botIntelBullets,
    // Empty NCAAM-specific fields so templates don't break
    rankingsTop25: [],
    atsLeaders: { best: [], worst: [] },
    oddsGames: [],
    modelSignals: [],
    tournamentMeta: {},
  };
}
