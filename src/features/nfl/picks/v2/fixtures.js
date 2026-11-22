/**
 * Test fixtures for the NFL engine. Not imported by the app.
 */

export const KC = { slug: 'chiefs', name: 'Kansas City Chiefs', abbrev: 'KC' };
export const LV = { slug: 'raiders', name: 'Las Vegas Raiders', abbrev: 'LV' };
export const BUF = { slug: 'bills', name: 'Buffalo Bills', abbrev: 'BUF' };
export const SF = { slug: '49ers', name: 'San Francisco 49ers', abbrev: 'SF' };
export const CHI = { slug: 'bears', name: 'Chicago Bears', abbrev: 'CHI' };
export const DET = { slug: 'lions', name: 'Detroit Lions', abbrev: 'DET' };

const HOUR = 3_600_000;

/** One book's offers. `spread` is the home line. */
export function book(key, { spread = -3, spreadPrices = [-110, -110], total = 44.5, totalPrices = [-110, -110], ml = [-160, 140], lastUpdate = '2026-11-22T12:00:00Z' } = {}) {
  return {
    key, title: key, lastUpdate,
    spread: spread == null ? undefined : { homeLine: spread, homePrice: spreadPrices[0], awayPrice: spreadPrices[1], lastUpdate },
    total: total == null ? undefined : { line: total, overPrice: totalPrices[0], underPrice: totalPrices[1], lastUpdate },
    h2h: ml == null ? undefined : { home: ml[0], away: ml[1], lastUpdate },
  };
}

/** Six books in agreement, with any overrides by book key. */
export function books(overrides = {}, base = {}) {
  return ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'betrivers', 'fanatics']
    .map((key) => book(key, { ...base, ...(overrides[key] || {}) }));
}

export function game(id, away, home, { market = {}, hoursOut = 24, now = Date.parse('2026-11-22T12:00:00Z'), ...extra } = {}) {
  return {
    gameId: id, status: 'upcoming', week: 12, seasonType: 2,
    startTime: new Date(now + hoursOut * HOUR).toISOString(),
    teams: { away, home },
    gameState: {},
    venue: { name: 'Test Field', indoor: null, neutralSite: false },
    broadcast: { network: 'CBS' },
    market: { books: books(), ...market },
    injuries: { ok: true, away: { quarterbackStatuses: [] }, home: { quarterbackStatuses: [] } },
    ...extra,
  };
}

/** A league of finals where each team scores to its strength. */
export function league({ season = 2026, weeks = 8, strengths }) {
  const teams = Object.keys(strengths);
  const games = [];
  const teamWeeks = [];
  const qbWeeks = [];
  for (let w = 1; w <= weeks; w++) {
    for (let i = 0; i < teams.length; i += 2) {
      const home = teams[(i + w) % teams.length];
      const away = teams[(i + w + 1 + (w % 2)) % teams.length];
      if (home === away) continue;
      const id = `${season}_${w}_${away}_${home}`;
      const hs = 22 + strengths[home] - strengths[away] / 2 + 1;
      const as = 22 + strengths[away] - strengths[home] / 2 - 1;
      games.push({ id, espnId: `e${id}`, season, week: w, type: 'REG', home, away, homeScore: Math.round(hs), awayScore: Math.round(as), neutral: false, divisional: false });
      for (const [team, opp, pts] of [[home, away, hs], [away, home, as]]) {
        teamWeeks.push({ season, week: w, gameId: id, team, opp, dropbacks: 38, carries: 26, sacksSuffered: 2, passEpa: (pts - 22) * 0.7, rushEpa: (pts - 22) * 0.3, defSacks: 2, defQbHits: 5 });
        qbWeeks.push({ playerId: `qb-${team}`, name: `${team} Starter`, season, week: w, gameId: id, team, attempts: 34, dropbacks: 38, plays: 42, epa: (pts - 22) * 0.6 });
      }
    }
  }
  return { games, teamWeeks, qbWeeks };
}
