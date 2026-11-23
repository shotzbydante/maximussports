// Fixture for the Daily Brief of Mon 23 Nov 2026. NFL data is as production's
// /api/nfl/picks/scorecard and /api/nfl/chat/homeSummary served it that morning.
// NBA scores for IND at NYK are placeholders (not captured); the rest are real.
const G = (id, away, home, aa, ha, start, final, picks) => picks.map(([market, side, line, price, book, label, role, status, why, note]) => ({
  id: `${id}-${market}`, gameId: `4018730${id}`, slateDate: '2026-11-22', startTime: start,
  awayTeam: away, homeTeam: home, awayAbbrev: aa, homeAbbrev: ha, market, side, line, price, book, label,
  pickRole: role, status, why, review: note ? { note } : null, finalScore: final, expectedValue: role === 'hero' ? 0.048 : -0.03,
}));
const L = 'tracking', H = 'hero';
const sunday = [
  ...G('71', 'saints', 'bears', 'NO', 'CHI', '2026-11-22T18:00:00+00:00', 'NO 13, CHI 21', [
    ['total', 'under', 49, -110, 'Circa Sports', 'Under 49', H, 'won', 'Under 49: 15 mph wind and -110 at Circa Sports', 'Won by 15 points. Still a good bet at the close (+2.4%). The offenses gained 618 yards, which usually produces about 34 points; the game had 34.'],
    ['runline', 'away', 11.5, -109, 'BetRivers', 'NO +11.5', L, 'won', 'Model lean: New Orleans Saints +11.5', 'Won by 3.5 points.'],
    ['moneyline', 'away', null, 520, 'FanDuel', 'NO +520', L, 'lost', 'Model lean: New Orleans Saints to win', 'Lost by 8 points.']]),
  ...G('67', 'cardinals', 'chiefs', 'ARI', 'KC', '2026-11-22T18:00:00+00:00', 'ARI 7, KC 34', [
    ['total', 'under', 40.5, -105, 'DraftKings', 'Under 40.5', H, 'lost', 'Under 40.5: 15 mph wind and -105 at DraftKings', 'Lost by 0.5 points: the hook. The market did not move for the wind: the total closed at 40.5 (-1.8% at the close). The offenses gained 640 yards, which usually produces about 35 points; the game had 41.'],
    ['runline', 'away', 15.5, -108, 'Caesars', 'ARI +15.5', L, 'lost', 'Model lean', 'Lost by 11.5 points.'],
    ['moneyline', 'away', null, 980, 'FanDuel', 'ARI +980', L, 'lost', 'Model lean', 'Lost by 27 points.']]),
  ...G('70', 'dolphins', 'bills', 'MIA', 'BUF', '2026-11-22T18:00:00+00:00', 'MIA 9, BUF 26', [
    ['runline', 'away', 16.5, -105, 'Caesars', 'MIA +16.5', L, 'lost', 'Model lean', 'Lost by 0.5 points: the hook.'],
    ['total', 'over', 44.5, -110, 'BetMGM', 'Over 44.5', L, 'lost', 'Model lean', ''], ['moneyline', 'away', null, 950, 'BetRivers', 'MIA +950', L, 'lost', 'Model lean', '']]),
  ...G('76', 'steelers', 'eagles', 'PIT', 'PHI', '2026-11-22T18:00:00+00:00', 'PIT 16, PHI 19', [
    ['runline', 'home', 3.5, -107, 'Caesars', 'PHI +3.5', L, 'won', 'Model lean', ''], ['total', 'over', 37.5, -108, 'DraftKings', 'Over 37.5', L, 'lost', 'Model lean', ''], ['moneyline', 'home', null, 170, 'BetRivers', 'PHI +170', L, 'won', 'Model lean', '']]),
  ...G('68', 'ravens', 'panthers', 'BAL', 'CAR', '2026-11-22T18:00:00+00:00', 'BAL 33, CAR 35', [
    ['runline', 'away', 2.5, 100, 'Caesars', 'BAL +2.5', L, 'won', 'Model lean', ''], ['total', 'over', 43.5, -112, 'BetMGM', 'Over 43.5', L, 'won', 'Model lean', ''], ['moneyline', 'away', null, 127, 'Caesars', 'BAL +127', L, 'lost', 'Model lean', '']]),
  ...G('72', 'buccaneers', 'lions', 'TB', 'DET', '2026-11-22T18:00:00+00:00', 'TB 21, DET 31', [
    ['runline', 'home', -3.5, -110, 'BetMGM', 'DET -3.5', L, 'won', 'Model lean', ''], ['total', 'over', 47.5, -105, 'Caesars', 'Over 47.5', L, 'won', 'Model lean', ''], ['moneyline', 'home', null, -203, 'DraftKings', 'DET -203', L, 'won', 'Model lean', '']]),
  ...G('73', 'titans', 'cowboys', 'TEN', 'DAL', '2026-11-22T18:00:00+00:00', 'TEN 30, DAL 51', [
    ['runline', 'away', 7.5, -108, 'Caesars', 'TEN +7.5', L, 'lost', 'Model lean', ''], ['total', 'over', 55, -105, 'BetMGM', 'Over 55', L, 'won', 'Model lean', ''], ['moneyline', 'away', null, 300, 'Caesars', 'TEN +300', L, 'lost', 'Model lean', '']]),
  ...G('74', 'jets', 'chargers', 'NYJ', 'LAC', '2026-11-22T21:05:00+00:00', 'NYJ 27, LAC 24', [
    ['runline', 'home', -3, -112, 'Caesars', 'LAC -3', L, 'lost', 'Model lean', ''], ['total', 'over', 42, -107, 'Caesars', 'Over 42', L, 'won', 'Model lean', ''], ['moneyline', 'home', null, -168, 'DraftKings', 'LAC -168', L, 'lost', 'Model lean', '']]),
  ...G('69', 'jaguars', 'giants', 'JAX', 'NYG', '2026-11-22T21:25:00+00:00', 'JAX 18, NYG 23', [
    ['runline', 'away', -6, -105, 'Caesars', 'JAX -6', L, 'lost', 'Model lean', ''], ['total', 'under', 45.5, -106, 'DraftKings', 'Under 45.5', L, 'won', 'Model lean', ''], ['moneyline', 'away', null, -255, 'DraftKings', 'JAX -255', L, 'lost', 'Model lean', '']]),
  ...G('75', 'raiders', 'broncos', 'LV', 'DEN', '2026-11-22T21:25:00+00:00', 'LV 24, DEN 38', [
    ['runline', 'home', -10.5, -104, 'FanDuel', 'DEN -10.5', L, 'won', 'Model lean', ''], ['total', 'over', 40.5, -106, 'Caesars', 'Over 40.5', L, 'won', 'Model lean', ''], ['moneyline', 'home', null, -560, 'Caesars', 'DEN -560', L, 'won', 'Model lean', '']]),
  ...G('77', 'vikings', '49ers', 'MIN', 'SF', '2026-11-23T01:20:00+00:00', 'MIN 10, SF 35', [
    ['runline', 'away', 3.5, -115, 'Circa Sports', 'MIN +3.5', L, 'lost', 'Model lean: Minnesota Vikings +3.5', 'Lost by 21.5 points. SF won the turnovers 2-0, usually worth about 9 points.'],
    ['total', 'under', 46.5, -104, 'FanDuel', 'Under 46.5', L, 'won', 'Model lean: Under 46.5', 'Won by 1.5 points: inside a field goal. The offenses gained 667 yards, which usually produces about 38 points; the game had 45.'],
    ['moneyline', 'away', null, 150, 'Circa Sports', 'MIN +150', L, 'lost', 'Model lean: Minnesota Vikings to win', 'Lost by 25 points. SF won the turnovers 2-0, usually worth about 9 points.']]),
];
const monday = G('78', 'bengals', 'commanders', 'CIN', 'WSH', '2026-11-24T01:15:00+00:00', null, [
  ['total', 'over', 54, -107, 'BetRivers', 'Over 54', H, 'pending', 'Over 54 at -107 (BetRivers): the market’s fair price is -112', ''],
  ['runline', 'home', 6, -107, 'DraftKings', 'WSH +6', L, 'pending', 'Lean: ratings WSH +3.6, market WSH +6', ''],
  ['moneyline', 'away', null, -285, 'Circa Sports', 'CIN -285', L, 'pending', 'No value: best price CIN -285 at Circa Sports, fair -269 (-1.5%)', '']]).map((p) => ({ ...p, slateDate: '2026-11-23', expectedValue: p.pickRole === 'hero' ? 0.021 : -0.03 }));

const nbaPick = (id, aa, an, ha, hn, start, label, side, line, conv, af, hf, fair) => ({
  id, gameId: id, pickRole: 'hero', market: { type: 'total', line }, selection: { label, side }, conviction: { score: conv },
  matchup: { awayTeam: { slug: aa.toLowerCase(), abbrev: aa, name: an }, homeTeam: { slug: ha.toLowerCase(), abbrev: ha, name: hn }, startTime: start },
  awayTeamForm: { sample: 3, recentTotalAvg: af }, homeTeamForm: { sample: 3, recentTotalAvg: hf }, totalDebug: { fairTotal: fair, marketTotal: line },
});
const R = (id, aa, as, ha, hs) => ({ gameId: id, away: { abbrev: aa, score: as, slug: aa.toLowerCase() }, home: { abbrev: ha, score: hs, slug: ha.toLowerCase() } });

export const NOW = new Date('2026-11-23T13:00:00Z');
export const input = {
  now: NOW,
  nfl: {
    scorecard: {
      week: 11,
      slates: [{ date: '2026-11-23', picks: monday }, { date: '2026-11-22', picks: sunday }],
      season: { byPickRole: { hero: { won: 1, lost: 1, push: 0 }, tracking: { won: 15, lost: 16, push: 0 } }, performance: { hero: { units: -0.09, beatClosePct: 50, clvSample: 2 } } },
    },
    brief: {
      headline: 'One game left in Week 11, and we like the over',
      dek: 'CIN at WSH is the whole board tonight. Our only pick is the over, and our ratings think Washington is closer than the six-point spread says.',
      next: [{ gameId: '401873078', text: 'Our pick: Over 54 at -107 on BetRivers, fair price -112, a +2.1% edge. Only 11 mph of wind, worth just 0.1 points off the total. The market gives CIN 73%; our ratings say WSH +3.6, not +6.' }],
      numbers: [
        { value: '16.3', label: 'Talent edge for CIN’s quarterback against WSH’s pass defense, the biggest mismatch on the card' },
        { value: '-107', label: 'Our over 54 price at BetRivers, against a fair -112. That gap is the whole bet' },
        { value: '2.4', label: 'Points our ratings are higher on WSH than the market. Six is a lot to lay on a thin-looking edge' }],
      take: 'Take the over, not the side. The wind is a footnote, CIN’s pass protection (5th) faces a WSH rush that ranks 27th, and the model likes the number. At -107 you’re paying close to even for a small, real edge. Relaxed, not thrilled.',
      also: 'CIN holds the AFC 3 seed at 7-2, and the Super Bowl market has them at +850. A win here keeps them behind only BUF and DEN. WSH is 3-5-1 and long gone from the race. Buffalo (+500) trails only SF (+375) on the futures board.',
    },
  },
  nba: {
    results: [R('1', 'DET', 97, 'ATL', 107), R('2', 'OKC', 113, 'MIA', 123), R('3', 'ORL', 96, 'WAS', 116), R('4', 'DEN', 151, 'CHI', 145), R('5', 'DAL', 116, 'UTA', 114), R('6', 'IND', 118, 'NYK', 121)],
    ledger: {
      a: { id: 'a', gameId: '6', market: 'total', side: 'over', line: 213.5, label: 'Over 213.5' },
      b: { id: 'b', gameId: '3', market: 'total', side: 'over', line: 221.5, label: 'Over 221.5' },
      c: { id: 'c', gameId: '5', market: 'total', side: 'under', line: 224.5, label: 'Under 224.5' },
    },
    board: { fullSlatePicks: [
      nbaPick('11', 'LAC', 'Clippers', 'HOU', 'Rockets', '2026-11-24T01:30:00Z', 'Over 224', 'over', 224, 82, 228, 239, 233.8),
      nbaPick('12', 'MIL', 'Bucks', 'TOR', 'Raptors', '2026-11-24T00:30:00Z', 'Over 222.5', 'over', 222.5, 77, 255, 207, 231),
      nbaPick('13', 'OKC', 'Thunder', 'IND', 'Pacers', '2026-11-24T00:00:00Z', 'Over 221.5', 'over', 221.5, 55, 237, 230, 233.3),
      nbaPick('14', 'MEM', 'Grizzlies', 'CHA', 'Hornets', '2026-11-24T00:00:00Z', 'Over 215', 'over', 215, 55, 231, 220, 224),
      nbaPick('15', 'UTA', 'Jazz', 'LAL', 'Lakers', '2026-11-24T03:30:00Z', 'Under 224.5', 'under', 224.5, 52, 220, 218, 218.9),
    ] },
    brief: {
      headline: 'Nothing live yet, but five of our totals tip tonight',
      dek: 'Ten games start from 7:00 PM ET, and the model has a say in five of them. Four are Overs, with the Over on HOU against LAC carrying the highest conviction on the card.',
      take: 'The best thing on the board is Over 224 for LAC at HOU at 8:30 PM ET. Conviction 82, and the projection is 233.8, which is 9.8 points above the total. Both teams scored well in their last 3: Clippers 228, Rockets 239. The Under 224.5 for UTA at LAL is the one contrarian card.',
      also: 'The Spurs lead the title market at +260, ahead of the Thunder at +500, the 76ers at +800, and the Knicks and Celtics both at +900.',
    },
  },
};
