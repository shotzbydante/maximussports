/**
 * Deterministic scoring + insight generation for NBA live games.
 * Adapted from MLB scoring for basketball context.
 */

const MARQUEE_TEAMS = new Set([
  'lal', 'bos', 'gsw', 'mil', 'phi', 'nyk', 'den', 'phx', 'mia', 'dal',
]);

const NATIONAL_NETWORKS = new Set([
  'ESPN', 'ESPN2', 'ABC', 'TNT', 'NBA TV', 'NBC', 'Peacock',
]);

function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

function parseQuarter(periodLabel) {
  if (!periodLabel) return 0;
  const m = periodLabel.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function computeImportanceScore(game) {
  let s = 20;
  if (game.gameState?.isLive) s += 30;
  else if (game.status === 'upcoming') {
    const minsUntil = (new Date(game.startTime) - Date.now()) / 60000;
    if (minsUntil <= 30) s += 20;
    else if (minsUntil <= 60) s += 12;
    else if (minsUntil <= 180) s += 5;
  }

  if (game.gameState?.isLive && game.teams) {
    const diff = Math.abs((game.teams.home.score ?? 0) - (game.teams.away.score ?? 0));
    if (diff <= 5) s += 15;
    else if (diff <= 10) s += 8;
    else if (diff <= 15) s += 3;
  }

  const qtr = parseQuarter(game.gameState?.periodLabel);
  if (game.gameState?.isLive && qtr >= 4) s += 12;

  if (game.broadcast?.network && NATIONAL_NETWORKS.has(game.broadcast.network)) s += 8;
  if (game.model?.pregameEdge != null && Math.abs(game.model.pregameEdge) >= 1.5) s += 6;
  if (game.market?.pregameSpread != null) s += 2;

  const slugs = [game.teams?.home?.slug, game.teams?.away?.slug].filter(Boolean);
  if (slugs.some((sl) => MARQUEE_TEAMS.has(sl))) s += 4;

  return clamp(s);
}

export function computeMarketDislocationScore(game) {
  let s = 0;
  const m = game.model;
  const mkt = game.market;
  if (!m || !mkt) return 0;

  if (m.fairSpread != null && mkt.pregameSpread != null) {
    const gap = Math.abs(m.fairSpread - mkt.pregameSpread);
    s += Math.min(gap * 10, 50);
  }
  if (m.fairTotal != null && mkt.pregameTotal != null) {
    const gap = Math.abs(m.fairTotal - mkt.pregameTotal);
    s += Math.min(gap * 8, 30);
  }
  if (m.confidence != null && m.confidence > 0.7) s += 15;
  else if (m.confidence != null && m.confidence > 0.5) s += 8;
  if (s === 0 && m.pregameEdge != null && Math.abs(m.pregameEdge) >= 1.0) {
    s = Math.min(Math.abs(m.pregameEdge) * 8, 35);
  }
  return clamp(s);
}

export function computeWatchabilityScore(game) {
  let s = 15;
  if (game.gameState?.isLive) s += 25;

  if (game.gameState?.isLive && game.teams) {
    const diff = Math.abs((game.teams.home.score ?? 0) - (game.teams.away.score ?? 0));
    if (diff <= 5) s += 20;
    else if (diff <= 10) s += 12;
    else if (diff <= 15) s += 5;
  }

  const qtr = parseQuarter(game.gameState?.periodLabel);
  if (game.gameState?.isLive && qtr >= 4) s += 12;
  if (game.broadcast?.network && NATIONAL_NETWORKS.has(game.broadcast.network)) s += 10;

  const slugs = [game.teams?.home?.slug, game.teams?.away?.slug].filter(Boolean);
  const marqueeCount = slugs.filter((sl) => MARQUEE_TEAMS.has(sl)).length;
  if (marqueeCount >= 2) s += 8;
  else if (marqueeCount === 1) s += 4;

  return clamp(s);
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
    if (sortMode === 'startTime') return new Date(a.startTime) - new Date(b.startTime);
    return b.signals.importanceScore - a.signals.importanceScore || b.signals.watchabilityScore - a.signals.watchabilityScore;
  });

  return scored.map((g) => ({ ...g, insight: buildGameInsight(g) }));
}

function buildGameInsight(game) {
  const parts = [];
  const gs = game.gameState || {};
  const qtr = parseQuarter(gs.periodLabel);

  if (gs.isLive) {
    const diff = Math.abs((game.teams?.home?.score ?? 0) - (game.teams?.away?.score ?? 0));
    if (diff <= 5 && qtr >= 4) parts.push('Close game in the fourth quarter.');
    else if (diff <= 5) parts.push('Tight game with the score within five.');
    else parts.push(`Live action, currently in ${gs.periodLabel || 'progress'}.`);
  } else if (game.status === 'upcoming') {
    const minsUntil = (new Date(game.startTime) - Date.now()) / 60000;
    if (minsUntil <= 30) parts.push('Tipoff coming up shortly.');
    else if (minsUntil <= 60) parts.push('Game starting within the hour.');
    else parts.push("On tonight's slate.");
  } else if (gs.isFinal) {
    const diff = Math.abs((game.teams?.home?.score ?? 0) - (game.teams?.away?.score ?? 0));
    if (diff <= 5) parts.push('Decided by five or fewer.');
    else parts.push('Final score is in.');
  }

  if (game.broadcast?.network && NATIONAL_NETWORKS.has(game.broadcast.network)) {
    parts.push(`Nationally televised on ${game.broadcast.network}.`);
  }

  if (game.model?.pregameEdge != null && Math.abs(game.model.pregameEdge) >= 1.5) {
    parts.push('Model has a notable lean on this matchup.');
  }

  if (game.market?.pregameSpread != null && Math.abs(game.market.pregameSpread) <= 3 && game.status !== 'final') {
    parts.push('Market prices this as a coin-flip game.');
  }

  const headline = parts[0] || 'Game intelligence loading.';
  const summary = parts.slice(0, 3).join(' ');
  return { headline, summary };
}
