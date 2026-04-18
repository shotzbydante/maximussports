/**
 * Scorecard builder — compile yesterday's published-and-settled picks into
 * a single row for picks_daily_scorecards.
 *
 * Pure function; callers pass in the picks + results from the DB.
 *
 *   buildScorecard({ sport, slateDate, picks, recentRecords })
 *     → row shape matching picks_daily_scorecards
 */

const ZERO = { won: 0, lost: 0, push: 0, pending: 0 };

function addResult(acc, status) {
  if (!status) return acc;
  if (status in acc) acc[status] += 1;
  return acc;
}

/**
 * @param {object} args
 * @param {string} args.sport
 * @param {string} args.slateDate — 'YYYY-MM-DD'
 * @param {Array}  args.picks — rows from `picks` with optional pick_results joined
 * @param {Array}  [args.recentRecords] — array of prior scorecards for streak computation
 * @returns row shape for picks_daily_scorecards
 */
export function buildScorecard({ sport, slateDate, picks = [], recentRecords = [] }) {
  const overall = { ...ZERO };
  const byMarket = {
    moneyline: { ...ZERO },
    runline: { ...ZERO },
    total: { ...ZERO },
  };
  const byTier = {
    tier1: { ...ZERO },
    tier2: { ...ZERO },
    tier3: { ...ZERO },
  };

  let topPlay = null;
  let topPlayResult = null;

  for (const p of picks) {
    const res = Array.isArray(p.pick_results) ? p.pick_results[0] : p.pick_results;
    const status = res?.status || 'pending';
    addResult(overall, status);
    if (byMarket[p.market_type]) addResult(byMarket[p.market_type], status);
    if (byTier[p.tier]) addResult(byTier[p.tier], status);

    if (p.tier === 'tier1') {
      if (!topPlay || (Number(p.bet_score) > Number(topPlay.bet_score))) {
        topPlay = p;
        topPlayResult = status;
      }
    }
  }

  // Streak: look at most-recent prior scorecard.overall to extend or break.
  let streak = null;
  const graded = overall.won + overall.lost;
  if (graded > 0) {
    const result = overall.won > overall.lost ? 'won' : (overall.lost > overall.won ? 'lost' : 'even');
    streak = { type: result, count: 1 };
    // chain with prior scorecards (newest first)
    for (const prev of (recentRecords || [])) {
      const pg = (prev?.record?.won ?? 0) + (prev?.record?.lost ?? 0);
      if (pg === 0) break;
      const pResult = prev.record.won > prev.record.lost ? 'won' : (prev.record.lost > prev.record.won ? 'lost' : 'even');
      if (pResult === result) streak.count += 1; else break;
    }
  }

  let note = null;
  if (picks.length === 0) note = 'No picks yesterday';
  else if (overall.pending > 0 && (overall.won + overall.lost + overall.push) === 0) note = 'Awaiting settlement';
  else if (topPlay && topPlayResult === 'won') note = 'Top Play hit';
  else if (topPlay && topPlayResult === 'lost') note = 'Top Play missed';
  else if (graded > 0 && overall.won > overall.lost) note = 'Winning day';
  else if (graded > 0 && overall.lost > overall.won) note = 'Tough day';

  return {
    sport,
    slate_date: slateDate,
    record: overall,
    by_market: byMarket,
    by_tier: byTier,
    top_play_result: topPlayResult,
    streak,
    note,
    computed_at: new Date().toISOString(),
  };
}
