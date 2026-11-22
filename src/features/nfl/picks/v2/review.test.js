import { describe, it, expect } from 'vitest';
import {
  gameFacts, summaryState, boxScoreRead, gameContext, decidedBy, reviewPick, reviewNote, reviewSignals,
  trendStatus, buildLedger, ledgerFindings, summarizeReviews, weekKeyOf, TREND_RULES, REVIEW_PARAMS,
} from './review.js';

const stat = (name, displayValue) => ({ name, displayValue: String(displayValue) });
function summary({
  home = { id: '12', abbr: 'KC', yards: 435, turnovers: 0, redZone: '3-5', defTds: 0 },
  away = { id: '22', abbr: 'ARI', yards: 205, turnovers: 0, redZone: '1-1', defTds: 0 },
  scoringPlays, period = 4, passers,
} = {}) {
  const team = (t, homeAway) => ({
    team: { id: t.id, abbreviation: t.abbr }, homeAway,
    statistics: [stat('totalYards', t.yards), stat('turnovers', t.turnovers), stat('redZoneAttempts', t.redZone), stat('defensiveTouchdowns', t.defTds)],
  });
  const out = {
    boxscore: {
      teams: [team(away, 'away'), team(home, 'home')],
      players: passers || [
        { team: { id: away.id }, statistics: [{ name: 'passing', athletes: [{ athlete: { displayName: 'Josh Johnson' }, stats: ['18/31', '155'] }] }] },
        { team: { id: home.id }, statistics: [{ name: 'passing', athletes: [
          { athlete: { displayName: 'Justin Fields' }, stats: ['0/1', '0'] },
          { athlete: { displayName: 'Patrick Mahomes' }, stats: ['27/39', '324'] },
        ] }] },
      ],
    },
    header: { competitions: [{ status: { period }, competitors: [
      { id: home.id, homeAway: 'home', team: { id: home.id }, linescores: [{}, {}, {}, {}] },
      { id: away.id, homeAway: 'away', team: { id: away.id }, linescores: [{}, {}, {}, {}] },
    ] }] },
  };
  if (scoringPlays) out.scoringPlays = scoringPlays;
  return out;
}

const pick = (over = {}) => ({
  id: 'p1', game_id: '401', slate_date: '2026-11-22', start_time: '2026-11-22T18:00:00Z', locked_at: '2026-11-22T04:02:00Z',
  market_type: 'total', selection_side: 'under', line_value: '40.5', price_american: -105, book: 'DraftKings',
  tier: 'tier2', expected_value: '0.047', rationale: { pickRole: 'hero', headline: 'Under 40.5: 15 mph wind and -105 at DraftKings' },
  payload: { modelSource: 'nfl_v2_wind', week: 11 },
  ...over,
});
const result = (status, home, away, units) => ({ status, final_home_score: home, final_away_score: away, units });
const close = { spread_home: '-15.5', total: '40.5', fair_margin: '15.25', fair_total: '40.38', fair_home_win: '0.932' };
// The same game had the market come down to the pick: a good number at the close.
const goodClose = { ...close, total: '39.5', fair_total: '39.4' };

describe('gameFacts', () => {
  it('reads yards, turnovers, red zone and passers from an ESPN summary', () => {
    const f = gameFacts(summary());
    expect(f.ok).toBe(true);
    expect(f.yards).toEqual({ home: 435, away: 205 });
    expect(f.turnovers).toEqual({ home: 0, away: 0 });
    expect(f.redZone.home).toEqual({ made: 3, tries: 5 });
    expect(f.overtime).toBe(false);
    expect(f.passers.home[0]).toEqual({ name: 'Patrick Mahomes', attempts: 39 });   // most attempts first
    expect(f.returnTds).toEqual({ home: 0, away: 0 });
  });

  it('counts return touchdowns from scoring plays and spots overtime', () => {
    const f = gameFacts(summary({
      period: 5,
      scoringPlays: [
        { type: { text: 'Passing Touchdown' }, team: { id: '12' } },
        { type: { text: 'Interception Return Touchdown' }, team: { id: '22' } },
        { type: { text: 'Punt Return Touchdown' }, team: { id: '22' } },
        { type: { text: 'Blocked Punt Touchdown' }, team: { id: '12' } },
        { type: { text: 'Field Goal' }, team: { id: '12' } },
      ],
    }));
    expect(f.returnTds).toEqual({ home: 1, away: 2 });
    expect(f.overtime).toBe(true);
  });

  it('is not ok without yardage, and never throws on an empty summary', () => {
    expect(gameFacts({}).ok).toBe(false);
    expect(gameFacts(null).ok).toBe(false);
  });
});

describe('summaryState', () => {
  const half = { boxscore: { teams: [
    { homeAway: 'away', statistics: [stat('possessionTime', '11:58')] },
    { homeAway: 'home', statistics: [stat('possessionTime', '16:11')] },
  ] } };
  const full = { boxscore: { teams: [
    { homeAway: 'away', statistics: [stat('possessionTime', '27:34')] },
    { homeAway: 'home', statistics: [stat('possessionTime', '32:26')] },
  ] } };
  const header = (home, away, completed) => ({ header: { competitions: [{ status: { type: { completed } }, competitors: [{ homeAway: 'home', score: String(home) }, { homeAway: 'away', score: String(away) }] }] } });

  it('rejects a box score from earlier in the game', () => {
    // Seen on ESPN after a final: 28 minutes of possession in the summary.
    expect(summaryState(half, { home: 21, away: 13 })).toBe('not_final');
    expect(summaryState(full, { home: 34, away: 7 })).toBe('final');
  });
  it('trusts a header that is complete and matches the graded score', () => {
    expect(summaryState({ ...half, ...header(21, 13, true) }, { home: 21, away: 13 })).toBe('final');
    expect(summaryState({ ...full, ...header(14, 13, true) }, { home: 21, away: 13 })).toBe('not_final');
    expect(summaryState({ ...full, ...header(21, 13, false) }, { home: 21, away: 13 })).toBe('not_final');
  });
  it('says so when it cannot tell', () => {
    expect(summaryState(null, { home: 1, away: 0 })).toBe('unknown');
    expect(summaryState({ boxscore: { teams: [] } }, { home: 1, away: 0 })).toBe('unknown');
  });
});

describe('boxScoreRead', () => {
  it('splits a margin into play, turnovers and return scores', () => {
    const facts = { ok: true, yards: { home: 400, away: 300 }, turnovers: { home: 0, away: 3 }, returnTds: { home: 1, away: 0 } };
    const r = boxScoreRead(facts, { home: 31, away: 10 });
    expect(r.margin.play).toBe(7.4);                      // 0.9 + 0.065 x 100
    expect(r.margin.turnovers).toBe(12.8);                // 3 x 4.25, rounded
    expect(r.margin.returns).toBe(5.4);
    expect(r.margin.rest).toBeCloseTo(21 - 7.4 - 12.75 - 5.4, 1);
    expect(r.total.play).toBe(40.6);                      // -19.8 + 0.0863 x 700
    expect(r.total.returns).toBe(6.5);
  });
  it('returns null without facts or a score', () => {
    expect(boxScoreRead({ ok: false }, { home: 1, away: 0 })).toBeNull();
    expect(boxScoreRead({ ok: true, yards: { home: 1, away: 1 } }, {})).toBeNull();
  });
});

describe('decidedBy', () => {
  it('measures each market from the ticket’s side', () => {
    expect(decidedBy({ market: 'total', side: 'under', line: 40.5, home: 24, away: 10 })).toBe(6.5);
    expect(decidedBy({ market: 'total', side: 'over', line: 40.5, home: 24, away: 10 })).toBe(-6.5);
    expect(decidedBy({ market: 'runline', side: 'away', line: 15.5, home: 24, away: 10 })).toBe(1.5);
    expect(decidedBy({ market: 'runline', side: 'home', line: -15.5, home: 24, away: 10 })).toBe(-1.5);
    expect(decidedBy({ market: 'moneyline', side: 'away', line: null, home: 24, away: 10 })).toBe(-14);
  });
});

describe('reviewPick', () => {
  const facts = gameFacts(summary());
  const teams = { home: 'KC', away: 'ARI' };

  it('returns null until the pick has a final result', () => {
    expect(reviewPick({ pick: pick(), result: { status: 'pending' } })).toBeNull();
    expect(reviewPick({ pick: pick(), result: null })).toBeNull();
  });

  it('reviews a winning total: margin, number at the close, and what the yardage says', () => {
    const r = reviewPick({ pick: pick(), result: result('won', 24, 10), close: goodClose, facts, teams });
    expect(r.status).toBe('won');
    expect(r.by).toBe(6.5);
    expect(r.closeness).toBe('clear');
    expect(r.clv.closingLine).toBe(39.5);
    expect(r.clv.points).toBe(1);                          // a point better than the close
    expect(r.clv.value).toBe('plus');                      // still positive at the close
    expect(r.verdict).toBe('good_number_won');
    expect(r.play.total.yards).toBe(640);
    expect(r.play.total.play).toBe(35.4);                  // -19.8 + 0.0863 x 640
    expect(r.play.luck).toBe('in_line');
    expect(r.tags).toMatchObject({ market: 'total', side: 'under', kind: 'wind', book: 'DraftKings', lead: 'under_24h', tier: 'tier2' });
    expect(r.units).toBeCloseTo(0.952, 2);
    expect(r.note).toMatch(/^Won by 6\.5 points\./);
    expect(r.note).toMatch(/640 yards/);
  });

  it('calls a loss unlucky when the yardage pointed the other way by a clear margin', () => {
    // 560 yards usually means about 28.5 points; two return scores pushed it over 40.5.
    const f = gameFacts(summary({
      home: { id: '12', abbr: 'KC', yards: 330, turnovers: 2, redZone: '2-3', defTds: 1 },
      away: { id: '22', abbr: 'ARI', yards: 230, turnovers: 2, redZone: '1-2', defTds: 1 },
      scoringPlays: [
        { type: { text: 'Interception Return Touchdown' }, team: { id: '12' } },
        { type: { text: 'Fumble Return Touchdown' }, team: { id: '22' } },
      ],
    }));
    const r = reviewPick({ pick: pick(), result: result('lost', 27, 17), close: goodClose, facts: f, teams });
    expect(r.by).toBe(-3.5);
    expect(r.play.luck).toBe('unlucky');
    expect(r.verdict).toBe('good_number_lost');
    expect(r.note).toMatch(/The yardage pointed our way\./);
    expect(r.note).toMatch(/2 return touchdowns added about 13 points/);
  });

  it('prices the ticket at the real closing number: an edge the market never agreed with', () => {
    // Under 40.5 at -105 against a closing fair total of 40.38 wins a shade
    // over half the time, which -105 does not pay for.
    const r = reviewPick({ pick: pick(), result: result('won', 24, 10), close, facts, teams });
    expect(r.clv.ev).toBeLessThan(0);
    expect(r.clv.value).toBe('minus');
    expect(r.clv.move).toBe('against');
    expect(r.verdict).toBe('bad_number_won');
    expect(r.missed.map((m) => m.key)).toEqual(['market_disagreed']);
    expect(r.note).toMatch(/The market did not move for the wind: the total closed at 40\.5 \(-1\.8% at the close\)\./);
  });

  it('says when a price edge was simply gone by kickoff', () => {
    const p = pick({ rationale: { pickRole: 'hero', headline: 'Under 40.5 at -105' }, payload: { modelSource: 'nfl_v2_price' }, clv_ev: '0.001', clv_points: '0', closing_line: '40.5' });
    const r = reviewPick({ pick: p, result: result('won', 20, 10), facts, teams });
    expect(r.clv.value).toBe('fair');
    expect(r.verdict).toBe('good_number_won');
    expect(r.missed.map((m) => m.key)).toEqual(['edge_closed']);
    expect(r.note).toMatch(/The price edge was gone by kickoff \(\+0\.1% at the close\)\./);
  });

  it('marks a coin flip and a pick that lost the number', () => {
    const p = pick({ line_value: '42.5', clv_ev: '-0.031', closing_line: '40.5', clv_points: '-2' });
    const r = reviewPick({ pick: p, result: result('lost', 23, 20), close, facts, teams });
    expect(r.by).toBe(-0.5);
    expect(r.closeness).toBe('coin_flip');
    expect(r.clv.value).toBe('minus');
    expect(r.clv.move).toBe('against');
    expect(r.verdict).toBe('bad_number_lost');
    expect(r.missed.map((m) => m.key)).toContain('line_moved_against');
    expect(r.missed[0].text).toBe('The line moved against it: closed 40.5 against our 42.5.');
    expect(r.note).toMatch(/the hook/);
    expect(r.note).toMatch(/The line moved against it: closed 40\.5 against our 42\.5 \(-3\.1% at the close\)\./);
  });

  it('notices a quarterback the engine did not expect, and a changed wind forecast', () => {
    const context = { gameId: '401', home: 'KC', away: 'ARI', wind: 8, qbs: { home: { name: 'Patrick Mahomes' }, away: { name: 'Jacoby Brissett' } } };
    const r = reviewPick({ pick: pick(), result: result('won', 24, 10), close, context, facts, teams });
    const keys = r.missed.map((m) => m.key);
    expect(keys).toContain('qb_change');
    expect(keys).toContain('wind_forecast');
    expect(r.missed.find((m) => m.key === 'qb_change').text).toBe('ARI started Josh Johnson at quarterback; the engine expected Jacoby Brissett.');
    expect(r.missed.find((m) => m.key === 'wind_forecast').text).toBe('The wind forecast was 15 mph at the lock and 8 mph by kickoff.');
  });

  it('reviews a side: turnovers and return scores are named when they went against it', () => {
    const f = gameFacts(summary({
      home: { id: '12', abbr: 'KC', yards: 300, turnovers: 0, redZone: '2-3', defTds: 1 },
      away: { id: '22', abbr: 'ARI', yards: 420, turnovers: 3, redZone: '1-4', defTds: 0 },
      scoringPlays: [{ type: { text: 'Interception Return Touchdown' }, team: { id: '12' } }],
    }));
    const p = pick({ market_type: 'runline', selection_side: 'away', line_value: '3.5', price_american: -110, rationale: { pickRole: 'tracking', headline: 'Model lean' }, tier: 'tracking', payload: null, expected_value: '-0.03' });
    const r = reviewPick({ pick: p, result: result('lost', 27, 17), close: { ...close, spread_home: '-3.5', fair_margin: '3.4' }, facts: f, teams });
    expect(r.role).toBe('tracking');
    expect(r.verdict).toBe('lost');                        // leans are not judged on the number
    expect(r.by).toBe(-6.5);
    expect(r.play.luck).toBe('unlucky');                   // outgained KC by 120 yards and lost
    expect(r.tags).toMatchObject({ market: 'runline', side: 'underdog', venue: 'away' });
    expect(r.tags.kind).toBeUndefined();
    expect(r.note).toMatch(/ARI had the better of the play\. KC won the turnovers 3-0, usually worth about 13 points\./);
  });

  it('leads with the biggest swing, and does not put a number on level yardage', () => {
    // Carolina 35, Baltimore 33: 43 yards between them, three turnovers and a return score.
    const f = gameFacts(summary({
      home: { id: '12', abbr: 'CAR', yards: 378, turnovers: 0, redZone: '3-4', defTds: 1 },
      away: { id: '22', abbr: 'BAL', yards: 421, turnovers: 3, redZone: '3-5', defTds: 0 },
      scoringPlays: [{ type: { text: 'Fumble Return Touchdown' }, team: { id: '12' } }],
    }));
    const lean = (over) => pick({ market_type: 'moneyline', selection_side: 'away', line_value: null, price_american: 127, tier: 'tracking', rationale: { pickRole: 'tracking' }, payload: null, expected_value: '-0.04', ...over });
    const r = reviewPick({ pick: lean(), result: result('lost', 35, 33), facts: f, teams: { home: 'CAR', away: 'BAL' } });
    expect(r.factors.map((x) => x.key)).toEqual(['turnovers', 'return_tds', 'yards']);
    expect(r.note).toBe('Lost by 2 points: inside a field goal. CAR won the turnovers 3-0, usually worth about 13 points.');

    const level = gameFacts(summary({
      home: { id: '12', abbr: 'CHI', yards: 311, turnovers: 1, redZone: '2-3', defTds: 0 },
      away: { id: '22', abbr: 'NO', yards: 307, turnovers: 1, redZone: '1-2', defTds: 0 },
    }));
    const r2 = reviewPick({ pick: lean({ price_american: 520 }), result: result('lost', 21, 13), facts: level, teams: { home: 'CHI', away: 'NO' } });
    expect(r2.note).toBe('Lost by 8 points. The yardage was about even.');
  });

  it('still reviews with no box score and no closing line', () => {
    const r = reviewPick({ pick: pick({ expected_value: null }), result: result('lost', 30, 20) });
    expect(r.play).toBeNull();
    expect(r.clv.value).toBeNull();
    expect(r.verdict).toBe('lost');
    expect(r.note).toBe('Lost by 9.5 points.');
  });

  it('handles a push', () => {
    const r = reviewPick({ pick: pick({ line_value: '41' }), result: result('push', 24, 17), close, facts, teams });
    expect(r.verdict).toBe('push');
    expect(r.play.luck).toBeNull();
    expect(reviewNote(r)).toMatch(/^Landed on the number: a push\./);
  });
});

describe('gameContext', () => {
  it('keeps what the review needs from a board game', () => {
    const ctx = gameContext({
      gameId: 401, week: 11, startTime: '2026-11-22T18:00:00Z',
      homeTeam: { shortName: 'WSH' }, awayTeam: { shortName: 'CIN' },
      market: { spreadHome: 6, total: 55 }, projection: { margin: -4, total: 51 },
      environment: { indoor: false, wind: 12 }, talent: { leansTo: 'CIN', netHome: -8.2, matchups: [] },
      situations: [{ key: 'offBye', team: 'CIN', weight: 0 }, { key: 'windUnder', team: null, weight: -0.24 }],
      quarterbacks: { home: { starter: 'A B', uncertain: false, changed: true }, away: null },
      units: { mismatches: [{ offenseTeam: 'CIN', defenseTeam: 'WAS', gap: -22 }] },
    }, { now: new Date('2026-11-22T17:50:00Z') });
    expect(ctx).toMatchObject({
      gameId: '401', week: 11, home: 'WSH', away: 'CIN', spreadHome: 6, total: 55,
      model: { margin: -4, total: 51 }, indoor: false, wind: 12,
      talent: { leansTo: 'CIN', netHome: -8.2 },
      spots: [{ key: 'offBye', team: 'CIN' }],
      unitEdge: { team: 'WSH', gap: 22 },                 // nflverse WAS becomes ESPN WSH
    });
    expect(ctx.qbs.home).toEqual({ name: 'A B', uncertain: false, changed: true });
    expect(gameContext(null)).toBeNull();
  });
});

describe('reviewSignals', () => {
  const context = {
    gameId: '401', week: 11, startTime: '2026-11-22T18:00:00Z', home: 'KC', away: 'ARI',
    model: { margin: 11.2, total: 43.2 }, indoor: false, wind: 15,
    talent: { leansTo: 'KC', netHome: 20 }, spots: [{ key: 'firstYearCoach', team: 'ARI' }], unitEdge: { team: 'KC', gap: 38 },
  };
  it('grades every input against the closing line', () => {
    const out = reviewSignals({ context, close, final: { home: 24, away: 10 } });
    const by = Object.fromEntries(out.map((s) => [s.signal, s]));
    // KC -15.5 won by 14: the favorite did not cover.
    expect(by.talent).toMatchObject({ team: 'KC', status: 'lost', by: -1.5 });
    // Ratings made it KC -11.2 against -15.5: a 4.3-point lean to ARI, which covered.
    expect(by.ratings_side).toMatchObject({ team: 'ARI', status: 'won', by: 1.5 });
    expect(by.ratings_side_3plus.status).toBe('won');
    expect(by.ratings_total).toMatchObject({ side: 'over', status: 'lost', by: -6.5 });
    expect(by.wind_under).toMatchObject({ status: 'won', by: 6.5 });
    expect(by.spot_firstYearCoach).toMatchObject({ team: 'ARI', status: 'won' });
    expect(by.unit_edge.status).toBe('lost');
    expect(out.every((s) => s.weekKey === weekKeyOf('2026-11-22T18:00:00Z'))).toBe(true);
  });
  it('skips inputs that had nothing to say, and games with no context', () => {
    const quiet = { ...context, model: { margin: 15.9, total: 40.9 }, wind: 6, talent: { leansTo: null }, spots: [], unitEdge: null };
    expect(reviewSignals({ context: quiet, close, final: { home: 24, away: 10 } })).toEqual([]);
    expect(reviewSignals({ context: null, close, final: { home: 24, away: 10 } })).toEqual([]);
  });
});

describe('weekKeyOf', () => {
  it('puts Thursday, Sunday and Monday night in the same week', () => {
    const thu = weekKeyOf('2026-11-20T01:15:00Z');   // Thursday night, Eastern
    const sun = weekKeyOf('2026-11-22T18:00:00Z');
    const mon = weekKeyOf('2026-11-24T01:15:00Z');   // Monday night, Eastern
    expect(thu).toBe(sun);
    expect(mon).toBe(sun);
    expect(weekKeyOf('2026-11-27T01:15:00Z')).not.toBe(sun);
    expect(weekKeyOf('nope')).toBeNull();
  });
});

describe('trendStatus: one game changes nothing', () => {
  it('logs and concludes nothing under 30 results, however lopsided', () => {
    expect(trendStatus({ results: 1, weeks: 1, z: 9 })).toBe('logging');
    expect(trendStatus({ results: 29, weeks: 9, z: 5 })).toBe('logging');
  });
  it('watches from 30 results when the gap is 1.5 standard errors', () => {
    expect(trendStatus({ results: 30, weeks: 2, z: 1.4 })).toBe('nothing');
    expect(trendStatus({ results: 30, weeks: 2, z: -1.6 })).toBe('watch');
  });
  it('raises a decision only at 60 results over four weeks and two standard errors', () => {
    expect(trendStatus({ results: 80, weeks: 3, z: 3 })).toBe('watch');      // too few weeks
    expect(trendStatus({ results: 59, weeks: 6, z: 3 })).toBe('watch');      // too few results
    expect(trendStatus({ results: 60, weeks: 4, z: 1.9 })).toBe('watch');    // not clear enough
    expect(trendStatus({ results: 60, weeks: 4, z: -2.1 })).toBe('decide');
    expect(TREND_RULES.watchResults).toBe(30);
  });
});

describe('buildLedger', () => {
  const mk = (i, status, over = {}) => ({
    pickId: `p${i}`, role: 'hero', market: 'total', status, units: status === 'won' ? 0.91 : status === 'lost' ? -1 : 0,
    weekKey: `w${i % 5}`, clv: { ev: 0.02 + (i % 3) * 0.005 }, closeness: 'clear', verdict: `good_number_${status}`,
    tags: { market: 'total', side: 'under', kind: 'price', tier: 'tier2', book: 'DraftKings', lead: 'under_24h' }, ...over,
  });

  it('says nothing is concluded from three results', () => {
    const ledger = buildLedger({ reviews: [mk(1, 'won'), mk(2, 'lost'), mk(3, 'won')], signals: [] });
    const all = ledger.recommended[0];
    expect(all).toMatchObject({ key: 'all', results: 3, status: 'logging', record: { won: 2, lost: 1, push: 0 } });
    expect(all.yardstick).toBe('closing_line');
    expect(ledger.counts.decide).toBe(0);
    expect(ledger.findings[0]).toMatch(/^Recommended picks: 2-1, \+0\.8 units, average closing-line value \+2\.5% on 3\./);
    expect(ledger.findings[1]).toBe('That is 3 results. Nothing is read into the record before 30.');
    expect(ledger.findings.at(-1)).toMatch(/The engine is unchanged\.$/);
  });

  it('raises a line for a decision once it has the results, the weeks and the gap', () => {
    const reviews = Array.from({ length: 64 }, (_, i) => mk(i, i % 2 ? 'won' : 'lost'));
    const ledger = buildLedger({ reviews, signals: [] });
    const all = ledger.recommended[0];
    expect(all.results).toBe(64);
    expect(all.weeks).toBe(5);
    expect(all.status).toBe('decide');                     // closing-line value is steadily positive
    expect(all.direction).toBe('working');
    expect(ledger.findings.some((f) => f.startsWith('Ready for a decision: All recommended picks'))).toBe(true);
  });

  it('grades inputs against a coin flip and names the next step', () => {
    const signals = [];
    for (let i = 0; i < 70; i++) signals.push({ signal: 'talent', gameId: `g${i}`, weekKey: `w${i % 6}`, status: i < 46 ? 'won' : 'lost' });
    for (let i = 0; i < 12; i++) signals.push({ signal: 'wind_under', gameId: `h${i}`, weekKey: `w${i % 6}`, status: 'won' });
    const ledger = buildLedger({ reviews: [], signals });
    const talent = ledger.signals.find((s) => s.key === 'talent');
    expect(talent).toMatchObject({ results: 70, weeks: 6, winPct: 65.7, status: 'decide', direction: 'working' });
    expect(talent.nextStep).toMatch(/shadow copy/);
    // Twelve straight winners is still twelve results.
    expect(ledger.signals.find((s) => s.key === 'wind_under').status).toBe('logging');
    expect(ledgerFindings(ledger).some((f) => /Roster talent lean.*ahead by 2\.6 standard errors over 70 results in 6 weeks/.test(f))).toBe(true);
  });

  it('counts luck and coin flips for recommended picks only', () => {
    const ledger = buildLedger({ reviews: [
      mk(1, 'lost', { play: { luck: 'unlucky' }, closeness: 'coin_flip' }),
      mk(2, 'won', { verdict: 'bad_number_won', play: { luck: 'fortunate' } }),
      mk(3, 'lost', { role: 'tracking', verdict: 'lost', play: { luck: 'unlucky' } }),
    ], signals: [] });
    expect(ledger.verdicts).toMatchObject({ good_number_lost: 1, bad_number_won: 1, unlucky: 1, fortunate: 1, coinFlips: 1 });
    expect(ledger.tracking[0].results).toBe(1);
  });
});

describe('summarizeReviews', () => {
  it('counts a slate', () => {
    const s = summarizeReviews([
      { role: 'hero', status: 'won', units: 0.95, closeness: 'clear', missed: [] },
      { role: 'hero', status: 'lost', units: -1, closeness: 'coin_flip', play: { luck: 'unlucky' }, missed: [{ key: 'qb_change' }] },
      { role: 'tracking', status: 'lost', units: -1 },
    ]);
    expect(s).toEqual({ reviewed: 3, recommended: { won: 1, lost: 1, push: 0, units: -0.1 }, coinFlips: 1, unlucky: 1, fortunate: 0, missed: ['qb_change'] });
  });
});

describe('the fit constants are the documented ones', () => {
  it('matches docs/nfl-picks-engine-v2.md', () => {
    expect(REVIEW_PARAMS).toMatchObject({ marginPerYard: 0.065, marginPerTurnover: 4.25, marginPerReturnTd: 5.4, totalBase: -19.8, totalPerYard: 0.0863, totalPerReturnTd: 6.5, fitGames: 1359 });
  });
});
