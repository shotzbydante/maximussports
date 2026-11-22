import { describe, it, expect } from 'vitest';
import { parseCsv, csvNum } from './csv.js';
import { parseGames, parseTeamWeeks, parseQbWeeks, parseCoachGames, nflverseCode } from './nflverse.js';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and CRLF', () => {
    const rows = parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\r\n2,,z\n');
    expect(rows).toEqual([{ a: '1', b: 'x, y', c: 'say "hi"' }, { a: '2', b: '', c: 'z' }]);
  });
  it('keeps only picked columns and filtered rows', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n4,5,6\n', { pick: ['a', 'c'], filter: (r) => r.a === '4' });
    expect(rows).toEqual([{ a: '4', c: '6' }]);
  });
  it('returns nothing for empty input and reads a file with no trailing newline', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv(null)).toEqual([]);
    expect(parseCsv('a,b\n1,2')).toEqual([{ a: '1', b: '2' }]);
  });
  it('treats blank and NA as missing', () => {
    expect(csvNum('')).toBeNull();
    expect(csvNum('NA')).toBeNull();
    expect(csvNum('-3.5')).toBe(-3.5);
    expect(csvNum('abc')).toBeNull();
  });
});

const GAMES = [
  'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,location,espn,away_rest,home_rest,away_moneyline,home_moneyline,spread_line,away_spread_odds,home_spread_odds,total_line,under_odds,over_odds,div_game,roof,temp,wind,away_qb_id,home_qb_id,away_qb_name,home_qb_name,away_coach,home_coach,stadium',
  '2025_18_SD_OAK,2025,REG,18,2026-01-04,16:25,SD,20,OAK,17,Home,1,7,7,-120,100,-1.5,-110,-110,41.5,-110,-110,1,dome,,,00-1,00-2,A Passer,B Passer,Coach A,Coach B,Allegiant',
  '2026_11_MIA_BUF,2026,REG,11,2026-11-22,13:00,MIA,,BUF,,Home,401873070,7,7,880,-1540,16.5,-112,-107,44.5,-105,-114,1,outdoors,,,00-0040014,00-0034857,Kyle McCord,Josh Allen,Coach C,Coach D,Highmark Stadium',
  '2026_01_LA_SF,2026,REG,1,2026-09-13,09:30,LA,24,SF,21,Neutral,3,7,7,110,-130,2.5,-110,-110,47,-110,-110,1,outdoors,61,12,00-3,00-4,C Passer,D Passer,Coach E,Coach F,Somewhere',
].join('\n');

describe('nflverse adapters', () => {
  const games = parseGames(GAMES);

  it('sorts oldest first and maps relocated franchises to today’s code', () => {
    expect(games.map((g) => g.id)).toEqual(['2025_18_SD_OAK', '2026_01_LA_SF', '2026_11_MIA_BUF']);
    expect(games[0]).toMatchObject({ home: 'LV', away: 'LAC' });
    expect(nflverseCode('stl')).toBe('LA');
  });
  it('turns nflverse’s home-favoured-positive spread into a home line', () => {
    const buf = games.find((g) => g.home === 'BUF');
    expect(buf).toMatchObject({
      spreadHome: -16.5, spreadHomePrice: -107, spreadAwayPrice: -112, total: 44.5, overPrice: -114, underPrice: -105,
      mlHome: -1540, mlAway: 880, espnId: '401873070', divisional: true, roof: 'outdoors',
      homeQbId: '00-0034857', awayQbName: 'Kyle McCord', homeCoach: 'Coach D', homeRest: 7,
    });
    expect(buf.homeScore).toBeNull();
    expect(buf.temp).toBeNull();
  });
  it('reads results, weather and neutral sites', () => {
    const intl = games.find((g) => g.id === '2026_01_LA_SF');
    expect(intl).toMatchObject({ neutral: true, homeScore: 21, awayScore: 24, temp: 61, wind: 12, spreadHome: -2.5 });
  });
  it('filters by season', () => {
    expect(parseGames(GAMES, { fromSeason: 2026 })).toHaveLength(2);
  });
  it('counts games coached only for games that have been played', () => {
    expect(parseCoachGames(GAMES)).toEqual({ 'Coach A': 1, 'Coach B': 1, 'Coach E': 1, 'Coach F': 1 });
  });

  it('reads team EPA rows', () => {
    const rows = parseTeamWeeks([
      'season,week,team,season_type,game_id,opponent_team,attempts,sacks_suffered,passing_epa,carries,rushing_epa,passing_yards,rushing_yards,passing_interceptions,sack_fumbles_lost,rushing_fumbles_lost,def_sacks,def_qb_hits',
      '2026,1,LA,REG,2026_01_LA_SF,SF,34,3,6.5,25,-1.25,260,110,1,0,1,2,7',
      '2026,1,WAS,REG,x,DAL,30,1,NA,20,NA,200,90,0,0,0,1,3',
    ].join('\n'));
    expect(rows[0]).toMatchObject({ team: 'LA', opp: 'SF', dropbacks: 37, carries: 25, passEpa: 6.5, rushEpa: -1.25, giveaways: 2, defSacks: 2, defQbHits: 7 });
    expect(rows[1].passEpa).toBeNull();
  });

  it('keeps quarterbacks who took a snap and nobody else', () => {
    const rows = parseQbWeeks([
      'player_id,player_display_name,position,season,week,game_id,team,attempts,sacks_suffered,passing_epa,carries,rushing_epa',
      '00-1,Josh Allen,QB,2026,1,g,BUF,30,2,8.5,6,2.5',
      '00-2,Some Back,RB,2026,1,g,BUF,0,0,,18,1.1',
      '00-3,Inactive Passer,QB,2026,1,g,BUF,0,0,,0,',
    ].join('\n'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerId: '00-1', name: 'Josh Allen', dropbacks: 32, plays: 38, epa: 11 });
  });
});
