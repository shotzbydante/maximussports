/**
 * Deterministic scoring + insight generation for MLB live games.
 * No external dependencies — pure logic from canonical game objects.
 */

const MARQUEE_TEAMS = new Set([
  'nyy', 'lad', 'bos', 'hou', 'nym', 'atl', 'phi', 'chc', 'sf', 'stl',
]);

const NATIONAL_NETWORKS = new Set([
  'ESPN', 'ESPN2', 'FOX', 'FS1', 'TBS', 'TNT', 'ABC', 'MLB Network', 'Apple TV+', 'Peacock',
]);

function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

// ─── Importance (0–100) ─────────────────────────────────────────────────────

export function computeImportanceScore(game) {
  let s = 20; // baseline

  if (game.gameState?.isLive) s += 30;
  else if (game.status === 'upcoming') {
    const minsUntil = (new Date(game.startTime) - Date.now()) / 60000;
    if (minsUntil <= 30) s += 20;
    else if (minsUntil <= 60) s += 12;
    else if (minsUntil <= 180) s += 5;
  }

  // Close game
  if (game.gameState?.isLive && game.teams) {
    const diff = Math.abs((game.teams.home.score ?? 0) - (game.teams.away.score ?? 0));
    if (diff <= 1) s += 15;
    else if (diff <= 2) s += 8;
    else if (diff <= 3) s += 3;
  }

  // Late inning
  const inning = parseInning(game.gameState?.periodLabel);
  if (game.gameState?.isLive && inning >= 7) s += 10;
  if (game.gameState?.isLive && inning >= 9) s += 5;

  // National TV
  if (game.broadcast?.network && NATIONAL_NETWORKS.has(game.broadcast.network)) s += 8;

  // Model edge
  if (game.model?.pregameEdge != null && Math.abs(game.model.pregameEdge) >= 1.5) s += 6;

  // Marquee teams
  const slugs = [game.teams?.home?.slug, game.teams?.away?.slug].filter(Boolean);
  if (slugs.some((sl) => MARQUEE_TEAMS.has(sl))) s += 4;

  return clamp(s);
}

// ─── Market Dislocation (0–100) ──────────────────────────────────────────────

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

  return clamp(s);
}

// ─── Watchability (0–100) ────────────────────────────────────────────────────

export function computeWatchabilityScore(game) {
  let s = 15;

  if (game.gameState?.isLive) s += 25;

  // Close score
  if (game.gameState?.isLive && game.teams) {
    const diff = Math.abs((game.teams.home.score ?? 0) - (game.teams.away.score ?? 0));
    if (diff <= 1) s += 20;
    else if (diff <= 2) s += 12;
    else if (diff <= 3) s += 5;
  }

  // Late inning
  const inning = parseInning(game.gameState?.periodLabel);
  if (game.gameState?.isLive && inning >= 7) s += 12;

  // National TV
  if (game.broadcast?.network && NATIONAL_NETWORKS.has(game.broadcast.network)) s += 10;

  // Marquee matchup
  const slugs = [game.teams?.home?.slug, game.teams?.away?.slug].filter(Boolean);
  const marqueeCount = slugs.filter((sl) => MARQUEE_TEAMS.has(sl)).length;
  if (marqueeCount >= 2) s += 8;
  else if (marqueeCount === 1) s += 4;

  // Model edge
  if (game.model?.pregameEdge != null) s += 3;

  return clamp(s);
}

// ─── Volatility (0–100) ─────────────────────────────────────────────────────

export function computeVolatilityScore(game) {
  let s = 10;

  if (game.gameState?.isLive && game.teams) {
    const diff = Math.abs((game.teams.home.score ?? 0) - (game.teams.away.score ?? 0));
    if (diff <= 1) s += 25;
    else if (diff <= 2) s += 15;
  }

  const inning = parseInning(game.gameState?.periodLabel);
  if (game.gameState?.isLive && inning >= 7) s += 20;
  if (game.gameState?.isLive && inning >= 9) s += 10;

  return clamp(s);
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

export function rankLiveGames(games, sortMode = 'importance') {
  const scored = games.map((g) => ({
    ...g,
    signals: {
      importanceScore: computeImportanceScore(g),
      marketDislocationScore: computeMarketDislocationScore(g),
      watchabilityScore: computeWatchabilityScore(g),
      volatilityScore: computeVolatilityScore(g),
    },
  }));

  scored.sort((a, b) => {
    if (sortMode === 'edge') {
      return b.signals.marketDislocationScore - a.signals.marketDislocationScore
        || b.signals.importanceScore - a.signals.importanceScore;
    }
    if (sortMode === 'watchability') {
      return b.signals.watchabilityScore - a.signals.watchabilityScore
        || b.signals.importanceScore - a.signals.importanceScore;
    }
    if (sortMode === 'startTime') {
      return new Date(a.startTime) - new Date(b.startTime);
    }
    // default: importance
    return b.signals.importanceScore - a.signals.importanceScore
      || b.signals.watchabilityScore - a.signals.watchabilityScore;
  });

  return scored.map((g) => ({ ...g, insight: buildGameInsight(g) }));
}

// ─── Insight generation ─────────────────────────────────────────────────────

export function buildGameInsight(game) {
  const parts = [];
  const s = game.signals || {};
  const gs = game.gameState || {};
  const inning = parseInning(gs.periodLabel);

  if (gs.isLive) {
    const diff = Math.abs((game.teams?.home?.score ?? 0) - (game.teams?.away?.score ?? 0));
    if (diff <= 1 && inning >= 7) parts.push('One-run game in the late innings.');
    else if (diff <= 1) parts.push('Close game with the score within one run.');
    else if (diff <= 3 && inning >= 7) parts.push('Tight ballgame heading into the final frames.');
    else parts.push(`Live action, currently in the ${gs.periodLabel || 'middle innings'}.`);
  } else if (game.status === 'upcoming') {
    const minsUntil = (new Date(game.startTime) - Date.now()) / 60000;
    if (minsUntil <= 30) parts.push('First pitch coming up shortly.');
    else if (minsUntil <= 60) parts.push('Game starting within the hour.');
    else parts.push('On today\'s slate.');
  } else if (gs.isFinal) {
    const diff = Math.abs((game.teams?.home?.score ?? 0) - (game.teams?.away?.score ?? 0));
    if (diff <= 1) parts.push('Decided by a single run.');
    else parts.push('Final score is in.');
  }

  if (game.broadcast?.network && NATIONAL_NETWORKS.has(game.broadcast.network)) {
    parts.push(`Nationally televised on ${game.broadcast.network}.`);
  }

  if (s.marketDislocationScore > 40) {
    parts.push('Model sees value against the current line.');
  } else if (game.model?.pregameEdge != null) {
    parts.push('Model has a slight lean on this matchup.');
  }

  const headline = parts[0] || 'Game intelligence loading.';
  const summary = parts.slice(0, 3).join(' ');

  return { headline, summary };
}

export function buildInsightHeadline(game) {
  return buildGameInsight(game).headline;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseInning(periodLabel) {
  if (!periodLabel) return 0;
  const m = periodLabel.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
