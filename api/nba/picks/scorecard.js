/**
 * GET /api/nba/picks/scorecard?date=YYYY-MM-DD&includePicks=1
 *
 * Returns the scorecard for the requested NBA slate.
 *
 * Behavior:
 *   - With ?date=YYYY-MM-DD: returns that exact slate (or null if missing).
 *   - Without ?date: returns the most recent graded NBA slate (preferring
 *     yesterday ET when graded; falling back through the last 14 days when
 *     yesterday has no graded results).
 *   - With ?includePicks=1: returns every published pick for that slate
 *     joined with grading + final scores so the UI can render a full
 *     per-pick report. Also returns `totals` (overall + per-market record).
 */

import {
  getScorecard,
  getLatestGradedScorecard,
  getPicksForSlate,
} from '../../_lib/picksHistory.js';
import { yesterdayET } from '../../_lib/dateWindows.js';

/** Compute Won/Lost/Push/Pending + plain-English reason for one pick. */
function annotatePick(pick) {
  const result = pick?.pick_results?.[0] || null;
  const status = result?.status || 'pending';
  const awayScore = result?.final_away_score;
  const homeScore = result?.final_home_score;
  const hasFinal = awayScore != null && homeScore != null;

  const market = pick.market_type;       // 'moneyline' | 'runline' | 'total'
  const side = pick.selection_side;      // 'home'|'away'|'over'|'under'
  const line = pick.line_value;          // numeric, may be null
  const price = pick.price_american;     // moneyline price

  // Build human-readable pick label
  let pickLabel = '';
  if (market === 'moneyline') {
    const team = side === 'home' ? pick.home_team_slug : pick.away_team_slug;
    pickLabel = `${(team || '').toUpperCase()} ML${price != null ? ` ${price > 0 ? '+' : ''}${price}` : ''}`;
  } else if (market === 'runline' || market === 'spread') {
    const team = side === 'home' ? pick.home_team_slug : pick.away_team_slug;
    const teamLine = side === 'home' ? line : (line != null ? -line : null);
    const lineStr = teamLine != null ? `${teamLine > 0 ? '+' : ''}${teamLine}` : '';
    pickLabel = `${(team || '').toUpperCase()} ${lineStr}`.trim();
  } else if (market === 'total') {
    const ouLabel = side === 'over' ? 'OVER' : 'UNDER';
    pickLabel = `${ouLabel} ${line != null ? line : ''}`.trim();
  }

  // Final score display + result reason text
  let finalScore = null;
  let resultReason = null;
  if (hasFinal) {
    finalScore = `${(pick.away_team_slug || '').toUpperCase()} ${awayScore} – ${(pick.home_team_slug || '').toUpperCase()} ${homeScore}`;

    if (market === 'moneyline') {
      const winner = awayScore > homeScore ? 'away' : awayScore < homeScore ? 'home' : 'tie';
      const winnerName = winner === 'away' ? pick.away_team_slug
                       : winner === 'home' ? pick.home_team_slug : null;
      if (status === 'won') resultReason = `${(winnerName || '').toUpperCase()} won outright.`;
      else if (status === 'lost') resultReason = `${(winnerName || '').toUpperCase()} won the game.`;
      else if (status === 'push') resultReason = `Game ended tied.`;
    } else if (market === 'runline' || market === 'spread') {
      const margin = (side === 'home' ? homeScore - awayScore : awayScore - homeScore);
      const lineForSide = side === 'home' ? line : (line != null ? -line : null);
      if (lineForSide != null) {
        const cover = margin + lineForSide;
        if (status === 'won') resultReason = `Covered by ${Math.abs(cover).toFixed(1)} points.`;
        else if (status === 'lost') resultReason = `Lost cover by ${Math.abs(cover).toFixed(1)} points.`;
        else if (status === 'push') resultReason = `Margin landed exactly on the spread.`;
      }
    } else if (market === 'total') {
      const totalScore = awayScore + homeScore;
      if (line != null) {
        const diff = totalScore - line;
        if (status === 'won') resultReason = side === 'over'
          ? `Total finished ${totalScore} — over by ${diff.toFixed(1)}.`
          : `Total finished ${totalScore} — under by ${Math.abs(diff).toFixed(1)}.`;
        else if (status === 'lost') resultReason = side === 'over'
          ? `Total finished ${totalScore} — came up ${Math.abs(diff).toFixed(1)} short.`
          : `Total finished ${totalScore} — went ${diff.toFixed(1)} over.`;
        else if (status === 'push') resultReason = `Total landed exactly on the line.`;
      }
    }
  }

  return {
    id: pick.id,
    pickKey: pick.pick_key,
    gameId: pick.game_id,
    awayTeam: pick.away_team_slug,
    homeTeam: pick.home_team_slug,
    matchup: `${(pick.away_team_slug || '').toUpperCase()} @ ${(pick.home_team_slug || '').toUpperCase()}`,
    marketType: market,
    selectionSide: side,
    lineValue: line,
    priceAmerican: price,
    pickLabel,
    convictionTier: pick.tier,
    betScore: pick.bet_score,
    rawEdge: pick.raw_edge,
    modelProb: pick.model_prob,
    impliedProb: pick.implied_prob,
    topSignals: pick.top_signals,
    rationale: pick.rationale,
    startTime: pick.start_time,
    status,
    finalAwayScore: awayScore,
    finalHomeScore: homeScore,
    finalScore,
    resultReason,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const explicitDate = req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date : null;
  const includePicks = req.query?.includePicks === '1';
  const requestedSlate = explicitDate || yesterdayET();

  try {
    let card = await getScorecard({ sport: 'nba', slateDate: requestedSlate });
    let usedFallback = false;

    if (!explicitDate) {
      const graded = card?.record
        ? ((card.record.won ?? 0) + (card.record.lost ?? 0) + (card.record.push ?? 0))
        : 0;
      if (!card || graded === 0) {
        const fallback = await getLatestGradedScorecard({ sport: 'nba', lookbackDays: 14 });
        if (fallback) { card = fallback; usedFallback = true; }
      }
    }

    let picks = [];
    let totals = null;
    if (includePicks && card?.slate_date) {
      const { picks: rawPicks } = await getPicksForSlate({
        sport: 'nba',
        slateDate: card.slate_date,
      });
      picks = rawPicks.map(annotatePick);

      // Aggregate by category for stat chips
      const buckets = {
        overall:   { won: 0, lost: 0, push: 0, pending: 0 },
        moneyline: { won: 0, lost: 0, push: 0, pending: 0 },
        spread:    { won: 0, lost: 0, push: 0, pending: 0 },
        total:     { won: 0, lost: 0, push: 0, pending: 0 },
      };
      for (const p of picks) {
        const status = p.status || 'pending';
        if (buckets.overall[status] != null) buckets.overall[status] += 1;
        const cat = p.marketType === 'runline' ? 'spread' : p.marketType;
        if (cat && buckets[cat]?.[status] != null) buckets[cat][status] += 1;
      }
      totals = {
        published: picks.length,
        graded:    buckets.overall.won + buckets.overall.lost + buckets.overall.push,
        pending:   buckets.overall.pending,
        record:    buckets.overall,
        byMarket:  {
          moneyline: buckets.moneyline,
          spread:    buckets.spread,
          total:     buckets.total,
        },
      };
    }

    return res.status(200).json({
      slateDate: card?.slate_date || requestedSlate,
      requestedSlate,
      usedFallback,
      scorecard: card ? {
        date: card.slate_date,
        overall: card.record,
        byMarket: card.by_market,
        byTier: card.by_tier,
        topPlayResult: card.top_play_result,
        streak: card.streak,
        note: card.note,
        computedAt: card.computed_at,
        isFallback: usedFallback,
      } : null,
      picks,
      totals,
    });
  } catch (e) {
    return res.status(200).json({
      slateDate: requestedSlate,
      requestedSlate,
      usedFallback: false,
      scorecard: null,
      picks: [],
      totals: null,
      error: e?.message,
    });
  }
}
