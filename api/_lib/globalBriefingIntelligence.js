/**
 * globalBriefingIntelligence — deterministic intelligence-layer helpers for
 * the Global Daily Briefing email. NO LLM calls, NO new backend endpoints.
 *
 * Every helper here transforms ALREADY-AVAILABLE data (odds, standings,
 * narrative text, results) into compact analytical phrasing. Each helper
 * is pure (input → string output) for easy testing.
 *
 * Helpers:
 *   - buildCrossSportHook({ nbaData, mlbData })
 *   - buildResultInsight(result, { sport, topOddsSlugs, narrative })
 *   - buildNbaModelWatch({ nbaChampOdds, nbaStandings, nbaYesterdayResults, nbaNarrative })
 *   - buildOddsMarketRead(odds, { sport, teamInfo })
 */

// ── Helpers ──────────────────────────────────────────────────────

const NBA_PLAYOFF_KEYWORDS = ['playoff', 'series', 'game 7', 'elimination', 'eliminat',
  'closeout', 'advance', 'sweep', 'comeback', 'force', 'finals'];
const MLB_RACE_KEYWORDS = ['contender', 'division', 'race', 'first place', 'lead',
  'pennant', 'extend', 'separate', 'tighten', 'streak', 'odds movement'];

function lc(s) { return (s || '').toLowerCase(); }

function narrativeMentions(narrative, keywords) {
  const text = lc(narrative);
  if (!text) return false;
  return keywords.some(k => text.includes(k));
}

function impliedProb(americanOdds) {
  if (americanOdds == null) return 0;
  return americanOdds < 0
    ? -americanOdds / (-americanOdds + 100)
    : 100 / (americanOdds + 100);
}

/** Sort odds object → array of {slug, val} sorted by best chance */
function sortedOddsArray(odds) {
  if (!odds || typeof odds !== 'object') return [];
  return Object.entries(odds)
    .map(([slug, o]) => ({ slug, val: o.bestChanceAmerican ?? o.american ?? null }))
    .filter(t => t.val != null)
    .sort((a, b) => impliedProb(b.val) - impliedProb(a.val));
}

// ══════════════════════════════════════════════════════════════
// 1. CROSS-SPORT HOOK
// ══════════════════════════════════════════════════════════════

/**
 * Single synthesis line that frames today's email. ~120 chars max.
 * Pure function: deterministic from NBA+MLB narrative content presence.
 */
export function buildCrossSportHook({ nbaData, mlbData } = {}) {
  const nba = lc(nbaData?.narrativeParagraph);
  const mlb = lc(mlbData?.narrativeParagraph);
  const hasNba = nba.length > 30;
  const hasMlb = mlb.length > 30;

  const nbaPlayoff = hasNba && narrativeMentions(nba, NBA_PLAYOFF_KEYWORDS);
  const mlbRace = hasMlb && narrativeMentions(mlb, MLB_RACE_KEYWORDS);

  if (hasNba && hasMlb) {
    if (nbaPlayoff && mlbRace) {
      return 'NBA playoff pressure is peaking while MLB contenders keep separating.';
    }
    if (nbaPlayoff) {
      return 'NBA playoff pressure is peaking with MLB intel layered in.';
    }
    if (mlbRace) {
      return 'MLB contender races are sharpening, with NBA postseason context alongside.';
    }
    return 'NBA and MLB intel layered for one cross-sport read.';
  }

  if (hasNba) {
    return nbaPlayoff
      ? 'NBA playoff intensity leads today’s board.'
      : 'NBA intel leads today’s board.';
  }

  if (hasMlb) {
    return mlbRace
      ? 'MLB races and odds movement headline today’s board.'
      : 'MLB intel headlines today’s board.';
  }

  return 'Cross-sport model signals refresh as the day’s data lands.';
}

// ══════════════════════════════════════════════════════════════
// 2. RESULT INSIGHT
// ══════════════════════════════════════════════════════════════

/**
 * Returns a short context phrase to append to a result row.
 * Strict rules — never hallucinate series outcomes or standings claims.
 *
 * @param {object} result — { away: {abbrev, slug, score}, home: {...}, seriesNote }
 * @param {object} ctx — { sport: 'nba'|'mlb', topOddsSlugs?: string[], narrative?: string }
 */
export function buildResultInsight(result, ctx = {}) {
  if (!result?.away || !result?.home) return '';
  const aScore = Number(result.away.score);
  const hScore = Number(result.home.score);
  if (!Number.isFinite(aScore) || !Number.isFinite(hScore)) return '';

  const winner = aScore > hScore ? result.away : (hScore > aScore ? result.home : null);
  if (!winner) return '';

  const winnerSlug = (winner.slug || '').toLowerCase();
  const sport = ctx.sport === 'nba' ? 'nba' : 'mlb';
  const topOdds = (ctx.topOddsSlugs || []).map(s => s.toLowerCase());
  const narrative = lc(ctx.narrative);

  if (sport === 'nba') {
    // Series context wins (only use what ESPN actually returned)
    const series = lc(result.seriesNote || '');
    if (series.includes('advance') || series.includes('eliminat')) {
      return `${winner.abbrev || winner.slug?.toUpperCase() || ''} advance`.trim();
    }
    if (series.includes('game 7') || series.includes('force')) {
      return 'Series goes the distance';
    }
    if (series && series !== 'final') {
      // Use the series note directly if ESPN provided one (e.g. "OKC leads 3-2")
      return series.charAt(0).toUpperCase() + series.slice(1);
    }
    // No series context — generic playoff phrasing
    if (winnerSlug && topOdds.includes(winnerSlug)) {
      return `${winner.abbrev || winner.slug?.toUpperCase()} keeps title-side pressure`;
    }
    return 'Adds pressure to the playoff race';
  }

  // MLB
  if (winnerSlug && topOdds.length > 0) {
    if (topOdds[0] === winnerSlug) {
      return `${winner.abbrev || winner.slug?.toUpperCase()} keeps separation in the race`;
    }
    if (topOdds.includes(winnerSlug)) {
      return `${winner.abbrev || winner.slug?.toUpperCase()} keeps pressure on the contender tier`;
    }
  }
  return 'Adds another result to the early-season picture';
}

// ══════════════════════════════════════════════════════════════
// 3. NBA MODEL WATCH (replaces "NBA picks coming soon")
// ══════════════════════════════════════════════════════════════

/**
 * Build 2-3 deterministic "Model Watch" rows from existing NBA data.
 * Strict rules: no fake spreads, no fake confidence, no fake edges.
 * All rows are caveated as "model watch" / "lean" / "signal" — never
 * labeled as official picks.
 *
 * @returns {Array<{ slug, label, signal, kind }>}
 *   kind: 'anchor' | 'riser' | 'volatile' | 'narrative'
 */
export function buildNbaModelWatch({
  nbaChampOdds,
  nbaStandings,
  nbaYesterdayResults,
  nbaNarrative,
} = {}) {
  const sorted = sortedOddsArray(nbaChampOdds);
  if (sorted.length === 0) return [];

  const rows = [];
  const used = new Set();

  // 1. Title anchor — top-odds team
  const anchor = sorted[0];
  if (anchor) {
    rows.push({
      slug: anchor.slug,
      label: anchor.slug.toUpperCase(),
      signal: `Title-side anchor based on current championship pricing`,
      kind: 'anchor',
    });
    used.add(anchor.slug);
  }

  // 2. Riser — yesterday's winning team that also appears in top 5 odds
  const top5 = sorted.slice(0, 5).map(t => t.slug);
  const yesterdayWinners = (nbaYesterdayResults || [])
    .filter(g => g?.away?.score != null && g?.home?.score != null)
    .map(g => {
      const aScore = Number(g.away.score);
      const hScore = Number(g.home.score);
      const winner = aScore > hScore ? g.away : (hScore > aScore ? g.home : null);
      return winner?.slug || null;
    })
    .filter(Boolean);

  for (const winnerSlug of yesterdayWinners) {
    if (used.has(winnerSlug)) continue;
    if (top5.includes(winnerSlug)) {
      rows.push({
        slug: winnerSlug,
        label: winnerSlug.toUpperCase(),
        signal: `Trending as a playoff riser after its latest result`,
        kind: 'riser',
      });
      used.add(winnerSlug);
      if (rows.length >= 3) break;
    }
  }

  // 3. Volatile — if we still have room and a 2nd-tier team exists
  if (rows.length < 3 && sorted.length >= 2) {
    const challenger = sorted.slice(1, 5).find(t => !used.has(t.slug));
    if (challenger) {
      rows.push({
        slug: challenger.slug,
        label: challenger.slug.toUpperCase(),
        signal: `Sits in the next chase tier on current title pricing`,
        kind: 'volatile',
      });
      used.add(challenger.slug);
    }
  }

  return rows.slice(0, 3);
}

// ══════════════════════════════════════════════════════════════
// 4. ODDS MARKET READ
// ══════════════════════════════════════════════════════════════

/**
 * One short interpretive line above an odds list.
 * Deterministic from sorted odds — no movement claims, no hallucination.
 */
export function buildOddsMarketRead(odds, opts = {}) {
  const sport = opts.sport === 'nba' ? 'NBA' : 'MLB';
  const teamInfo = opts.teamInfo || {};
  const sorted = sortedOddsArray(odds);

  if (sorted.length === 0) return '';

  const teamLabel = (slug) => teamInfo[slug] || slug.toUpperCase();
  const fav = sorted[0];
  const favLabel = teamLabel(fav.slug);

  if (sorted.length === 1) {
    return `Market read: ${favLabel} is the lone listed favorite on current pricing.`;
  }

  if (sorted.length === 2) {
    return `Market read: ${favLabel} leads the board, with ${teamLabel(sorted[1].slug)} as the closest challenger.`;
  }

  // 3+ teams
  const tierLabels = sorted.slice(1, 3).map(t => teamLabel(t.slug)).join(' and ');
  if (sport === 'NBA') {
    return `Market read: ${favLabel} is the clear title-side anchor, with ${tierLabels} forming the next chase tier.`;
  }
  return `Market read: ${favLabel} remains the board favorite, while ${tierLabels} sit in the first challenger tier.`;
}
