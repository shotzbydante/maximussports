/**
 * buildNflTeamIntelSummary — a short, factual read on one NFL team.
 *
 * Every sentence is derived from a number passed in (record, seed, point
 * differential, power rating, title price). Nothing is asserted that the
 * inputs do not support, and missing inputs simply drop their sentence.
 */

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtSigned(v) {
  return v > 0 ? `+${v}` : `${v}`;
}

/**
 * @param {object} opts
 * @param {object} opts.team   — NFL_TEAMS entry
 * @param {object} [opts.board] — row from /api/nfl/team/board
 * @param {object} [opts.odds]  — { bestChanceAmerican }
 * @param {object} [opts.model] — row from /api/nfl/season-model
 * @returns {string}
 */
export function buildNflTeamIntelSummary({ team, board = null, odds = null, model = null } = {}) {
  if (!team) return '';
  const nick = team.nickname || team.name.split(' ').pop();
  const parts = [];

  const games = (board?.wins ?? 0) + (board?.losses ?? 0) + (board?.ties ?? 0);
  if (games > 0) {
    let line = `The ${nick} are ${board.record}`;
    if (board.standing) line += `, ${board.standing}`;
    if (board.playoffSeed != null) {
      line += board.playoffSeed <= 7
        ? `, and hold the ${ordinal(board.playoffSeed)} seed in the ${team.conference}`
        : `, ${ordinal(board.playoffSeed)} in the ${team.conference} and outside the playoff field`;
    }
    parts.push(`${line}.`);
  } else {
    parts.push(`The ${nick} have not played a game that counts yet.`);
  }

  if (games > 0 && board?.pointDiff != null) {
    const perGame = Math.round((board.pointDiff / games) * 10) / 10;
    if (Math.abs(perGame) >= 0.5) {
      parts.push(`They have ${perGame > 0 ? 'outscored opponents' : 'been outscored'} by ${Math.abs(perGame)} points a game.`);
    }
  }

  if (board?.rating != null && board?.powerRank != null) {
    parts.push(
      `The model rates them ${ordinal(board.powerRank)} of 32 at ${fmtSigned(board.rating)} points against an average team ` +
      `(offense ${fmtSigned(board.offense)}, defense ${fmtSigned(board.defense)}).`
    );
  }

  if (model?.projectedWins != null && model?.playoffPct != null) {
    const p = model.playoffPct;
    const chance = p >= 0.995 ? 'a better than 99%' : p < 0.005 ? 'a less than 1%' : `a ${Math.round(p * 100)}%`;
    parts.push(`Projected for ${model.projectedWins.toFixed(1)} wins with ${chance} chance to make the playoffs.`);
  }

  if (model?.luck != null && Math.abs(model.luck) >= 1) {
    parts.push(
      model.luck > 0
        ? `Their record is about ${Math.abs(model.luck).toFixed(1)} wins better than their scoring margin supports.`
        : `Their record is about ${Math.abs(model.luck).toFixed(1)} wins worse than their scoring margin supports.`
    );
  }

  const price = odds?.bestChanceAmerican;
  if (typeof price === 'number') {
    parts.push(`Super Bowl price: ${price > 0 ? '+' : ''}${price}.`);
  }

  return parts.join(' ');
}
