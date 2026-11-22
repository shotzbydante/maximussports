import { describe, it, expect } from 'vitest';
import { buildBriefData, buildEngineBrief, briefPrompt, parseBrief, briefToText, briefSignature, windowFor, dropStale, withoutClock, BRIEF_LIMITS } from './nflBrief.js';

const team = (slug, abbrev, name, score, record) => ({ slug, abbrev, name, score, record });
const NOW = new Date('2026-11-22T20:26:00Z');           // Sunday 3:26 PM ET
const liveGame = {
  gameId: 'g1', status: 'live', startTime: '2026-11-22T18:00:00Z',
  teams: { away: team('saints', 'NO', 'New Orleans Saints', 10, '3-6'), home: team('bears', 'CHI', 'Chicago Bears', 19, '7-2') },
  gameState: { periodLabel: 'Q4 13:41', period: 4, possession: 'away', downDistance: '1st & 10 at NO 8' },
  market: { pregameSpread: -13.5, pregameTotal: 41.5 },     // in-game numbers: must not be used as the close
};
const upsetGame = {
  gameId: 'g2', status: 'live', startTime: '2026-11-22T18:00:00Z',
  teams: { away: team('steelers', 'PIT', 'Pittsburgh Steelers', 9, '6-3'), home: team('eagles', 'PHI', 'Philadelphia Eagles', 16, '2-7') },
  gameState: { periodLabel: 'Q4 13:12', period: 4 }, market: {},
};
const nextGame = {
  gameId: 'g3', status: 'upcoming', startTime: '2026-11-23T01:20:00Z', broadcast: { network: 'NBC' },
  teams: { away: team('vikings', 'MIN', 'Minnesota Vikings', null, '5-4'), home: team('49ers', 'SF', 'San Francisco 49ers', null, '8-1') },
  market: { pregameSpread: -4, pregameTotal: 45.5, openSpread: -2.5 },
  injuries: { away: { quarterbacks: [{ name: 'Kyler Murray', status: 'Out' }] }, home: { quarterbacks: [] } },
  engine: {
    fair: { homeWin: 0.64 }, projection: { fairSpreadHome: -0.3 }, modelGap: { side: -3.7 }, neutral: true,
    env: { indoor: false, wind: 7.4, venue: 'Estadio Banorte', city: 'Mexico City', label: 'Outdoors at Estadio Banorte, Mexico City: 7 mph wind, 61°F' },
    rest: { home: 7, away: 7 }, situations: [],
    talent: { leansTo: 'SF', matchups: [{ offenseTeam: 'SF', defenseTeam: 'MIN', offense: 'quarterback', defense: 'pass defense', edge: 11.6, favours: 'SF' }, { offenseTeam: 'MIN', defenseTeam: 'SF', offense: 'run game', defense: 'run defense', edge: -3.1, favours: 'SF' }] },
    units: { home: { passRush: { rank: 2 }, passDefense: { rank: 9 }, rushDefense: { rank: 12 }, passOffense: { rank: 4 }, rushOffense: { rank: 10 }, passProtection: { rank: 14 } }, away: { passProtection: { rank: 30 }, passOffense: { rank: 18 }, rushOffense: { rank: 20 }, passDefense: { rank: 15 }, rushDefense: { rank: 16 }, passRush: { rank: 11 } } },
  },
};
const mondayGame = {
  gameId: 'g4', status: 'upcoming', startTime: '2026-11-24T01:15:00Z',
  teams: { away: team('bengals', 'CIN', 'Cincinnati Bengals', null, '7-2'), home: team('commanders', 'WSH', 'Washington Commanders', null, '3-5-1') },
  market: { pregameSpread: 6, pregameTotal: 55 }, engine: { fair: { homeWin: 0.27 } },
};
const finalGame = {
  gameId: 'g5', status: 'final', startTime: '2026-11-20T01:15:00Z',
  teams: { away: team('colts', 'IND', 'Indianapolis Colts', 3, '4-6'), home: team('texans', 'HOU', 'Houston Texans', 26, '6-4') }, market: {},
};
const slate = { week: 11, games: [finalGame, liveGame, upsetGame, nextGame, mondayGame], byeTeams: ['rams'] };
const closes = new Map([
  ['g1', { spread_home: -11.5, total: 48.5 }], ['g2', { spread_home: 3.5, total: 37.5 }], ['g5', { spread_home: -3.5, total: 44.5 }],
]);
const weekPicks = [{ gameId: 'g1', label: 'Under 49', price: -110, book: 'Circa Sports', gameStatus: 'live', status: { state: 'live', verdict: 'ahead', text: '29 points at Q4 13:41. Stays under 49 with 19 or fewer more.' } }];
const board = { tiers: { tier3: [{ gameId: 'g4', pickRole: 'hero', conviction: { score: 67 }, matchup: { startTime: '2026-11-24T01:15:00Z' }, market: { type: 'total', priceAmerican: -107 }, selection: { label: 'Over 54' }, book: { title: 'BetRivers' }, displayMetrics: { edgeValue: '+2.1%' }, why: 'BetRivers was paying -107 on Over 54; the fair price was -112.' }] } };
const data = buildBriefData({ slate, board, weekPicks, closes, now: NOW, champOdds: { '49ers': { bestChanceAmerican: 480 } } });

describe('buildBriefData', () => {
  it('sorts the slate into live, to come and final, with the time it is written for', () => {
    expect(data.now).toBe('Sunday, November 22 at 3:26 PM ET');
    expect(data.counts).toEqual({ live: 2, toPlay: 2, final: 1 });
    expect(data.gamesToCome.map((g) => g.away)).toEqual(['MIN', 'CIN']);
    expect(data.nextKickoff).toBe('MIN at SF, Sunday 8:20 PM ET');
  });

  it('measures live games against the line they closed at, not the in-game line', () => {
    const g = data.liveGames.find((x) => x.gameId === 'g1');
    expect(g).toMatchObject({
      closingSpread: 'CHI -11.5', closingTotal: 48.5,
      againstTheSpread: 'CHI leads by 9 but is 2.5 short of covering 11.5',
      againstTheTotal: '29 points scored against a total of 48.5',
      maximusPick: { pick: 'Under 49', price: '-110', book: 'Circa Sports', verdict: 'ahead' },
    });
    expect(data.liveGames.find((x) => x.gameId === 'g2')).toMatchObject({ favoriteTrailing: true, againstTheSpread: 'PIT, a 3.5-point favorite, trails by 7' });
  });

  it('gives each game to come the facts that change how it looks', () => {
    const g = data.gamesToCome[0];
    expect(g).toMatchObject({
      window: 'Sunday night', spread: 'SF -4', total: 45.5, marketWinChance: 'SF 64%', ratingsLine: 'SF -0.3',
      ratingsVsMarket: 'our ratings are 3.7 points lower on SF than the market',
      quarterbackNews: ['MIN quarterback Kyler Murray is out'],
      talentEdge: 'SF’s quarterback against MIN’s pass defense: a 11.6-point talent edge',
      unitMismatch: 'SF’s pass rush (2nd) meets MIN’s pass protection (30th)',
      lineMove: 'the spread has moved 1.5 toward SF since it opened',
      neutralSite: 'Estadio Banorte, Mexico City',
    });
    expect(g.rest).toBeUndefined();              // equal rest is not a fact worth carrying
    expect(data.gamesToCome[1].maximusPick).toMatchObject({ pick: 'Over 54', price: '-107', book: 'BetRivers', expectedValue: '+2.1%' });
  });

  it('grades finished games against the close and counts our picks', () => {
    expect(data.finals[0]).toMatchObject({ final: 'IND 3, HOU 26', againstTheSpread: 'HOU covered -3.5', total: 'under 44.5', day: 'Thursday' });
    expect(data.maximusPicksThisWeek).toEqual({ toCome: 1, inPlay: 1, won: 0, lost: 0, push: 0 });
  });
});

describe('a finished game with no closing line on file', () => {
  it('says nothing about the spread or the total rather than treating the gap as zero', () => {
    const d = buildBriefData({
      slate: { week: 11, games: [{ gameId: 'f1', status: 'final', startTime: '2026-11-20T01:15:00Z', teams: { away: { slug: 'colts', abbrev: 'IND', score: 3 }, home: { slug: 'texans', abbrev: 'HOU', score: 26 } }, market: {} }] },
      closes: new Map([['f1', { spread_home: null, total: null }]]),
      now: new Date('2026-11-22T20:26:00Z'),
    });
    expect(d.finals[0].againstTheSpread).toBeNull();
    expect(d.finals[0].total).toBeNull();
  });
});

describe('quarterback news', () => {
  const g = (engineQb) => ({
    gameId: 'q1', status: 'upcoming', startTime: '2026-11-22T21:25:00Z',
    teams: { away: team('raiders', 'LV', 'Las Vegas Raiders', null, '4-6'), home: team('broncos', 'DEN', 'Denver Broncos', null, '7-2') },
    market: { pregameSpread: -11.5, pregameTotal: 41.5 },
    injuries: { away: { quarterbacks: [] }, home: { quarterbacks: [{ name: 'Sam Ehlinger', status: 'Out' }] } },
    engine: { quarterbacks: engineQb },
  });
  const news = (engineQb) => buildBriefData({ slate: { week: 11, games: [g(engineQb)] }, now: NOW }).gamesToCome[0].quarterbackNews;

  it('ignores a backup who is out when the starter has not changed', () => {
    expect(news({ home: { starter: 'Bo Nix', changed: false }, away: { starter: 'Fernando Mendoza', changed: true } })).toEqual(['Fernando Mendoza starts for LV']);
  });
  it('reports a quarterback who is out when the starter has changed', () => {
    expect(news({ home: { starter: 'Jarrett Stidham', changed: true } })).toEqual(['DEN quarterback Sam Ehlinger is out', 'Jarrett Stidham starts for DEN']);
  });
});

describe('buildEngineBrief', () => {
  const brief = buildEngineBrief(data);

  it('leads with what is live, never with a finished game', () => {
    expect(brief.headline).toBe('Two live, and our pick is on track');
    expect(brief.now.map((x) => x.gameId)).toEqual(['g1', 'g2']);       // our pick first, then the favorite in trouble
    // the clock is left to the page, which shows it live beside the line
    expect(brief.now[0].text).toBe('Our Under 49 is on track. 29 points so far. Stays under 49 with 19 or fewer more.');
    expect(JSON.stringify(brief)).not.toContain('IND');
  });

  it('lists what is next in kickoff order with the two sharpest facts for each', () => {
    expect(brief.next).toEqual([
      { gameId: 'g3', text: 'SF -4, total 45.5. MIN quarterback Kyler Murray is out. Our ratings are 3.7 points lower on SF than the market.' },
      { gameId: 'g4', text: 'CIN -6, total 55. Our pick is Over 54 -107 at BetRivers. The market gives CIN 73% to win.' },
    ]);
    expect(brief.take).toContain('Over 54 -107 at BetRivers in CIN at WSH.');
    expect(brief.source).toBe('engine');
  });

  it('changes its lead with the state of the slate', () => {
    const before = buildEngineBrief(buildBriefData({ slate: { week: 12, games: [nextGame, mondayGame] }, now: new Date('2026-11-21T20:00:00Z') }));
    expect(before.headline).toBe('Week 12 is on deck');
    const after = buildEngineBrief(buildBriefData({ slate: { week: 11, games: [finalGame] }, closes, now: NOW }));
    expect(after.headline).toBe('Week 11 is in the books');
  });
});

describe('parseBrief', () => {
  const good = {
    headline: 'Chicago is sitting on our under.',
    dek: 'Two games on, two to go.',
    now: [{ gameId: 'g1', text: 'The Bears lead but have not covered -11.5. Our Under 49 has room.' }, { gameId: 'zzz', text: 'Not a real game.' }],
    next: [{ gameId: 'g4', text: 'Over 54 at -107 (BetRivers) is our one bet left.' }, { gameId: 'g3', text: 'No Kyler Murray, and SF’s pass rush is 2nd.' }],
    numbers: [{ value: '+480', label: 'San Francisco to win it all' }, { value: '', label: 'dropped' }],
    take: 'Over 54 at +0 edge? No: -107 against a fair -112.',
    also: '',
  };

  it('keeps what checks out against the slate and drops what does not', () => {
    const b = parseBrief(`Here you go:\n${JSON.stringify(good)}`, data);
    expect(b.source).toBe('claude');
    expect(b.headline).toBe('Chicago is sitting on our under');
    expect(b.now).toEqual([{ gameId: 'g1', text: good.now[0].text }]);
    expect(b.next.map((x) => x.gameId)).toEqual(['g3', 'g4']);          // put back in kickoff order
    expect(b.numbers).toEqual([{ value: '+480', label: 'San Francisco to win it all' }]);
  });

  it('rejects a reply that is not JSON, has no headline, or ignores the live games', () => {
    expect(parseBrief('The Colts lost on Thursday.', data)).toBeNull();
    expect(parseBrief(JSON.stringify({ ...good, headline: '' }), data)).toBeNull();
    expect(parseBrief(JSON.stringify({ ...good, now: [{ gameId: 'g5', text: 'Thursday recap.' }] }), data)).toBeNull();
  });

  it('holds every field to its length', () => {
    const long = 'A sentence that goes on. '.repeat(40);
    const b = parseBrief(JSON.stringify({ ...good, headline: long, dek: long, take: long, now: [{ gameId: 'g1', text: long }] }), data);
    expect(b.headline.length).toBeLessThanOrEqual(BRIEF_LIMITS.headline);
    expect(b.dek.length).toBeLessThanOrEqual(BRIEF_LIMITS.dek);
    expect(b.now[0].text.length).toBeLessThanOrEqual(BRIEF_LIMITS.item);
    expect(b.take.length).toBeLessThanOrEqual(BRIEF_LIMITS.take);
  });
});

describe('prompt, signature and helpers', () => {
  it('tells the writer what time it is and to lead with what is live', () => {
    const { system, user } = briefPrompt(data, buildEngineBrief(data));
    expect(system).toContain('It is Sunday, November 22 at 3:26 PM ET.');
    expect(system).toContain('Lead with what is live or about to kick off.');
    expect(system).toContain('Do NOT state a live score or the clock');
    expect(user).toContain('"liveGames"');
  });

  it('keeps the clock, the score line and the down away from the writer', () => {
    const { system, user } = briefPrompt(data, { headline: '', now: [], next: [] });
    const sent = JSON.parse(user.slice(user.indexOf('{'), user.indexOf('\n\nA plain version')));
    expect(sent.liveGames[0]).not.toHaveProperty('clock');
    expect(sent.liveGames[0]).not.toHaveProperty('situation');
    expect(sent.liveGames[0]).not.toHaveProperty('score');
    expect(sent.liveGames[0].stage).toBe('fourth quarter');
    expect(sent.liveGames[0].maximusPick.standing).toBe('29 points so far. Stays under 49 with 19 or fewer more.');
    expect(system).toContain('NEVER mention time left, the down, field position');
    expect(system).toContain('marketWinChance is the betting market’s number'.replace('’', "'"));
  });

  it('drops sentences that would be stale within a minute, and nothing else', () => {
    expect(dropStale('BUF has 3rd & Goal at the MIA 10 and leads by 14. A touchdown covers it.')).toBe('A touchdown covers it.');
    expect(dropStale('It sits at 31 with 5:47 left. Still under.')).toBe('Still under.');
    expect(dropStale('PIT trails by 10, with the ball near midfield.')).toBe('');
    expect(dropStale('NYJ at LAC kicks at 4:05 on Fox. LAC -3, total 43.5.')).toBe('NYJ at LAC kicks at 4:05 on Fox. LAC -3, total 43.5.');
    expect(withoutClock('41 points at Q4 9:51, already past 40.5.')).toBe('41 points so far, already past 40.5.');
  });

  it('removes stale sentences from a model reply and drops an item left empty', () => {
    const b = parseBrief(JSON.stringify({
      headline: 'Two live',
      now: [
        { gameId: 'g1', text: 'Our under is fine. NO has 1st & 10 at the NO 8.' },
        { gameId: 'g2', text: 'PIT has 2nd and 5 at the PHI 30.' },
      ],
      numbers: [{ value: '17', label: 'points of room. It sits at 31 with 5:47 left.' }, { value: '9', label: 'Q4 5:47 on the clock.' }],
    }), data);
    expect(b.now).toEqual([{ gameId: 'g1', text: 'Our under is fine.' }]);
    expect(b.numbers).toEqual([{ value: '17', label: 'points of room.' }]);
  });

  it('changes signature when a game kicks off or ends', () => {
    expect(briefSignature(slate)).toBe('w11|l2|u2|f1');
    const later = { ...slate, games: slate.games.map((g) => (g.gameId === 'g1' ? { ...g, status: 'final' } : g)) };
    expect(briefSignature(later)).toBe('w11|l1|u2|f2');
  });

  it('names the TV window a kickoff is in', () => {
    expect(windowFor('2026-11-22T18:00:00Z')).toBe('the early window');
    expect(windowFor('2026-11-22T21:25:00Z')).toBe('the late window');
    expect(windowFor('2026-11-23T01:20:00Z')).toBe('Sunday night');
    expect(windowFor('2026-11-24T01:15:00Z')).toBe('Monday night');
  });

  it('renders the brief as plain paragraphs for older callers', () => {
    const text = briefToText(buildEngineBrief(data), data);
    expect(text.split('\n\n')[0]).toMatch(/^Two live, and our pick is on track\. Maximus has 1 pick in play, 1 pick to come\./);
    expect(text).toContain('**NO at CHI**: Our Under 49 is on track.');
  });
});
