import { describe, it, expect } from 'vitest';
import { buildNbaBriefData, buildNbaEngineBrief, parseNbaBrief, nbaBriefToText, nbaBriefSignature, nbaBriefPrompt } from './nbaBrief.js';

const team = (slug, abbrev, name, record, score = 0) => ({ slug, abbrev, name, record, score });
const game = (id, status, away, home, market = {}, extra = {}) => ({
  gameId: id, status, startTime: extra.startTime || '2026-11-22T23:00:00Z',
  teams: { away, home }, market, gameState: extra.gameState || {}, venue: { name: 'Kaseya Center' }, broadcast: { network: extra.tv || null },
});
const okcMia = game('g1', 'upcoming', team('okc', 'OKC', 'Oklahoma City Thunder', '10-6'), team('mia', 'MIA', 'Miami Heat', '9-6'),
  { pregameSpread: -4.5, pregameTotal: 226, moneyline: { away: 155, home: -185 } });
const dalUta = game('g2', 'upcoming', team('dal', 'DAL', 'Dallas Mavericks', '7-9'), team('uta', 'UTA', 'Utah Jazz', '3-14'),
  { pregameSpread: 2.5, pregameTotal: 231.5, moneyline: { away: -135, home: 115 } }, { startTime: '2026-11-23T00:00:00Z' });
const overPick = {
  id: 'g1-total-over', gameId: 'g1', pickRole: 'hero',
  market: { type: 'total', line: 226 }, selection: { side: 'over', label: 'Over 226' }, conviction: { score: 82 },
  matchup: { awayTeam: { slug: 'okc' }, homeTeam: { slug: 'mia' }, startTime: '2026-11-22T23:00:00Z' },
  totalDebug: { fairTotal: 243.4, marketTotal: 226 },
  awayTeamForm: { sample: 3, recentTotalAvg: 234.3 }, homeTeamForm: { sample: 2, recentTotalAvg: 252.5 },
};
const board = { fullSlatePicks: [overPick] };
const champOdds = { sas: { bestChanceAmerican: 260 }, okc: { bestChanceAmerican: 500 }, phi: { bestChanceAmerican: 800 } };
const NOW = new Date('2026-11-22T22:00:00Z');

describe('buildNbaBriefData', () => {
  const data = buildNbaBriefData({ games: [dalUta, okcMia], board, champOdds, now: NOW });

  it('lists games to come in tip-off order with their lines', () => {
    expect(data.gamesToCome.map((g) => g.gameId)).toEqual(['g1', 'g2']);
    expect(data.gamesToCome[0]).toMatchObject({ away: 'OKC', home: 'MIA', spread: 'MIA -4.5', total: 226, tip: '6:00 PM ET', awayRecord: '10-6' });
    expect(data.gamesToCome[1].spread).toBe('DAL -2.5');
    expect(data.gamesToCome[0].moneyline).toBe('OKC +155, MIA -185');
  });

  it('attaches our pick with its reason and how many games it rests on', () => {
    expect(data.gamesToCome[0].maximusPick).toMatchObject({ call: 'Over 226', market: 'total', conviction: 82, builtOnGames: 2 });
    expect(data.gamesToCome[0].maximusPick.why).toMatch(/Thunder’s last 3 games averaged 234 points/);
    expect(data.gamesToCome[1].maximusPick).toBeUndefined();
    expect(data.picksToCome).toBe(1);
  });

  it('orders the title market by price', () => {
    expect(data.titleMarket.map((t) => `${t.team} ${t.price}`)).toEqual(['Spurs +260', 'Thunder +500', '76ers +800']);
  });

  it('says where a pick stands once its game is live, without the clock', () => {
    const live = { ...okcMia, status: 'live', gameState: { isLive: true, period: 3, periodLabel: '4:12 - 3rd' },
      teams: { away: team('okc', 'OKC', 'Oklahoma City Thunder', '10-6', 88), home: team('mia', 'MIA', 'Miami Heat', '9-6', 90) } };
    const started = { startedPicks: [{ id: 'g1-total-over', gameId: 'g1', market: 'total', side: 'over', line: 226, label: 'Over 226' }] };
    const d = buildNbaBriefData({ games: [live], board: started, now: NOW });
    // 178 points with 4:12 left in the third is a pace of about 269: well over 226.
    expect(d.liveGames[0]).toMatchObject({ stage: 'third quarter', maximusPick: { call: 'Over 226', verdict: 'ahead', standing: 'on pace to go over the total' } });
    expect(d.liveGames[0].maximusPick.standing).not.toMatch(/\d/);
  });
});

describe('buildNbaEngineBrief', () => {
  const data = buildNbaBriefData({ games: [okcMia, dalUta], board, champOdds, now: NOW });
  const brief = buildNbaEngineBrief(data);

  it('leads with tonight and the picks on the board', () => {
    expect(brief.headline).toBe('Two games tonight, one pick on the board');
    expect(brief.dek).toBe('Thunder at Heat tips first at 6:00 PM ET. The tightest line is Mavericks at Jazz (DAL -2.5).');
  });

  it('gives every game its line and states a pick with its reason', () => {
    expect(brief.next[0]).toEqual({ gameId: 'g1', text: 'MIA -4.5, total 226. Our pick is Over 226. The Thunder’s last 3 games averaged 234 points and the Heat’s last 2 averaged 253, against a total of 226.' });
    expect(brief.next[1].text).toBe('DAL -2.5, total 231.5. The Mavericks are 7-9 and the Jazz are 3-14.');
  });

  it('is honest that a total rests on a small sample', () => {
    expect(brief.take).toMatch(/^Over 226 in Thunder at Heat is the strongest call left tonight\./);
    expect(brief.take).toMatch(/small sample/);
    expect(brief.numbers.map((n) => n.value)).toEqual(['82', '231.5', '+260']);
    expect(brief.also).toBe('The Spurs are the +260 title favorite, ahead of the Thunder (+500) and the 76ers (+800).');
    expect(brief.source).toBe('engine');
  });

  it('has something true to say on an empty day', () => {
    const empty = buildNbaEngineBrief(buildNbaBriefData({ games: [], now: NOW }));
    expect(empty.headline).toBe('No NBA games today');
    expect(empty.next).toEqual([]);
  });

  it('turns into plain paragraphs for the email', () => {
    const text = nbaBriefToText(brief, data);
    expect(text.split('\n\n')[0]).toMatch(/^Two games tonight, one pick on the board\. Thunder at Heat/);
    expect(text).toMatch(/\*\*OKC at MIA\*\*: MIA -4\.5/);
  });
});

describe('parseNbaBrief', () => {
  const data = buildNbaBriefData({ games: [okcMia, dalUta], board, champOdds, now: NOW });
  const good = {
    headline: 'Six points of daylight in Miami 🔥.',
    dek: 'Two games, one pick.',
    now: [],
    next: [{ gameId: 'g2', text: 'DAL -2.5.' }, { gameId: 'g1', text: 'Over 226 at 155 looks right.' }, { gameId: 'zz', text: 'Not on the slate.' }],
    numbers: [{ value: '82', label: 'Conviction.' }],
    take: 'Over 226.',
    also: '',
  };

  it('keeps only games on the slate, in tip-off order, and strips emoji', () => {
    const b = parseNbaBrief(`Here you go: ${JSON.stringify(good)}`, data);
    expect(b.headline).toBe('Six points of daylight in Miami');
    expect(b.next.map((x) => x.gameId)).toEqual(['g1', 'g2']);
    expect(b.source).toBe('claude');
  });

  it('rejects a reply that ignores the games left to play', () => {
    expect(parseNbaBrief(JSON.stringify({ ...good, next: [] }), data)).toBeNull();
    expect(parseNbaBrief('not json', data)).toBeNull();
  });
});

describe('signature and prompt', () => {
  it('changes when a game tips off or the picks change', () => {
    const a = nbaBriefSignature([okcMia, dalUta], board);
    expect(nbaBriefSignature([{ ...okcMia, status: 'live' }, dalUta], board)).not.toBe(a);
    expect(nbaBriefSignature([okcMia, dalUta], { fullSlatePicks: [] })).not.toBe(a);
    expect(nbaBriefSignature([okcMia, dalUta], board)).toBe(a);
  });

  it('gives the model the facts but not the internals', () => {
    const data = buildNbaBriefData({ games: [okcMia], board, now: NOW });
    const { system, user } = nbaBriefPrompt(data, buildNbaEngineBrief(data));
    expect(system).toMatch(/regular season/);
    expect(user).not.toMatch(/_games/);
    expect(user).toMatch(/"spread":"MIA -4.5"/);
  });
});

import { projectionFact, dropMatchupLabel } from './nbaBrief.js';

describe('brief fixes after the first production run', () => {
  const data = buildNbaBriefData({ games: [okcMia, dalUta], board, champOdds, now: NOW });

  it('hands the writer the projection and its gap to the line, already worked out', () => {
    expect(projectionFact(overPick)).toEqual({ projectedTotal: 243.4, projectionVsTotal: '17.4 points above the total' });
    expect(projectionFact({ ...overPick, totalDebug: { fairTotal: 218 }, market: { type: 'total', line: 226.5 } }).projectionVsTotal).toBe('8.5 points below the total');
    expect(projectionFact({ market: { type: 'runline', line: 4.5 } })).toEqual({});
    expect(projectionFact({ market: { type: 'total', line: 226 } })).toEqual({});
    expect(data.gamesToCome[0].maximusPick).toMatchObject({ projectedTotal: 243.4, projectionVsTotal: '17.4 points above the total' });
  });

  it('tells the model not to do arithmetic, not to repeat the matchup, and not to announce a missing pick', () => {
    const { system, user } = nbaBriefPrompt(data, buildNbaEngineBrief(data));
    expect(system).toMatch(/NO ARITHMETIC/);
    expect(system).toMatch(/Do not open a line with the matchup/);
    expect(system).toMatch(/Do not say we have no pick/);
    expect(user).toMatch(/"projectionVsTotal":"17.4 points above the total"/);
  });

  it('takes a repeated matchup label off the front of a line', () => {
    expect(dropMatchupLabel('ORL at WAS, 7:00 PM ET. ORL -4.5, total 219.5. Our pick is Over 219.5.')).toBe('ORL -4.5, total 219.5. Our pick is Over 219.5.');
    expect(dropMatchupLabel('DEN at CHI: the Bulls are 4-11 and the market has noticed.')).toBe('The Bulls are 4-11 and the market has noticed.');
    expect(dropMatchupLabel('IND @ NYK, 8 PM ET - NYK -7.5 and a total of 213.5.')).toBe('NYK -7.5 and a total of 213.5.');
    // A sentence that starts with the matchup is not a label.
    expect(dropMatchupLabel('OKC at MIA is in the second quarter.')).toBe('OKC at MIA is in the second quarter.');
    expect(dropMatchupLabel('BOS -8, total 210.5.')).toBe('BOS -8, total 210.5.');
    // Never leave a stub behind.
    expect(dropMatchupLabel('ORL at WAS. Fun one.')).toBe('ORL at WAS. Fun one.');
  });

  it('applies that to a model reply', () => {
    const reply = { headline: 'Two on the board', dek: '', now: [], next: [{ gameId: 'g1', text: 'OKC at MIA, 6:00 PM ET. MIA -4.5, total 226. Our pick is Over 226.' }, { gameId: 'g2', text: 'DAL -2.5, total 231.5.' }], numbers: [], take: '', also: '' };
    expect(parseNbaBrief(JSON.stringify(reply), data).next[0].text).toBe('MIA -4.5, total 226. Our pick is Over 226.');
  });

  it('does not claim there is no pick on a live game', () => {
    const live = { ...okcMia, status: 'live', gameState: { isLive: true, period: 2, periodLabel: '6:10 - 2nd' } };
    const brief = buildNbaEngineBrief(buildNbaBriefData({ games: [live], board: { fullSlatePicks: [] }, now: NOW }));
    expect(brief.now[0].text).toBe('Thunder at Heat is in the second quarter. The Thunder came in 10-6, the Heat 9-6.');
    expect(brief.now[0].text).not.toMatch(/pick/i);
  });
});

import { isFigure } from './nbaBrief.js';

describe('brief fixes after the first brief with picks in play', () => {
  const liveGame = (score, label, period) => ({ ...okcMia, status: 'live', gameState: { isLive: true, period, periodLabel: label },
    teams: { away: team('okc', 'OKC', 'Oklahoma City Thunder', '10-6', score[0]), home: team('mia', 'MIA', 'Miami Heat', '9-6', score[1]) } });
  const started = (extra = {}) => ({ startedPicks: [{ id: 'g1-total-over', gameId: 'g1', market: 'total', side: 'over', line: 226, label: 'Over 226', ...extra }] });

  it('gives a live pick its published reason, and no score', () => {
    const why = 'The Thunder’s last 3 games averaged 234 points and the Heat’s last 2 averaged 253, against a total of 226.';
    const data = buildNbaBriefData({ games: [liveGame([60, 58], '2:00 - 2nd', 2)], board: started({ why }), now: NOW });
    expect(data.liveGames[0].maximusPick).toEqual({ call: 'Over 226', verdict: 'ahead', standing: 'on pace to go over the total', why });
    expect(buildNbaEngineBrief(data).now[0].text).toBe(`Our pick is Over 226. It is on pace to go over the total. ${why}`);
  });

  it('does not read a total in the first minutes', () => {
    const data = buildNbaBriefData({ games: [liveGame([4, 3], '9:30 - 1st', 1)], board: started(), now: NOW });
    expect(data.liveGames[0].maximusPick).toEqual({ call: 'Over 226', verdict: null, standing: 'too early to read' });
    expect(buildNbaEngineBrief(data).now[0].text).toBe('Our pick is Over 226. It is too early to read.');
  });

  it('keeps the numbers once a game is final', () => {
    const final = { ...liveGame([101, 99], 'Final', 4), status: 'final' };
    const data = buildNbaBriefData({ games: [final], board: started(), now: NOW });
    expect(data.finals[0].maximusPick).toMatchObject({ verdict: 'lost', standing: 'Finished with 200 points against a total of 226.' });
  });

  it('only lets a figure into the number tiles', () => {
    for (const ok of ['77', '237.5', '+260', '-415', '10-6', '42%']) expect(isFigure(ok), ok).toBe(true);
    for (const bad of ['Over 219.5', 'Under…', 'Spurs', '', '1234567890']) expect(isFigure(bad), bad).toBe(false);
    const data = buildNbaBriefData({ games: [okcMia, dalUta], board, champOdds, now: NOW });
    const reply = { headline: 'Two on the board', dek: '', now: [], next: [{ gameId: 'g1', text: 'MIA -4.5, total 226.' }],
      numbers: [{ value: 'Over 226', label: 'Our pick.' }, { value: '+260', label: 'Spurs to win it all.' }], take: '', also: '' };
    expect(parseNbaBrief(JSON.stringify(reply), data).numbers).toEqual([{ value: '+260', label: 'Spurs to win it all.' }]);
  });

  it('tells the model what it got wrong the first time games were live', () => {
    const data = buildNbaBriefData({ games: [okcMia], board, now: NOW });
    const { system } = nbaBriefPrompt(data, buildNbaEngineBrief(data));
    expect(system).toMatch(/points scored so far, points still needed/);
    expect(system).toMatch(/If a pick has no "why", give no reason/);
    expect(system).toMatch(/Never mention what it lacks/);
    expect(system).toMatch(/Never a word and never a pick/);
  });
});
