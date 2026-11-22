/**
 * Deterministic scoring + insight generation for NFL games.
 * Same three signals the MLB and NBA slates use (importance, market
 * dislocation, watchability), tuned for football game states.
 */

const NATIONAL_NETWORKS = new Set([
  'ESPN', 'ABC', 'NBC', 'CBS', 'FOX', 'Fox', 'Prime Video', 'NFL Network', 'NFL Net', 'Netflix', 'Peacock',
]);

/** Standalone national windows: everyone watching is watching this game. */
function isStandaloneWindow(game) {
  const t = Date.parse(game.startTime || '');
  if (!Number.isFinite(t)) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false,
    }).formatToParts(new Date(t));
    const day = parts.find((p) => p.type === 'weekday')?.value;
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    if (day === 'Thu' || day === 'Mon' || day === 'Sat' || day === 'Fri') return true;
    return day === 'Sun' && hour >= 19;
  } catch { return false; }
}

function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

function scoreDiff(game) {
  return Math.abs((game.teams?.home?.score ?? 0) - (game.teams?.away?.score ?? 0));
}

function winPct(record) {
  const m = typeof record === 'string' && record.match(/^(\d+)-(\d+)(?:-(\d+))?/);
  if (!m) return null;
  const w = +m[1], l = +m[2], t = +(m[3] || 0);
  return w + l + t > 0 ? (w + t / 2) / (w + l + t) : null;
}

export function computeImportanceScore(game) {
  let s = 20;
  const gs = game.gameState || {};
  if (gs.isLive) s += 30;
  else if (game.status === 'upcoming') {
    const mins = (Date.parse(game.startTime) - Date.now()) / 60000;
    if (mins <= 60) s += 18;
    else if (mins <= 24 * 60) s += 10;
    else if (mins <= 48 * 60) s += 4;
  }

  if (gs.isLive) {
    const diff = scoreDiff(game);
    if (diff <= 3) s += 15;
    else if (diff <= 8) s += 10;
    else if (diff <= 16) s += 3;
    if ((gs.period ?? 0) >= 4) s += 12;
    if (gs.isRedZone) s += 4;
  }

  // Two winning teams matter more to the playoff picture.
  const hp = winPct(game.teams?.home?.record);
  const ap = winPct(game.teams?.away?.record);
  if (hp != null && ap != null) {
    if (hp >= 0.6 && ap >= 0.6) s += 12;
    else if (hp >= 0.5 && ap >= 0.5) s += 6;
  }

  if (isStandaloneWindow(game)) s += 8;
  if (game.model?.pregameEdge != null && Math.abs(game.model.pregameEdge) >= 2) s += 5;
  if (game.market?.pregameSpread != null) s += 2;
  return clamp(s);
}

export function computeMarketDislocationScore(game) {
  const m = game.model;
  const mkt = game.market;
  if (!m || !mkt) return 0;
  let s = 0;
  if (m.fairSpread != null && mkt.pregameSpread != null) {
    s += Math.min(Math.abs(m.fairSpread - mkt.pregameSpread) * 9, 55);
  }
  if (m.fairTotal != null && mkt.pregameTotal != null) {
    s += Math.min(Math.abs(m.fairTotal - mkt.pregameTotal) * 5, 30);
  }
  if (mkt.openSpread != null && mkt.pregameSpread != null) {
    s += Math.min(Math.abs(mkt.pregameSpread - mkt.openSpread) * 6, 15);
  }
  return clamp(s);
}

export function computeWatchabilityScore(game) {
  let s = 15;
  const gs = game.gameState || {};
  if (gs.isLive) {
    s += 25;
    const diff = scoreDiff(game);
    if (diff <= 3) s += 20;
    else if (diff <= 8) s += 14;
    else if (diff <= 16) s += 5;
    if ((gs.period ?? 0) >= 4) s += 12;
    if (gs.isOvertime) s += 8;
  }
  if (isStandaloneWindow(game)) s += 12;
  if (game.market?.pregameSpread != null && Math.abs(game.market.pregameSpread) <= 3) s += 8;
  if (game.market?.pregameTotal != null && game.market.pregameTotal >= 48) s += 5;
  const hp = winPct(game.teams?.home?.record);
  const ap = winPct(game.teams?.away?.record);
  if (hp != null && ap != null && hp >= 0.55 && ap >= 0.55) s += 8;
  return clamp(s);
}

function buildGameInsight(game) {
  const parts = [];
  const gs = game.gameState || {};
  const home = game.teams?.home;
  const away = game.teams?.away;

  if (gs.isLive) {
    const diff = scoreDiff(game);
    if (gs.isOvertime) parts.push('Overtime.');
    else if (diff <= 8 && (gs.period ?? 0) >= 4) parts.push('One-score game in the fourth quarter.');
    else if (diff <= 8) parts.push('One-score game.');
    else parts.push(`Live, ${gs.periodLabel || 'in progress'}.`);
    if (gs.isRedZone && gs.possession) {
      const team = gs.possession === 'home' ? home : away;
      parts.push(`${team?.abbrev || 'Offense'} in the red zone.`);
    }
  } else if (game.status === 'upcoming') {
    const mins = (Date.parse(game.startTime) - Date.now()) / 60000;
    if (mins <= 60) parts.push('Kickoff within the hour.');
    else if (isStandaloneWindow(game)) parts.push('Standalone national window.');
    else parts.push("On this week's slate.");
  } else if (gs.isFinal) {
    const diff = scoreDiff(game);
    if (gs.isOvertime) parts.push('Decided in overtime.');
    else if (diff <= 3) parts.push('Decided by a field goal or less.');
    else if (diff <= 8) parts.push('One-score final.');
    else parts.push('Final.');
  }

  const m = game.model;
  const mkt = game.market;
  if (game.status !== 'final' && m?.fairSpread != null && mkt?.pregameSpread != null) {
    const gap = m.fairSpread - mkt.pregameSpread;
    if (Math.abs(gap) >= 2 && home && away) {
      const side = gap < 0 ? home : away;
      parts.push(`Ratings lean ${side.abbrev} by ${Math.abs(gap).toFixed(1)} against the number.`);
    }
  }
  if (game.status !== 'final' && mkt?.openSpread != null && mkt?.pregameSpread != null) {
    const move = mkt.pregameSpread - mkt.openSpread;
    if (Math.abs(move) >= 1.5 && home && away) {
      const toward = move < 0 ? home : away;
      parts.push(`Line has moved ${Math.abs(move).toFixed(1)} toward ${toward.abbrev} since open.`);
    }
  }
  if (game.status === 'upcoming' && mkt?.pregameSpread != null && Math.abs(mkt.pregameSpread) <= 2.5) {
    parts.push('Market prices this close to a coin flip.');
  }

  return { headline: parts[0] || 'Game intelligence loading.', summary: parts.slice(0, 3).join(' ') };
}

export function rankLiveGames(games, sortMode = 'importance') {
  const scored = games.map((g) => ({
    ...g,
    signals: {
      importanceScore: computeImportanceScore(g),
      marketDislocationScore: computeMarketDislocationScore(g),
      watchabilityScore: computeWatchabilityScore(g),
    },
  }));

  scored.sort((a, b) => {
    if (sortMode === 'edge') return b.signals.marketDislocationScore - a.signals.marketDislocationScore || b.signals.importanceScore - a.signals.importanceScore;
    if (sortMode === 'watchability') return b.signals.watchabilityScore - a.signals.watchabilityScore || b.signals.importanceScore - a.signals.importanceScore;
    if (sortMode === 'startTime') return Date.parse(a.startTime) - Date.parse(b.startTime);
    return b.signals.importanceScore - a.signals.importanceScore || b.signals.watchabilityScore - a.signals.watchabilityScore;
  });

  return scored.map((g) => ({ ...g, insight: buildGameInsight(g) }));
}
