/**
 * normalizeNflStudioPayload — the one shape every NFL Content Studio slide
 * and the caption builder read.
 *
 * Inputs are the raw responses of the endpoints the NFL workspace already
 * uses, so the studio can never say something the app does not:
 *   picks     /api/nfl/picks/built            (v2 board: heroPicks, byGame, meta)
 *   games     /api/nfl/live/games?status=all  (the week: finals, live, upcoming)
 *   season    /api/nfl/season-model           (playoff and title odds)
 *   scorecard /api/nfl/picks/scorecard        (graded picks and performance)
 *
 * Pure and synchronous: no fetching, no dates read from the clock unless
 * `now` is omitted. Every field degrades to null or [] when its source is
 * missing, and the slides render an honest empty state from that.
 */

const ET = 'America/New_York';

export const NFL_STUDIO_SECTIONS = ['nfl-slate', 'nfl-picks', 'nfl-game', 'nfl-receipts'];

const TIER_LABEL = { tier1: 'Top play', tier2: 'Strong play', tier3: 'Value play' };

export function fmtAmerican(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Math.round(Number(n));
  return v > 0 ? `+${v}` : `${v}`;
}

export function fmtLine(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Number(n);
  if (v === 0) return 'PK';
  return v > 0 ? `+${v}` : `${v}`;
}

function fmtPct(p, digits = 0) {
  if (p == null || !Number.isFinite(Number(p))) return null;
  return `${(Number(p) * 100).toFixed(digits)}%`;
}

function fmtSignedPct(p, digits = 1) {
  if (p == null || !Number.isFinite(Number(p))) return null;
  const v = Number(p) * 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function kickoffParts(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { label: null, day: null, time: null, dayKey: null };
  const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: ET });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET });
  const dayKey = d.toLocaleDateString('en-CA', { timeZone: ET });
  return { label: `${day} ${time} ET`, day, time: `${time} ET`, dayKey };
}

function team(t) {
  if (!t) return null;
  return {
    slug: t.slug ?? null,
    abbrev: t.abbrev ?? t.shortName ?? null,
    name: t.name ?? null,
    logo: t.logo ?? null,
    record: t.record ?? null,
    score: Number.isFinite(Number(t.score)) ? Number(t.score) : null,
  };
}

function normalizePick(p) {
  if (!p) return null;
  const m = p.matchup || {};
  const away = team(m.awayTeam);
  const home = team(m.homeTeam);
  const reasons = (p.pick?.topSignals || []).filter(Boolean).slice(0, 3);
  const kick = kickoffParts(m.startTime);
  return {
    id: p.id,
    gameId: String(p.gameId ?? ''),
    label: p.pick?.label || p.selection?.label || '',
    marketType: p.market?.type || p.pick?.marketType || null,
    category: p.category || null,
    priceAmerican: p.market?.priceAmerican ?? null,
    priceLabel: p.selection?.priceLabel || fmtAmerican(p.market?.priceAmerican),
    book: p.book?.title || null,
    tier: p.tier || null,
    tierLabel: TIER_LABEL[p.tier] || 'Play',
    convictionLabel: p.conviction?.label || null,
    convictionScore: p.conviction?.score ?? null,
    ev: p.ev ?? null,
    evLabel: fmtSignedPct(p.ev),
    hitPct: fmtPct(p.fair?.win ?? p.modelProb, 1),
    // A whole-number line can push, so "wins X% vs needs Y%" is only a fair
    // comparison when pushPct is null. Fair price vs offered price always is.
    pushPct: Number(p.fair?.push) > 0 ? fmtPct(p.fair.push, 1) : null,
    offeredPrice: fmtAmerican(p.market?.priceAmerican),
    fairPrice: fmtAmerican(p.fair?.priceAmerican),
    // True when the same ticket is no longer worth betting at today's number.
    movedAgainst: p.lock?.evNow != null && Number(p.lock.evNow) < 0,
    headline: p.pick?.explanation || null,
    reasons,
    away,
    home,
    matchupLabel: away?.abbrev && home?.abbrev ? `${away.abbrev} @ ${home.abbrev}` : '',
    kickoffLabel: kick.label,
    network: m.network || null,
    lockedAt: p.lock?.lockedAt || null,
    lockedPrice: fmtAmerican(p.lock?.price),
    lockedLine: p.lock?.line ?? null,
  };
}

function normalizeGame(g, boardGame, picksByGame) {
  const away = team(g.teams?.away) || team(boardGame?.awayTeam);
  const home = team(g.teams?.home) || team(boardGame?.homeTeam);
  const kick = kickoffParts(g.startTime || boardGame?.startTime);
  const market = boardGame?.market || {};
  const spreadHome = market.spreadHome ?? g.market?.pregameSpread ?? null;
  const total = market.total ?? g.market?.pregameTotal ?? null;
  const proj = boardGame?.projection || null;
  const homeWinProb = proj?.homeWinProb ?? market.fairHomeWin ?? g.model?.homeWinProb ?? null;

  let favorite = null;
  if (spreadHome != null && away && home) {
    const homeFav = Number(spreadHome) <= 0;
    favorite = {
      abbrev: homeFav ? home.abbrev : away.abbrev,
      line: fmtLine(-Math.abs(Number(spreadHome))),
      isPick: Number(spreadHome) === 0,
    };
  }

  const env = boardGame?.environment || null;
  const weather = env
    ? {
        indoor: !!env.indoor,
        temp: env.temp != null ? Math.round(env.temp) : null,
        wind: env.wind != null ? Math.round(env.wind) : null,
        precip: env.precip != null ? Math.round(env.precip) : null,
      }
    : null;

  const qb = (side) => {
    const q = boardGame?.quarterbacks?.[side];
    if (!q?.starter) return null;
    return { name: q.starter, changed: !!q.changed, uncertain: !!q.uncertain };
  };

  const isFinal = !!(g.gameState?.isFinal || g.status === 'final');
  const isLive = !!(g.gameState?.isLive || g.status === 'in_progress');

  return {
    id: String(g.gameId ?? boardGame?.gameId ?? ''),
    startTime: g.startTime || boardGame?.startTime || null,
    kickoffLabel: kick.label,
    kickoffDay: kick.day,
    kickoffTime: kick.time,
    dayKey: kick.dayKey,
    status: isFinal ? 'final' : isLive ? 'live' : 'upcoming',
    isFinal,
    isLive,
    network: g.broadcast?.network || boardGame?.network || null,
    venue: g.venue?.name || null,
    away,
    home,
    spreadHome,
    spreadLabel: favorite ? (favorite.isPick ? 'PK' : `${favorite.abbrev} ${favorite.line}`) : null,
    total,
    moneyline: market.moneyline || null,
    books: market.books ?? null,
    favorite,
    homeWinProb,
    winProbLabel: homeWinProb != null && home && away
      ? (homeWinProb >= 0.5
          ? `${home.abbrev} ${fmtPct(homeWinProb)}`
          : `${away.abbrev} ${fmtPct(1 - homeWinProb)}`)
      : null,
    projection: proj
      ? {
          homePoints: proj.homePoints ?? null,
          awayPoints: proj.awayPoints ?? null,
          total: proj.total ?? null,
          margin: proj.margin ?? null,
        }
      : null,
    quarterbacks: { away: qb('away'), home: qb('home') },
    weather,
    situations: (boardGame?.situations || []).filter((s) => s?.label).map((s) => ({ label: s.label, note: s.note || null, team: s.team || null })),
    resultHeadline: isFinal ? (g.narrative?.headline || null) : null,
    picks: picksByGame.get(String(g.gameId ?? boardGame?.gameId ?? '')) || [],
  };
}

function seasonTeams(season) {
  return Array.isArray(season?.teams) ? season.teams : [];
}

function titleRace(season, limit = 8) {
  return seasonTeams(season)
    .filter((t) => Number.isFinite(Number(t.titleOdds)) && Number.isFinite(Number(t.titleImpliedPct)))
    .sort((a, b) => b.titleImpliedPct - a.titleImpliedPct)
    .slice(0, limit)
    .map((t) => ({
      slug: t.slug,
      abbrev: t.abbrev,
      name: t.name,
      nickname: t.nickname,
      logo: t.logo,
      record: t.record,
      conference: t.conference,
      titleOddsLabel: fmtAmerican(t.titleOdds),
      titleImpliedPct: t.titleImpliedPct,
      titleImpliedLabel: fmtPct(t.titleImpliedPct, 1),
      playoffPct: t.playoffPct ?? null,
      playoffLabel: t.playoffPct != null ? (t.playoffPct >= 0.995 ? '>99%' : fmtPct(t.playoffPct)) : null,
      projectedWins: t.projectedWins ?? null,
      powerRank: t.powerRank ?? null,
    }));
}

function bubble(season, limit = 6) {
  return seasonTeams(season)
    .filter((t) => t.playoffPct != null && t.playoffPct >= 0.2 && t.playoffPct <= 0.8)
    .sort((a, b) => Math.abs(a.playoffPct - 0.5) - Math.abs(b.playoffPct - 0.5))
    .slice(0, limit)
    .map((t) => ({ slug: t.slug, abbrev: t.abbrev, logo: t.logo, record: t.record, conference: t.conference, playoffLabel: fmtPct(t.playoffPct), playoffPct: t.playoffPct }));
}

function receipts(scorecard) {
  const seasonHero = scorecard?.season?.performance?.hero || null;
  const windowHero = scorecard?.performance?.hero || null;
  const perf = seasonHero && (seasonHero.record.won + seasonHero.record.lost + seasonHero.record.push) > 0 ? seasonHero : windowHero;
  const scope = perf === seasonHero && seasonHero ? 'Season to date' : 'Last 9 days';

  const graded = [];
  for (const slate of scorecard?.slates || []) {
    for (const p of slate.picks || []) {
      if (p.pickRole !== 'hero') continue;
      if (!['won', 'lost', 'push'].includes(p.status)) continue;
      graded.push({
        id: p.id,
        label: p.label,
        matchupLabel: p.awayAbbrev && p.homeAbbrev ? `${p.awayAbbrev} @ ${p.homeAbbrev}` : '',
        status: p.status,
        priceLabel: fmtAmerican(p.price),
        finalScore: p.finalScore || null,
        units: p.units,
        clvPoints: p.clvPoints,
        date: p.slateDate,
      });
    }
  }

  const decided = perf ? perf.record.won + perf.record.lost + perf.record.push : 0;
  return {
    hasGraded: decided > 0,
    scope,
    record: perf?.record || { won: 0, lost: 0, push: 0 },
    recordLabel: perf ? `${perf.record.won}-${perf.record.lost}${perf.record.push ? `-${perf.record.push}` : ''}` : '0-0',
    winPctLabel: perf?.winPct != null ? `${perf.winPct}%` : null,
    units: perf?.units ?? null,
    unitsLabel: perf?.units != null ? `${perf.units >= 0 ? '+' : ''}${perf.units.toFixed(2)}u` : null,
    roiLabel: perf?.roiPct != null ? `${perf.roiPct >= 0 ? '+' : ''}${perf.roiPct}%` : null,
    beatCloseLabel: perf?.beatClosePct != null ? `${perf.beatClosePct}%` : null,
    clvSample: perf?.clvSample ?? 0,
    recent: graded.slice(0, 8),
    pendingCount: (scorecard?.slates || []).reduce(
      (n, s) => n + (s.picks || []).filter((p) => p.pickRole === 'hero' && p.status === 'pending').length, 0),
  };
}

function ptDateLabel(now) {
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
}

/**
 * @param {object} input
 * @param {string} input.section            one of NFL_STUDIO_SECTIONS
 * @param {object|null} input.picks
 * @param {object|null} input.games
 * @param {object|null} input.season
 * @param {object|null} input.scorecard
 * @param {string|null} [input.selectedGameId]
 * @param {Date} [input.now]
 */
export function normalizeNflStudioPayload({ section, picks, games, season, scorecard, selectedGameId = null, now = new Date() }) {
  const heroPicks = (picks?.heroPicks || []).map(normalizePick).filter(Boolean);

  const picksByGame = new Map();
  for (const p of heroPicks) {
    if (!picksByGame.has(p.gameId)) picksByGame.set(p.gameId, []);
    picksByGame.get(p.gameId).push(p);
  }

  const boardById = new Map((picks?.byGame || []).map((g) => [String(g.gameId), g]));
  const rawGames = Array.isArray(games?.games) ? games.games : [];
  const seen = new Set();
  const allGames = [];
  for (const g of rawGames) {
    const id = String(g.gameId);
    seen.add(id);
    allGames.push(normalizeGame(g, boardById.get(id), picksByGame));
  }
  // A game on the picks board but missing from the scoreboard feed still belongs on the slate.
  for (const [id, bg] of boardById) {
    if (!seen.has(id)) allGames.push(normalizeGame({ gameId: id, startTime: bg.startTime }, bg, picksByGame));
  }
  allGames.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));

  const upcoming = allGames.filter((g) => g.status === 'upcoming');
  const finals = allGames.filter((g) => g.isFinal);
  const week = picks?.week ?? games?.week ?? season?.week ?? null;
  const slateLabel = picks?.slateLabel || (week != null ? `Week ${week}` : 'This week');

  const meta = picks?.meta || {};
  const held = Object.values(meta.heldByReason || {}).reduce((n, v) => n + (Number(v) || 0), 0);

  const selectedGame = allGames.find((g) => g.id === String(selectedGameId))
    || upcoming.find((g) => g.picks.length > 0)
    || upcoming[0]
    || allGames[0]
    || null;

  return {
    sport: 'nfl',
    section,
    week,
    slateLabel,
    seasonLabel: games?.seasonLabel || null,
    dateLabel: ptDateLabel(now),
    generatedAt: picks?.generatedAt || games?.generatedAt || null,
    games: allGames,
    upcoming,
    finals,
    heroPicks,
    topPick: heroPicks[0] || null,
    meta: {
      gamesOnSlate: allGames.length,
      gamesUpcoming: upcoming.length,
      picksPublished: heroPicks.length,
      held,
      booksCount: Array.isArray(meta.booksSeen) ? meta.booksSeen.length : null,
      marketsChecked: heroPicks.length + held,
    },
    titleRace: titleRace(season),
    bubble: bubble(season),
    receipts: receipts(scorecard),
    selectedGame,
    byeTeams: games?.byeTeams || picks?.byeTeams || [],
  };
}

/** Whether a section has enough real data to export. Mirrors what the slides can show. */
export function nflSectionReady(payload) {
  if (!payload) return { ok: false, reason: 'No data loaded yet.' };
  switch (payload.section) {
    case 'nfl-slate':
      return payload.games.length > 0
        ? { ok: true, reason: null }
        : { ok: false, reason: 'No games on the slate right now.' };
    case 'nfl-picks':
      return payload.heroPicks.length > 0
        ? { ok: true, reason: null }
        : { ok: false, reason: 'No picks cleared the bar yet this week. Nothing to post.' };
    case 'nfl-game':
      return payload.selectedGame
        ? { ok: true, reason: null }
        : { ok: false, reason: 'Pick a game to break down.' };
    case 'nfl-receipts':
      return payload.receipts.hasGraded
        ? { ok: true, reason: null }
        : { ok: false, reason: 'No graded picks yet. Receipts unlock after the first settled slate.' };
    default:
      return { ok: false, reason: 'Unknown NFL section.' };
  }
}

/** Slides per section, given the data. The picks carousel is a cover plus one slide per pick. */
export function nflSlideCount(payload) {
  if (!payload) return 1;
  if (payload.section === 'nfl-slate') return 3;
  if (payload.section === 'nfl-picks') return 1 + Math.min(payload.heroPicks.length, 4);
  return 1;
}
