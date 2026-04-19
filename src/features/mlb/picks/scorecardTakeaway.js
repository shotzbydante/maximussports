/**
 * scorecardTakeaway — editorial one-line takeaway derived from the canonical
 * scorecardSummary payload. Pure function. No fetches.
 *
 * Prioritizes signal in this order:
 *   1. Top Play result (hit / missed)
 *   2. Market trend (total-heavy win, ML sweep, etc.)
 *   3. Streak continuation
 *   4. Push-heavy or all-pending edge cases
 *   5. Generic graceful fallback
 *
 * Returns { text, tone: 'positive' | 'negative' | 'neutral' }
 */

function rate(rec) {
  const n = (rec?.won ?? 0) + (rec?.lost ?? 0);
  return n > 0 ? (rec.won ?? 0) / n : null;
}

export function scorecardTakeaway(summary) {
  if (!summary) return { text: null, tone: 'neutral' };

  const overall = summary.overall || { won: 0, lost: 0, push: 0, pending: 0 };
  const bm = summary.byMarket || {};
  const ml = bm.moneyline || {};
  const rl = bm.runline || {};
  const tot = bm.total || {};
  const top = summary.topPlayResult;
  const streak = summary.streak || null;

  const graded = (overall.won ?? 0) + (overall.lost ?? 0);
  if (graded === 0) {
    if ((overall.pending ?? 0) > 0) {
      return { text: 'Awaiting final settlement on yesterday\'s slate.', tone: 'neutral' };
    }
    return { text: 'No picks graded yesterday.', tone: 'neutral' };
  }

  // 1. Top Play narrative
  if (top === 'won') {
    return {
      text: overall.won >= overall.lost
        ? `Top Play cashed and the board came home ${overall.won}-${overall.lost}.`
        : `Top Play cashed — board split ${overall.won}-${overall.lost}.`,
      tone: 'positive',
    };
  }
  if (top === 'lost') {
    return {
      text: overall.won > overall.lost
        ? `Top Play missed, but the board still finished ${overall.won}-${overall.lost}.`
        : `Top Play missed and the slate ran cold at ${overall.won}-${overall.lost}.`,
      tone: overall.won > overall.lost ? 'neutral' : 'negative',
    };
  }

  // 2. Market-level trends (strong signal when a market dominated)
  const totRate = rate(tot); const totN = (tot.won ?? 0) + (tot.lost ?? 0);
  const mlRate = rate(ml);   const mlN  = (ml.won ?? 0)  + (ml.lost ?? 0);
  const rlRate = rate(rl);   const rlN  = (rl.won ?? 0)  + (rl.lost ?? 0);

  if (totN >= 2 && totRate === 1) {
    return { text: `Game Totals swept — ${tot.won}/${totN} went the model's way.`, tone: 'positive' };
  }
  if (mlN >= 2 && mlRate === 1) {
    return { text: `Pick 'Ems perfect — ${ml.won}/${mlN} moneylines cashed.`, tone: 'positive' };
  }
  if (rlN >= 2 && rlRate === 1) {
    return { text: `Spreads carried the day — ${rl.won}/${rlN} covered.`, tone: 'positive' };
  }

  // 3. Streak framing
  if (streak && streak.count >= 3 && streak.type === 'won') {
    return { text: `${streak.count}-day winning run — model is finding the edge.`, tone: 'positive' };
  }
  if (streak && streak.count >= 3 && streak.type === 'lost') {
    return { text: `${streak.count}-day cold streak — selective mode.`, tone: 'negative' };
  }

  // 4. Overall record framing
  if (overall.won > overall.lost) {
    return { text: `Winning day — finished ${overall.won}-${overall.lost}.`, tone: 'positive' };
  }
  if (overall.lost > overall.won) {
    return { text: `Tough day — finished ${overall.won}-${overall.lost}.`, tone: 'negative' };
  }
  return { text: `Split decision — ${overall.won}-${overall.lost}.`, tone: 'neutral' };
}

/**
 * Format a trailing-window record (trailing3d/7d/30d) if the backend provides
 * it in the scorecardSummary. Returns null when not available so UI can omit.
 *
 *   input: summary.trailing3d = { won, lost, push, pending }
 */
export function trailingRecord(summary, key = 'trailing3d') {
  const rec = summary?.[key];
  if (!rec) return null;
  const graded = (rec.won ?? 0) + (rec.lost ?? 0);
  if (graded === 0) return null;
  const pct = Math.round(((rec.won ?? 0) / graded) * 100);
  const label = key === 'trailing3d' ? 'Last 3 days'
              : key === 'trailing7d' ? 'Last 7 days'
              : key === 'trailing30d' ? 'Last 30 days'
              : 'Trailing';
  return {
    label,
    record: `${rec.won ?? 0}-${rec.lost ?? 0}${rec.push ? `-${rec.push}` : ''}`,
    winRate: pct,
  };
}
