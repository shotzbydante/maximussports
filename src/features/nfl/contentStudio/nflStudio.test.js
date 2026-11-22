import { describe, it, expect } from 'vitest';
import { normalizeNflStudioPayload, nflSectionReady, nflSlideCount, fmtAmerican, fmtLine } from './normalizeNflStudioPayload';
import { buildNflCaption } from './buildNflCaption';
import { leadSentences, splitSentences } from './text';
import { normalizeStudioCaption } from '../../mlb/contentStudio/normalizeStudioCaption';

const NOW = new Date('2026-11-22T06:30:00Z');

const team = (slug, abbrev, name, record) => ({ slug, shortName: abbrev, abbrev, name, record, logo: `https://x/${abbrev}.png` });
const ARI = team('cardinals', 'ARI', 'Arizona Cardinals', '3-7');
const KC = team('chiefs', 'KC', 'Kansas City Chiefs', '7-2');
const CIN = team('bengals', 'CIN', 'Cincinnati Bengals', '7-2');
const WSH = team('commanders', 'WSH', 'Washington Commanders', '3-5-1');

function heroPick({ id, gameId, label, line, price, book, away, home, fair, ev, lock = {} }) {
  return {
    id, gameId, tier: 'tier2', category: 'totals', ev, impliedProb: 0.512, modelProb: fair.win,
    pick: { label, marketType: 'total', topSignals: ['12 books put the fair total at 40.5, and wind takes it to 39.3. DraftKings has Under 40.5 at -105.', 'At that number the bet wins 53.6%; the price needs 51.2%.', 'Sustained wind of 15 mph is forecast. In wind of 15 mph or more, unders are 312-235 against the closing total since 2003 (57.0%).'], explanation: `${label}: wind` },
    market: { type: 'total', line, priceAmerican: price },
    selection: { label, priceLabel: `${price} at ${book}` },
    book: { title: book },
    matchup: { awayTeam: away, homeTeam: home, startTime: '2026-11-22T18:00Z', network: 'CBS' },
    conviction: { label: 'Solid', score: 79 },
    fair,
    lock: { lockedAt: '2026-11-22T04:02:20Z', price, line, ...lock },
  };
}

const picks = {
  week: 11, slateLabel: 'Week 11', generatedAt: '2026-11-22T06:12:57Z',
  heroPicks: [
    heroPick({ id: 'p1', gameId: '1', label: 'Under 40.5', line: 40.5, price: -105, book: 'DraftKings', away: ARI, home: KC, fair: { win: 0.536, push: 0, priceAmerican: -116 }, ev: 0.047, lock: { evNow: -0.024 } }),
    heroPick({ id: 'p2', gameId: '2', label: 'Over 54', line: 54, price: -107, book: 'BetRivers', away: CIN, home: WSH, fair: { win: 0.512, push: 0.03, priceAmerican: -112 }, ev: 0.021, lock: { evNow: 0.024 } }),
  ],
  byGame: [
    { gameId: '1', startTime: '2026-11-22T18:00Z', awayTeam: ARI, homeTeam: KC, network: 'CBS',
      projection: { homePoints: 27.2, awayPoints: 16, total: 43.2, margin: 11.2, homeWinProb: 0.927 },
      market: { spreadHome: -15.5, total: 40.5, moneyline: { home: -1471, away: 886 }, books: 12 },
      quarterbacks: { home: { starter: 'Patrick Mahomes', changed: false }, away: { starter: 'Josh Johnson', changed: true } },
      environment: { indoor: false, temp: 48.4, wind: 15.2, precip: 0 },
      situations: [{ key: 'x', label: 'Big home favorite', note: 'Note text.', team: 'KC' }] },
    { gameId: '2', startTime: '2026-11-24T01:15Z', awayTeam: CIN, homeTeam: WSH, network: 'ESPN',
      projection: { homePoints: 25, awayPoints: 28.8, total: 53.8, margin: -3.6, homeWinProb: 0.39 },
      market: { spreadHome: 6, total: 55, books: 12 }, quarterbacks: {}, environment: { indoor: false, temp: 50, wind: 4 }, situations: [] },
  ],
  meta: { picksPublished: 2, heldByReason: { no_price_edge: 3, price_guard: 1 }, booksSeen: ['a', 'b', 'c'] },
};

const games = {
  week: 11, seasonLabel: 'Regular Season',
  games: [
    { gameId: '0', status: 'final', startTime: '2026-11-20T01:15Z', gameState: { isFinal: true }, narrative: { headline: 'Texans roll' },
      teams: { away: { slug: 'colts', abbrev: 'IND', name: 'Indianapolis Colts', score: 3, record: '3-8' }, home: { slug: 'texans', abbrev: 'HOU', name: 'Houston Texans', score: 26, record: '4-6' } } },
    { gameId: '1', status: 'upcoming', startTime: '2026-11-22T18:00Z', gameState: {}, broadcast: { network: 'CBS' }, venue: { name: 'Arrowhead Stadium' },
      teams: { away: { ...ARI, score: 0 }, home: { ...KC, score: 0 } } },
    { gameId: '2', status: 'upcoming', startTime: '2026-11-24T01:15Z', gameState: {}, broadcast: { network: 'ESPN' },
      teams: { away: { ...CIN, score: 0 }, home: { ...WSH, score: 0 } } },
  ],
};

const season = { week: 11, teams: [
  { slug: '49ers', abbrev: 'SF', name: 'San Francisco 49ers', nickname: '49ers', record: '8-1', titleOdds: 480, titleImpliedPct: 0.133, playoffPct: 0.991 },
  { slug: 'bills', abbrev: 'BUF', name: 'Buffalo Bills', nickname: 'Bills', record: '8-1', titleOdds: 500, titleImpliedPct: 0.129, playoffPct: 0.999 },
  { slug: 'jaguars', abbrev: 'JAX', name: 'Jacksonville Jaguars', nickname: 'Jaguars', record: '7-2', titleOdds: 700, titleImpliedPct: 0.097, playoffPct: 0.999 },
  { slug: 'browns', abbrev: 'CLE', name: 'Cleveland Browns', nickname: 'Browns', record: '6-4', titleOdds: 10000, titleImpliedPct: 0.008, playoffPct: 0.477 },
] };

const perf = { record: { won: 4, lost: 2, push: 0 }, winPct: 66.7, units: 1.64, roiPct: 27.3, beatClosePct: 66.7, clvSample: 6 };
const scorecard = {
  performance: { hero: perf }, season: { performance: { hero: perf } },
  slates: [{ date: '2026-11-15', picks: [
    { id: 'g1', pickRole: 'hero', status: 'won', label: 'DET -6.5', awayAbbrev: 'TB', homeAbbrev: 'DET', price: -110, finalScore: 'TB 17, DET 27', units: 0.91, slateDate: '2026-11-15' },
    { id: 'g2', pickRole: 'hero', status: 'lost', label: 'Over 54', awayAbbrev: 'JAX', homeAbbrev: 'NYG', price: -108, finalScore: 'JAX 24, NYG 20', units: -1, slateDate: '2026-11-15' },
    { id: 'g3', pickRole: 'tracking', status: 'won', label: 'MIA +950', awayAbbrev: 'MIA', homeAbbrev: 'BUF', price: 950, units: 9.5, slateDate: '2026-11-15' },
    { id: 'g4', pickRole: 'hero', status: 'pending', label: 'Under 49', awayAbbrev: 'NO', homeAbbrev: 'CHI', price: -110, slateDate: '2026-11-22' },
  ] }],
};

const build = (section, over = {}) => normalizeNflStudioPayload({ section, picks, games, season, scorecard, now: NOW, ...over });

describe('formatters', () => {
  it('formats American prices and lines', () => {
    expect(fmtAmerican(-105)).toBe('-105');
    expect(fmtAmerican(480)).toBe('+480');
    expect(fmtAmerican(null)).toBeNull();
    expect(fmtLine(-3.5)).toBe('-3.5');
    expect(fmtLine(0)).toBe('PK');
  });
});

describe('text helpers', () => {
  it('does not treat the period in a number as the end of a sentence', () => {
    const text = '12 books put the fair total at 40.5, and wind takes it to 39.3. DraftKings has Under 40.5 at -105.';
    expect(splitSentences(text)).toEqual(['12 books put the fair total at 40.5, and wind takes it to 39.3.', 'DraftKings has Under 40.5 at -105.']);
    expect(leadSentences(text)).toBe(text);
    expect(leadSentences(text, 70)).toBe('12 books put the fair total at 40.5, and wind takes it to 39.3.');
  });
  it('keeps whole sentences and cuts at a word only when it must', () => {
    expect(leadSentences('One. Two. Three.', 9)).toBe('One. Two.');
    expect(leadSentences('A very long opening sentence without any break at all', 20)).toBe('A very long opening…');
    expect(leadSentences(null)).toBe('');
  });
});

describe('normalizeNflStudioPayload', () => {
  it('merges the picks board into the week and keeps finals', () => {
    const p = build('nfl-slate');
    expect(p.games.map((g) => g.id)).toEqual(['0', '1', '2']);
    expect(p.upcoming).toHaveLength(2);
    expect(p.finals[0].away.score).toBe(3);
    const kc = p.games[1];
    expect(kc.spreadLabel).toBe('KC -15.5');
    expect(kc.winProbLabel).toBe('KC 93%');
    expect(kc.kickoffLabel).toBe('Sun 1:00 PM ET');
    expect(kc.picks.map((k) => k.label)).toEqual(['Under 40.5']);
    expect(kc.quarterbacks.away).toEqual({ name: 'Josh Johnson', changed: true, uncertain: false });
    expect(kc.weather).toMatchObject({ indoor: false, temp: 48, wind: 15 });
  });

  it('labels a road favorite from the home spread', () => {
    expect(build('nfl-slate').games[2].spreadLabel).toBe('CIN -6');
    expect(build('nfl-slate').games[2].winProbLabel).toBe('CIN 61%');
  });

  it('carries price, fair price and push risk on each pick', () => {
    const [a, b] = build('nfl-picks').heroPicks;
    expect(a).toMatchObject({ offeredPrice: '-105', fairPrice: '-116', hitPct: '53.6%', evLabel: '+4.7%', pushPct: null, movedAgainst: true, matchupLabel: 'ARI @ KC' });
    expect(b).toMatchObject({ pushPct: '3.0%', movedAgainst: false });
  });

  it('counts markets passed on', () => {
    expect(build('nfl-slate').meta).toMatchObject({ picksPublished: 2, held: 4, marketsChecked: 6, booksCount: 3 });
  });

  it('ranks the title race by implied probability and finds bubble teams', () => {
    const p = build('nfl-slate');
    expect(p.titleRace.map((t) => t.abbrev)).toEqual(['SF', 'BUF', 'JAX', 'CLE']);
    expect(p.titleRace[0].titleOddsLabel).toBe('+480');
    expect(p.titleRace[1].playoffLabel).toBe('>99%');
    expect(p.bubble.map((t) => t.abbrev)).toEqual(['CLE']);
  });

  it('builds receipts from published picks only', () => {
    const r = build('nfl-receipts').receipts;
    expect(r).toMatchObject({ hasGraded: true, scope: 'Season to date', recordLabel: '4-2', unitsLabel: '+1.64u', roiLabel: '+27.3%', pendingCount: 1 });
    expect(r.recent.map((k) => k.id)).toEqual(['g1', 'g2']);
  });

  it('picks the selected game, else the first game with a pick', () => {
    expect(build('nfl-game').selectedGame.id).toBe('1');
    expect(build('nfl-game', { selectedGameId: '2' }).selectedGame.id).toBe('2');
  });

  it('degrades to empty, never throws, when every feed is missing', () => {
    const p = normalizeNflStudioPayload({ section: 'nfl-slate', picks: null, games: null, season: null, scorecard: null, now: NOW });
    expect(p.games).toEqual([]);
    expect(p.heroPicks).toEqual([]);
    expect(p.receipts.hasGraded).toBe(false);
    for (const section of ['nfl-slate', 'nfl-picks', 'nfl-game', 'nfl-receipts']) {
      expect(nflSectionReady({ ...p, section }).ok).toBe(false);
      expect(buildNflCaption({ ...p, section }) === null || section === 'nfl-slate').toBe(true);
    }
  });
});

describe('team card, review, explainers', () => {
  const seasonFull = { ...season, teams: [...season.teams, { slug: 'chiefs', abbrev: 'KC', name: 'Kansas City Chiefs', nickname: 'Chiefs', conference: 'AFC', division: 'AFC West', divisionRank: 1, record: '7-2', streak: 'W2', pointDiff: 81, powerRank: 6, projectedWins: 11.8, playoffPct: 0.979, titleOdds: 970, titleImpliedPct: 0.072 }] };
  it('builds a team card with the next game from the team\u2019s side', () => {
    const t = build('nfl-team', { season: seasonFull, selectedTeamSlug: 'chiefs' }).team;
    expect(t).toMatchObject({ nickname: 'Chiefs', standingLabel: '1st in the AFC West', playoffLabel: '98%', titleOddsLabel: '+970', pointDiffLabel: '+81' });
    expect(t.next).toMatchObject({ isHome: true, spreadLabel: 'KC -15.5', winPct: '93%' });
    expect(t.next.opponent.abbrev).toBe('ARI');
    expect(t.next.pick.label).toBe('Under 40.5');
  });
  it('defaults the team card to the top pick\u2019s home team', () => {
    expect(build('nfl-team', { season: seasonFull }).team.slug).toBe('chiefs');
  });
  it('scores finished games against the pregame projection', () => {
    const withModel = { ...games, games: games.games.map((g) => (g.gameId === '0' ? { ...g, model: { projectedHome: 27.9, projectedAway: 19.1, fairTotal: 46.9 } } : g)) };
    const r = build('nfl-review', { games: withModel }).review;
    expect(r).toMatchObject({ finals: 1, rightSide: 1, wrongSide: 0, avgMiss: 14.2 });
    expect(r.misses[0]).toMatchObject({ projected: 'IND 19, HOU 28', actual: 'IND 3, HOU 26', rightSide: true });
    expect(r.lostPicks).toEqual([]); // last week's JAX @ NYG loss is not part of this week's review
    const lostThisWeek = { ...scorecard, slates: [{ date: '2026-11-19', picks: [{ id: 'g9', pickRole: 'hero', status: 'lost', label: 'IND +7.5', awayAbbrev: 'IND', homeAbbrev: 'HOU', price: -110, finalScore: 'IND 3, HOU 26', units: -1, slateDate: '2026-11-19' }] }] };
    expect(build('nfl-review', { games: withModel, scorecard: lostThisWeek }).review.lostPicks.map((k) => k.id)).toEqual(['g9']);
    expect(nflSectionReady(build('nfl-review')).ok).toBe(false); // no projection on the final, nothing to review
  });
  it('expresses a pick as a probability gap with pushes set aside', () => {
    const [a] = build('nfl-picks').heroPicks;
    expect(a.marketPct).toBe('51.2%');
    const raw = { ...picks, heroPicks: [{ ...picks.heroPicks[1], impliedProb: 0.517, fair: { win: 0.512, lose: 0.458, push: 0.03, priceAmerican: -112 } }] };
    const [k] = build('nfl-picks', { picks: raw }).heroPicks;
    expect(k).toMatchObject({ marketPct: '51.7%', modelPct: '52.8%' });
  });
  it('fills the explainer example from live data and has a send line', () => {
    const p = build('nfl-explain', { explainerId: 'passing' });
    expect(p.explainer.title).toBe('Most games are a pass');
    expect(p.explainer.example).toBe('This week we priced 6 markets and passed on 4.');
    expect(p.sendLine).toBe('Send this to the friend who always bets the over.');
  });
  it.each(['nfl-team', 'nfl-explain'])('%s caption is publishable', (section) => {
    const c = normalizeStudioCaption(buildNflCaption(build(section, { season: seasonFull })));
    expect(c.ok).toBe(true);
    expect(c.fullCaption).not.toMatch(/undefined|null|NaN/);
  });
});

describe('readiness and slide counts', () => {
  it('sizes the picks carousel as a cover plus one slide per pick', () => {
    expect(nflSlideCount(build('nfl-picks'))).toBe(3);
    expect(nflSlideCount(build('nfl-slate'))).toBe(3);
    expect(nflSlideCount(build('nfl-game'))).toBe(1);
  });
  it('blocks receipts until something is graded', () => {
    const ready = nflSectionReady(build('nfl-receipts', { scorecard: { slates: [], season: null, performance: { hero: null } } }));
    expect(ready.ok).toBe(false);
    expect(ready.reason).toMatch(/No graded picks/);
  });
  it('blocks the picks post when nothing cleared the bar', () => {
    expect(nflSectionReady(build('nfl-picks', { picks: { ...picks, heroPicks: [] } })).ok).toBe(false);
  });
});

describe('buildNflCaption', () => {
  it.each(['nfl-slate', 'nfl-picks', 'nfl-game', 'nfl-receipts'])('%s produces a publishable caption', (section) => {
    const caption = normalizeStudioCaption(buildNflCaption(build(section)));
    expect(caption.ok).toBe(true);
    expect(caption.fullCaption).toContain('maximussports.ai');
    expect(caption.fullCaption).toContain('1-800-GAMBLER');
    expect(caption.fullCaption).toContain('#NFLWeek11');
    expect(caption.totalLength).toBeLessThan(2200);
    expect(caption.hashtags.length).toBeLessThanOrEqual(8);
    expect(caption.fullCaption).not.toMatch(/undefined|null|NaN/);
  });

  it('states value as fair price against offered price', () => {
    const c = buildNflCaption(build('nfl-picks'));
    expect(c.longCaption).toContain('Fair price -116, offered -105, wins 53.6%, expected value +4.7%.');
    expect(c.longCaption).toContain('wins 51.2% and pushes 3.0%');
  });

  it('says no bet when the selected game has no pick', () => {
    const noPick = { ...picks, heroPicks: [picks.heroPicks[0]] };
    const c = buildNflCaption(build('nfl-game', { picks: noPick, selectedGameId: '2' }));
    expect(c.shortCaption).toContain('no bet');
    expect(c.hashtags).toEqual(expect.arrayContaining(['#Bengals', '#Commanders']));
  });

  it('never promises a win', () => {
    for (const section of ['nfl-slate', 'nfl-picks', 'nfl-game', 'nfl-receipts']) {
      expect(buildNflCaption(build(section)).longCaption).not.toMatch(/\b(lock of|guaranteed|can't lose|sure thing|free money)\b/i);
    }
  });

  it('returns null for receipts with nothing graded', () => {
    expect(buildNflCaption(build('nfl-receipts', { scorecard: null }))).toBeNull();
  });
});
