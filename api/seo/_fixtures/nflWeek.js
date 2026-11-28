/** A cut of the real Week 12 public-week payload (Nov 28, 2026), for tests and screenshots. */
const L = (a) => `https://a.espncdn.com/i/teamlogos/nfl/500/${a.toLowerCase()}.png`;
const T = (slug, abbrev, name, nickname, score, record) => ({ slug, abbrev, name, nickname, logo: L(abbrev), score, record });
const R = (offenseTeam, defenseTeam, offense, defense, edge, size, favours) => ({ offenseTeam, defenseTeam, offense, defense, edge, size, favours });
const up = (label) => ({ label, live: false, final: false, overtime: false, possession: null });
const fin = { label: 'Final', live: false, final: true, overtime: false, possession: null };
export const week = {
  ok: true, week: 12, seasonType: 2, seasonYear: 2026, label: 'Week 12', phase: 'underway',
  games: [
    { gameId: '401873081', status: 'final', startTime: '2026-11-26T18:00Z', teams: { away: T('bears', 'CHI', 'Chicago Bears', 'Bears', 39, '9-2'), home: T('lions', 'DET', 'Detroit Lions', 'Lions', 35, '8-3') }, state: fin,
      lines: { spreadHome: 1, total: 56.5, moneyline: null, kind: 'closed' }, venue: { name: 'Ford Field', city: 'Detroit', state: 'MI' }, network: 'CBS',
      matchup: { rows: [R('DET', 'CHI', 'receivers', 'coverage', 7.4, 'big', 'DET'), R('DET', 'CHI', 'quarterback', 'pass defense', 5.9, 'edge', 'DET'), R('DET', 'CHI', 'pass protection', 'pass rush', 4.2, 'edge', 'DET')] },
      pick: { rank: 1, role: 'recommended', market: 'moneyline', side: 'home', line: null, price: 116, book: 'FanDuel', label: 'DET +116', team: { slug: 'lions', abbrev: 'DET', logo: L('det') }, conviction: 74, value: 0.03, lockedAt: '2026-11-26T11:29:20.686+00:00', why: 'FanDuel pays +116; the fair price is +110.', result: { state: 'final', verdict: 'lost', text: 'DET finished down 4.' } } },
    { gameId: '401873086', status: 'upcoming', startTime: '2026-11-30T01:20Z', teams: { away: T('raiders', 'LV', 'Las Vegas Raiders', 'Raiders', 0, '4-7'), home: T('browns', 'CLE', 'Cleveland Browns', 'Browns', 0, '6-4') }, state: up('11/29 - 8:20 PM EST'),
      lines: { spreadHome: -4.5, total: 39, moneyline: { home: -233, away: 192 }, kind: 'current' }, venue: { name: 'Huntington Bank Field', city: 'Cleveland', state: 'OH' }, network: 'NBC',
      matchup: { rows: [R('LV', 'CLE', 'quarterback', 'pass defense', -8.1, 'big', 'CLE'), R('CLE', 'LV', 'run game', 'run defense', 7.4, 'big', 'CLE'), R('LV', 'CLE', 'run game', 'run defense', -6.5, 'big', 'CLE')] },
      pick: { rank: 2, role: 'recommended', market: 'total', side: 'over', line: 38, price: -110, book: 'Circa Sports', label: 'Over 38', team: null, conviction: 72, value: 0.028, lockedAt: '2026-11-28T01:40:18.259+00:00', why: 'Circa Sports is at 38; the market is 39.5.', result: { state: 'upcoming', verdict: null, text: '' } } },
    { gameId: '401873082', status: 'final', startTime: '2026-11-27T01:20Z', teams: { away: T('chiefs', 'KC', 'Kansas City Chiefs', 'Chiefs', 10, '8-3'), home: T('bills', 'BUF', 'Buffalo Bills', 'Bills', 13, '10-1') }, state: fin,
      lines: { spreadHome: -3, total: 46, moneyline: null, kind: 'closed' }, venue: { name: 'Highmark Stadium', city: 'Orchard Park', state: 'NY' }, network: 'NBC',
      matchup: { rows: [R('BUF', 'KC', 'quarterback', 'pass defense', 14.9, 'big', 'BUF'), R('KC', 'BUF', 'quarterback', 'pass defense', 7.7, 'big', 'KC'), R('KC', 'BUF', 'receivers', 'coverage', 5.4, 'edge', 'KC')] },
      pick: { rank: 3, role: 'recommended', market: 'total', side: 'under', line: 47.5, price: -109, book: 'BetRivers', label: 'Under 47.5', team: null, conviction: 71, value: 0.027, lockedAt: '2026-11-25T05:20:19.571+00:00', why: '17 mph wind takes 0.8 points off the total; unders win 57% in wind like this.', result: { state: 'final', verdict: 'won', text: 'Finished with 23 points against a total of 47.5.' } } },
    { gameId: '401873087', status: 'upcoming', startTime: '2026-11-29T18:00Z', teams: { away: T('saints', 'NO', 'New Orleans Saints', 'Saints', 0, '3-7'), home: T('bengals', 'CIN', 'Cincinnati Bengals', 'Bengals', 0, '7-3') }, state: up('11/29 - 1:00 PM EST'),
      lines: { spreadHome: -10, total: 48.5, moneyline: { home: -565, away: 423 }, kind: 'current' }, venue: { name: 'Paycor Stadium', city: 'Cincinnati', state: 'OH' }, network: 'CBS',
      matchup: { rows: [R('CIN', 'NO', 'quarterback', 'pass defense', 19.6, 'big', 'CIN'), R('NO', 'CIN', 'pass protection', 'pass rush', -7.5, 'big', 'CIN'), R('CIN', 'NO', 'receivers', 'coverage', 6.2, 'big', 'CIN')] }, pick: null },
    { gameId: '401873093', status: 'upcoming', startTime: '2026-11-29T21:05Z', teams: { away: T('patriots', 'NE', 'New England Patriots', 'Patriots', 0, '5-5'), home: T('chargers', 'LAC', 'Los Angeles Chargers', 'Chargers', 0, '1-9') }, state: up('11/29 - 4:05 PM EST'),
      lines: { spreadHome: 3, total: 35, moneyline: { home: 130, away: -155 }, kind: 'current' }, venue: { name: 'SoFi Stadium', city: 'Inglewood', state: 'CA' }, network: 'CBS',
      matchup: { rows: [R('LAC', 'NE', 'receivers', 'coverage', -9, 'big', 'NE'), R('LAC', 'NE', 'run game', 'run defense', -3, 'edge', 'NE'), R('NE', 'LAC', 'pass protection', 'pass rush', 2.6, 'even', null)] }, pick: null },
    { gameId: '401873092', status: 'upcoming', startTime: '2026-11-29T21:25Z', teams: { away: T('commanders', 'WSH', 'Washington Commanders', 'Commanders', 0, '4-5-1'), home: T('cardinals', 'ARI', 'Arizona Cardinals', 'Cardinals', 0, '3-8') }, state: up('11/29 - 4:25 PM EST'),
      lines: { spreadHome: 6.5, total: 41.5, moneyline: { home: 270, away: -335 }, kind: 'current' }, venue: { name: 'State Farm Stadium', city: 'Glendale', state: 'AZ' }, network: 'Fox',
      matchup: { rows: [R('ARI', 'WSH', 'quarterback', 'pass defense', -9.3, 'big', 'WSH'), R('WSH', 'ARI', 'run game', 'run defense', 5.1, 'edge', 'WSH'), R('WSH', 'ARI', 'pass protection', 'pass rush', 3.4, 'edge', 'WSH')] }, pick: null },
    { gameId: '401873091', status: 'upcoming', startTime: '2026-11-29T21:25Z', teams: { away: T('seahawks', 'SEA', 'Seattle Seahawks', 'Seahawks', 0, '6-4'), home: T('49ers', 'SF', 'San Francisco 49ers', '49ers', 0, '9-1') }, state: up('11/29 - 4:25 PM EST'),
      lines: { spreadHome: 1.5, total: 42.5, moneyline: { home: -100, away: -118 }, kind: 'current' }, venue: { name: "Levi's Stadium", city: 'Santa Clara', state: 'CA' }, network: 'Fox',
      matchup: { rows: [R('SEA', 'SF', 'run game', 'run defense', -5.4, 'edge', 'SF'), R('SF', 'SEA', 'pass protection', 'pass rush', 4.8, 'edge', 'SF'), R('SF', 'SEA', 'receivers', 'coverage', 4.3, 'edge', 'SF')] }, pick: null },
    { gameId: '401873094', status: 'upcoming', startTime: '2026-12-01T01:15Z', teams: { away: T('panthers', 'CAR', 'Carolina Panthers', 'Panthers', 0, '5-5'), home: T('buccaneers', 'TB', 'Tampa Bay Buccaneers', 'Buccaneers', 0, '3-7') }, state: up('11/30 - 8:15 PM EST'),
      lines: { spreadHome: -3, total: 43.5, moneyline: { home: -160, away: 135 }, kind: 'current' }, venue: { name: 'Raymond James Stadium', city: 'Tampa', state: 'FL' }, network: 'ESPN',
      matchup: { rows: [R('TB', 'CAR', 'quarterback', 'pass defense', -11, 'big', 'CAR'), R('TB', 'CAR', 'receivers', 'coverage', -7.8, 'big', 'CAR'), R('CAR', 'TB', 'receivers', 'coverage', -4.3, 'edge', 'TB')] }, pick: null },
  ],
};
