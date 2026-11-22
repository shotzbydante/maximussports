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
    expect(d.liveGames[0]).toMatchObject({ stage: 'third quarter', maximusPick: { call: 'Over 226', verdict: 'behind' } });
    expect(d.liveGames[0].maximusPick.standing).toBe('178 points. Needs 49 more to go over 226.');
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
