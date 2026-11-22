import { describe, it, expect } from 'vitest';
import { buildNflPicksV2, NFL_MODEL_VERSION, NFL_DEFAULT_CONFIG, convictionFromEv } from './buildNflPicksV2.js';
import { analyzeGame } from './v2/engine.js';
import { buildRatings } from './v2/ratings.js';
import { buildQbTable, indexQbWeeks } from './v2/qb.js';
import { buildUnitGrades } from './v2/units.js';
import { league, game, books, KC, LV, BUF, SF, CHI, DET } from './v2/fixtures.js';
import { recommendedPicks, summarizePick, pickWhy } from './pickSummary.js';
import { applyLocks } from './v2/locks.js';

const NOW = new Date('2026-11-22T12:00:00Z');
const asOf = { season: 2026, week: 9 };
const data = league({ strengths: { KC: 6, BUF: 4, SF: 2, DET: 0, CHI: -2, LV: -4, NYJ: -6, MIA: 0 }, weeks: 8 });
const model = {
  ok: true, version: 'v2', asOf,
  ratings: buildRatings({ ...data, asOf }),
  qbTable: buildQbTable({ qbWeeks: data.qbWeeks, asOf }),
  qbIndex: indexQbWeeks(data.qbWeeks),
  unitGrades: buildUnitGrades({ teamWeeks: data.teamWeeks, asOf }),
  schedule: {}, nextDivisional: {}, coachGames: {},
};
const starters = (g) => ({
  [g.gameId]: {
    homeQbId: `qb-${g.teams.home.abbrev}`, homeQbName: `${g.teams.home.abbrev} Starter`,
    awayQbId: `qb-${g.teams.away.abbrev}`, awayQbName: `${g.teams.away.abbrev} Starter`,
    roof: 'outdoors', homeRest: 7, awayRest: 7,
  },
});
function withEngine(g, { weather = null, config, m = model } = {}) {
  const withSchedule = m.ok ? { ...m, schedule: starters(g) } : m;
  return { ...g, engine: analyzeGame({ game: g, model: withSchedule, weather, config }) };
}
const build = (games, opts = {}) => buildNflPicksV2({ games, now: NOW, ...opts });

// One book hanging LV +3.5 when everyone else has +3.
const hook = () => withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { spread: -3.5 } }) } }));
const flat = (id = 'g2', away = SF, home = BUF) => withEngine(game(id, away, home));

describe('buildNflPicksV2', () => {
  it('returns the canonical contract the shared picks UI and persistence expect', () => {
    const out = build([hook(), flat()]);
    expect(out).toMatchObject({ sport: 'nfl', week: 12, slateLabel: 'Week 12', modelVersion: NFL_MODEL_VERSION, configVersion: NFL_DEFAULT_CONFIG.version });
    for (const k of ['topPick', 'tiers', 'coverage', 'fullSlatePicks', 'heroPicks', 'trackingPicks', 'byGame', 'meta', 'categories', 'legacy']) {
      expect(out).toHaveProperty(k);
    }
    expect(out.byGame).toHaveLength(2);
    expect(out.fullSlatePicks).toHaveLength(6);      // three markets on each game
    expect(NFL_MODEL_VERSION).toBe('nfl-picks-v2.2.0');
  });

  it('recommends the off-market number, at that book and price, and nothing else', () => {
    const out = build([hook(), flat()]);
    expect(out.heroPicks).toHaveLength(1);
    const p = out.heroPicks[0];
    expect(p).toMatchObject({
      id: 'g1-runline-away', gameId: 'g1', pickRole: 'hero',
      market: { type: 'runline', line: 3.5, priceAmerican: -110 },
      selection: { side: 'away', team: 'LV', label: 'LV +3.5' },
      book: { key: 'betmgm' },
      lowSignalReason: null, modelSource: 'nfl_v2_price',
    });
    expect(p.ev).toBeGreaterThan(NFL_DEFAULT_CONFIG.evThresholds.tier3);
    expect(['tier1', 'tier2', 'tier3']).toContain(p.tier);
    expect(p.rationale.headline).toContain('betmgm');
    expect(p.displayMetrics).toMatchObject({ edgeLabel: 'Expected value', signalQualityLabel: 'Price' });
    expect(out.topPick.id).toBe(p.id);
    expect(out.categories.ats).toHaveLength(1);
  });

  it('prices at the real number: the same hook at -125 is not a pick', () => {
    const g = withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { spread: -3.5, spreadPrices: [105, -125] } }) } }));
    const out = build([g]);
    expect(out.heroPicks).toHaveLength(0);
    expect(out.meta.flags).toContain('no_qualified_edges');
  });

  it('publishes nothing when every book agrees, and tracks the model lean on each market instead', () => {
    const out = build([flat()]);
    expect(out.heroPicks).toHaveLength(0);
    expect(out.trackingPicks).toHaveLength(3);
    for (const p of out.trackingPicks) {
      expect(p).toMatchObject({ tier: 'tracking', pickRole: 'tracking', isLowConviction: true, lowSignalReason: 'no_price_edge' });
      expect(p.modelSource).toBe(p.market.type === 'moneyline' ? 'nfl_v2_ml_value' : 'nfl_v2_lean');
      expect(p.conviction.score).toBeLessThan(50);
      expect(p.ev).toBeLessThan(0);                  // the consensus price always costs the vig
      expect(p.rationale.bullets[0]).toContain('Tracked, not recommended');
    }
  });

  it('judges the moneyline on value, and says so when no price has any', () => {
    const ml = build([flat()]).byGame[0].picks.moneyline;
    expect(ml).toMatchObject({ pickRole: 'tracking', tier: 'tracking', lowSignalReason: 'no_price_edge', modelSource: 'nfl_v2_ml_value' });
    expect(ml.ev).toBeLessThan(0);
    expect(ml.conviction.score).toBe(25);
    expect(ml.rationale.headline).toMatch(/^No moneyline value: /);
    expect(ml.whyShort).toMatch(/^No value: best price \w+ [+-]\d+ at \w+, fair [+-]\d+ \(-\d+\.\d%\)$/);
    expect(ml.why).toMatch(/^Not a bet: no moneyline value\./);
  });

  it('tracks the side with the best price against fair, whichever side the spread lean is on', () => {
    // The fair road price here is +151. BetMGM pays +153: better than fair, under the bar.
    const g = withEngine(game('g8', LV, KC, { market: { books: books({ betmgm: { ml: [-160, 153] } }) } }));
    const { moneyline } = build([g]).byGame[0].picks;
    expect(moneyline.selection).toMatchObject({ side: 'away', team: 'LV', label: 'LV +153' });
    expect(moneyline).toMatchObject({ pickRole: 'tracking', lowSignalReason: 'thin_value', modelSource: 'nfl_v2_ml_value', book: { key: 'betmgm' } });
    expect(moneyline.ev).toBeGreaterThanOrEqual(NFL_DEFAULT_CONFIG.evThresholds.thin);
    expect(moneyline.ev).toBeLessThan(NFL_DEFAULT_CONFIG.evThresholds.tier3);
    expect(moneyline.conviction.score).toBeGreaterThan(25);
    expect(moneyline.conviction.score).toBeLessThan(50);
    expect(moneyline.whyShort).toMatch(/^Thin value\. \w+ pays \+153 on LV; the fair price is \+151, \+\d\.\d%$/);
    expect(moneyline.why).toContain('under the 1.5% we need to recommend a bet');
  });

  it('does not call a rounding-sized edge value', () => {
    // +148 is short of the fair +151; +151 matches it and is worth a tenth of a percent.
    const at = (price) => build([withEngine(game('g9', LV, KC, { market: { books: books({ betmgm: { ml: [-160, price] } }) } }))]).byGame[0].picks.moneyline;
    for (const p of [at(148), at(151)]) {
      expect(p.ev).toBeLessThan(NFL_DEFAULT_CONFIG.evThresholds.thin);
      expect(p.lowSignalReason).toBe('no_price_edge');
    }
  });

  it('scores a moneyline by its value, and never as high as a recommended pick', () => {
    const at = (price) => build([withEngine(game('g10', LV, KC, { market: { books: books({ betmgm: { ml: [-160, price] } }) } }))]).byGame[0].picks.moneyline;
    const thin = at(152);
    const thicker = at(154);
    expect(thicker.ev).toBeGreaterThan(thin.ev);
    expect(thicker.conviction.score).toBeGreaterThan(thin.conviction.score);
    expect(thicker.conviction.score).toBeLessThan(50);
  });

  it('leans the way the ratings point: the stronger road team when the market has it too short', () => {
    const g = withEngine(game('g3', KC, LV, { market: { books: books({}, { spread: 1, ml: [100, -120] }) } }));
    const lean = build([g]).byGame[0].picks.runline;
    expect(lean.selection).toMatchObject({ side: 'away', team: 'KC', label: 'KC -1' });
    expect(lean.edgePoints).toBeLessThan(0);          // model likes the road side more than the market
  });

  it('assigns tiers from fixed expected-value thresholds, not from the rest of the slate', () => {
    const alone = build([hook()]).heroPicks[0];
    const crowded = build([hook(), flat('g2'), flat('g4', CHI, DET), flat('g5', SF, DET)]).heroPicks[0];
    expect(crowded.tier).toBe(alone.tier);
    expect(crowded.conviction.score).toBe(alone.conviction.score);
    expect(convictionFromEv(0.015)).toBeCloseTo(0.62, 2);
    expect(convictionFromEv(0.04)).toBeCloseTo(0.82, 2);
    expect(convictionFromEv(0.2)).toBe(0.89);            // never "Elite" on expected value alone
  });

  it('recommends one side bet per game: the moneyline and spread are the same opinion', () => {
    const g = withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { spread: -3.5 }, fanatics: { ml: [-160, 165] } }) } }));
    const out = build([g]);
    const sides = out.heroPicks.filter((p) => p.market.type !== 'total');
    expect(sides).toHaveLength(1);
    const other = out.byGame[0].picks[sides[0].market.type === 'runline' ? 'moneyline' : 'runline'];
    expect(other).toMatchObject({ pickRole: 'tracking', lowSignalReason: 'same_side' });
  });

  it('holds the game to tracking when a quarterback is in doubt', () => {
    const base = game('g1', LV, KC, {
      market: { books: books({ betmgm: { spread: -3.5 } }) },
      injuries: { ok: true, away: { quarterbackStatuses: [{ name: 'LV Starter', status: 'questionable' }] }, home: { quarterbackStatuses: [] } },
    });
    const out = build([withEngine(base)]);
    expect(out.heroPicks).toHaveLength(0);
    const p = out.byGame[0].picks.runline;
    expect(p).toMatchObject({ pickRole: 'tracking', lowSignalReason: 'qb_uncertain' });
    expect(p.flags.qbInjury).toBe(true);
    expect(p.rationale.bullets.join(' ')).toContain('LV Starter is listed questionable');
  });

  it('fails closed when the injury report is missing', () => {
    const out = build([withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { spread: -3.5 } }) }, injuries: undefined }))]);
    expect(out.heroPicks).toHaveLength(0);
    expect(out.byGame[0].picks.runline.lowSignalReason).toBe('injury_feed_down');
    expect(out.meta.flags).toContain('injury_feed_down');
  });

  it('holds a price that is stale or too good to be true', () => {
    const stale = withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { spread: -3.5, lastUpdate: '2026-11-22T08:00:00Z' } }) } }));
    expect(build([stale]).byGame[0].picks.runline).toMatchObject({ pickRole: 'tracking', lowSignalReason: 'stale_price' });
    const gift = withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { ml: [-160, 240] } }) } }));
    expect(build([gift]).byGame[0].picks.moneyline).toMatchObject({ pickRole: 'tracking', lowSignalReason: 'price_outlier' });
  });

  it('does not recommend a game more than three days out', () => {
    const early = withEngine(game('g1', LV, KC, { hoursOut: 100, now: NOW.getTime(), market: { books: books({ betmgm: { spread: -3.5 } }) } }));
    const out = build([early]);
    expect(out.heroPicks).toHaveLength(0);
    expect(out.byGame[0].picks.runline.lowSignalReason).toBe('outside_window');
  });

  it('tracks but does not promote moneylines outside the price band', () => {
    const g = withEngine(game('g6', LV, KC, { market: { books: books({ fanatics: { ml: [-900, 650] } }, { spread: -14, ml: [-900, 600] }) } }));
    const ml = build([g]).byGame[0].picks.moneyline;
    expect(ml.pickRole).toBe('tracking');
    expect(ml.flags.priceGuard).toBe(true);
  });

  it('recommends an under in strong wind and says why', () => {
    const g = withEngine(game('g1', LV, KC), { weather: { tempF: 34, windMph: 21, hoursOut: 20, source: 'nws' } });
    const out = build([g]);
    const total = out.heroPicks.find((p) => p.market.type === 'total');
    expect(total).toMatchObject({ selection: { side: 'under' }, modelSource: 'nfl_v2_wind' });
    expect(total.rationale.headline).toContain('21 mph wind');
    expect(total.rationale.bullets.join(' ')).toContain('312-235');
    expect(total.betScore.components.situationalEdge).toBe(1);
    // A pick that needs the wind estimate can be recommended, never a top play.
    const offMarket = withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { total: 45.5 } }) } }), { weather: { tempF: 34, windMph: 21, hoursOut: 20, source: 'nws' } });
    const capped = build([offMarket]).heroPicks.find((p) => p.market.type === 'total');
    expect(capped.ev).toBeGreaterThan(0.04);
    expect(capped.tier).toBe('tier2');
    expect(capped.conviction.score).toBeLessThanOrEqual(79);
  });

  it('still prices the market when model data is missing, and says so', () => {
    const g = withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { spread: -3.5 } }) } }), { m: { ok: false, reasons: ['nflverse unavailable'] } });
    const out = build([g]);
    expect(out.meta.flags).toContain('model_data_gap');
    expect(out.byGame[0].projection).toBeNull();
    expect(out.fullSlatePicks.length).toBeGreaterThan(0);
    // Without the schedule file there is no named starter to check against the
    // injury report, so the quarterback guard cannot clear the game.
    expect(out.heroPicks).toHaveLength(0);
    expect(out.byGame[0].picks.runline.lowSignalReason).toBe('qb_uncertain');
  });

  it('shapes each pick for the picks table: id, market, side, line, price, slugs and a positive score', () => {
    const out = build([hook(), flat()]);
    for (const p of out.fullSlatePicks) {
      expect(p.id).toBe(`${p.gameId}-${p.market.type}-${p.selection.side}`);
      expect(['moneyline', 'runline', 'total']).toContain(p.market.type);
      expect(['home', 'away', 'over', 'under']).toContain(p.selection.side);
      if (p.market.type !== 'moneyline') expect(typeof p.market.line).toBe('number');
      expect(typeof p.market.priceAmerican).toBe('number');
      expect(p.matchup.awayTeam.slug).toBeTruthy();
      expect(p.matchup.homeTeam.slug).toBeTruthy();
      expect(p.betScore.total).toBeGreaterThan(0);
      expect(p.betScore.total).toBeLessThanOrEqual(1);
      expect(p.rationale.pickRole).toBe(p.pickRole);
    }
    const heroIds = new Set(out.heroPicks.map((p) => p.id));
    const trackIds = new Set(out.trackingPicks.map((p) => p.id));
    expect(out.fullSlatePicks.length).toBe(heroIds.size + trackIds.size);
    for (const id of heroIds) expect(trackIds.has(id)).toBe(false);
  });

  it('skips live, final and postponed games and games with no engine block', () => {
    const live = { ...hook(), gameId: 'live', status: 'live', gameState: { isLive: true } };
    const done = { ...hook(), gameId: 'done', status: 'final', gameState: { isFinal: true } };
    const off = { ...hook(), gameId: 'ppd', status: 'postponed' };
    const bare = game('bare', LV, KC);
    const out = build([live, done, off, bare]);
    expect(out.fullSlatePicks).toEqual([]);
    expect(out.meta.skippedGames).toBe(1);
  });

  it('returns an empty, well-formed board with no games', () => {
    const out = build([]);
    expect(out.fullSlatePicks).toEqual([]);
    expect(out.tiers).toEqual({ tier1: [], tier2: [], tier3: [] });
    expect(out.topPick).toBeNull();
    expect(out.meta.flags).toEqual([]);
  });

  it('skips a market no book has posted instead of inventing a line', () => {
    const g = withEngine(game('g5', LV, KC, { market: { books: books({}, { total: null }) } }));
    const picks = build([g]).byGame[0].picks;
    expect(picks.total).toBeNull();
    expect(picks.runline).not.toBeNull();
  });
});

describe('the reason on every pick', () => {
  const wx = { weather: { tempF: 34, windMph: 21, hoursOut: 20, source: 'google' } };

  it('gives every pick on the board a sentence and a short form', () => {
    const out = build([hook(), flat(), withEngine(game('g3', CHI, DET), wx)]);
    expect(out.fullSlatePicks.length).toBeGreaterThan(6);
    for (const p of out.fullSlatePicks) {
      expect(p.why, p.id).toMatch(/\w{3,}.*[.!?]$/);
      expect(p.whyShort.length, p.id).toBeGreaterThan(10);
      expect(p.whyShort.length, p.id).toBeLessThan(p.why.length);
      expect(p.rationale.why).toBe(p.why);         // stored with the pick, so it survives a lock
    }
  });

  it('explains a price pick by its book, its number and the market', () => {
    const p = build([hook(), flat()]).heroPicks[0];
    expect(p.why).toContain('LV +3.5');
    expect(p.why).toMatch(/while the market across \d+ books is \+3/);
    expect(p.why).toContain('expected value');
    expect(p.why).not.toMatch(/^Held|^Tracked|^Lean/);
  });

  it('explains a wind under by the wind, where it is, and the record behind it', () => {
    const p = build([withEngine(game('g1', LV, KC), wx)]).heroPicks.find((x) => x.market.type === 'total');
    expect(p.why).toContain('21 mph wind');
    expect(p.why).toContain('57%');
    expect(p.whyShort).toContain('21 mph wind');
    expect(p.environment).toMatchObject({ indoor: false });
    expect(p.environment.label).toMatch(/^Outdoors.*21 mph wind, 34°F/);
  });

  it('scales the wind with its speed: a pick at 21 mph, none at 13 with the same prices', () => {
    const at = (mph) => build([withEngine(game('g1', LV, KC), { weather: { tempF: 34, windMph: mph, hoursOut: 20, source: 'google' } })]);
    const strong = at(21).heroPicks.find((x) => x.market.type === 'total');
    expect(strong.why).toContain('takes 1.2 points off our fair total');
    expect(at(13).heroPicks.filter((x) => x.market.type === 'total')).toHaveLength(0);
    // The fair total moves a little at 13 mph, and shows in the lean.
    const fair = (mph) => at(mph).byGame[0].fair.total;
    expect(fair(13) - fair(9)).toBeCloseTo(-0.36, 2);
    expect(fair(21) - fair(9)).toBeCloseTo(-1.2, 2);
  });

  it('calls an under a price pick when it clears the bar without the wind', () => {
    // One book hangs a total a point and a half above the market: a pick in any weather.
    const g = (mph, total = 46) => withEngine(game('g1', LV, KC, { market: { books: books({ betmgm: { total } }) } }), { weather: { tempF: 50, windMph: mph, hoursOut: 20, source: 'google' } });
    const breezy = build([g(12)]).heroPicks.find((x) => x.market.type === 'total');
    expect(breezy).toMatchObject({ selection: { side: 'under' }, modelSource: 'nfl_v2_price' });
    expect(breezy.why).toMatch(/has Under 46 while the market/);
    expect(breezy.rationale.bullets.join(' ')).toContain('Sustained wind of 12 mph');   // the wind is still shown as context
    const calm = build([g(5)]).heroPicks.find((x) => x.market.type === 'total');
    expect(breezy.ev).toBeGreaterThan(calm.ev);                                         // and still counted in the price
    // A smaller gap that only clears the bar with the wind's help is a wind pick, capped below a top play.
    expect(build([g(5, 45.5)]).heroPicks.filter((x) => x.market.type === 'total')).toHaveLength(0);
    const helped = build([g(12, 45.5)]).heroPicks.find((x) => x.market.type === 'total');
    expect(helped).toMatchObject({ modelSource: 'nfl_v2_wind' });
    expect(helped.why).toContain('takes 0.2 points off our fair total');
    expect(helped.why).toContain('54% of games in wind of 10 to 15 mph');
    expect(helped.conviction.score).toBeLessThanOrEqual(79);
  });

  it('says a lean is a lean, and why a held pick is held', () => {
    const lean = build([flat()]).byGame[0].picks.runline;
    expect(lean.why).toMatch(/^Lean only, not a recommended bet: the ratings make it BUF/);
    const held = build([withEngine(game('g1', LV, KC, {
      market: { books: books({ betmgm: { spread: -3.5 } }) },
      injuries: { ok: true, away: { quarterbackStatuses: [{ name: 'LV Starter', status: 'questionable' }] }, home: { quarterbackStatuses: [] } },
    }))]).byGame[0].picks.runline;
    expect(held.why).toMatch(/^Held back: a starting quarterback is in doubt/);
    expect(held.whyShort).toMatch(/^Held, quarterback in doubt/);
  });

  it('notes where a neutral-site game is played and whether it is under a roof', () => {
    const mexico = { ...game('g1', LV, KC), venue: { name: 'Estadio Banorte', indoor: null, neutralSite: true } };
    const outdoors = withEngine(mexico, { weather: { tempF: 61, windMph: 7, hoursOut: 20, source: 'google' } });
    expect(outdoors.engine.env).toMatchObject({ indoor: false, venue: 'Estadio Banorte', city: 'Mexico City', neutral: true, wind: 7 });
    expect(outdoors.engine.env.label).toBe('Outdoors at Estadio Banorte, Mexico City: 7 mph wind, 61°F');
    expect(build([outdoors]).byGame[0].picks.total.rationale.bullets.join(' ')).toContain('Conditions: Outdoors at Estadio Banorte');

    const dome = withEngine({ ...game('g2', SF, BUF), venue: { name: 'Caesars Superdome', indoor: null, neutralSite: true } }, wx);
    expect(dome.engine.env).toMatchObject({ indoor: true, wind: null });
    expect(dome.engine.env.label).toBe('Indoors at Caesars Superdome');
    expect(build([dome]).heroPicks.filter((p) => p.modelSource === 'nfl_v2_wind')).toHaveLength(0);

    const unknown = withEngine({ ...game('g3', CHI, DET), venue: { name: 'Nowhere Field', indoor: null, neutralSite: true } }, wx);
    expect(unknown.engine.env).toMatchObject({ located: false, city: null });
  });

  it('states a pick the same way in emails and the briefing, reason included', () => {
    const out = build([hook(), flat()]);
    const [top] = recommendedPicks(out);
    expect(summarizePick(top)).toMatchObject({ matchup: 'LV at KC', pick: 'LV +3.5', price: '-110' });
    expect(summarizePick(top).why).toBe(top.why);
    // A pick locked before the reason existed still gets its headline.
    expect(pickWhy({ rationale: { headline: 'Old headline' } })).toBe('Old headline.');
  });

  it('keeps the reason on a locked pick and on one demoted behind it', () => {
    const out = build([hook()]);
    const p = out.heroPicks[0];
    const row = { game_id: p.gameId, market_type: p.market.type, selection_side: p.selection.side, line_value: p.market.line,
      price_american: p.market.priceAmerican, tier: p.tier, book: 'BetMGM', locked_at: '2026-11-21T15:00:00Z', expected_value: p.ev,
      payload: { ...p, why: undefined, whyShort: undefined } };
    const locked = applyLocks(out, [row]).heroPicks[0];
    expect(locked.why).toBe(p.why);                // from the stored rationale

    // Locked before the field existed: rebuilt from the stored ticket, in the past tense.
    const old = { ...row, payload: { ...p, why: undefined, whyShort: undefined, rationale: { headline: p.rationale.headline, bullets: [], pickRole: 'hero' } } };
    const legacy = applyLocks(out, [old]).heroPicks[0];
    expect(legacy.why).toMatch(/^BetMGM was paying -110 on LV \+3\.5 when this pick was locked; the market’s fair price was -\d+\. That gap was \+\d\.\d% expected value\.$/);
    const windOld = { ...old, market_type: 'total', selection_side: 'under', line_value: 40.5, price_american: -105, book: 'DraftKings', expected_value: 0.047,
      payload: { ...old.payload, modelSource: 'nfl_v2_wind', market: { type: 'total', line: 40.5, priceAmerican: -105 }, selection: { side: 'under', label: 'Under 40.5' },
        rationale: { headline: 'Under 40.5: 15 mph wind and -105 at DraftKings', bullets: [], pickRole: 'hero' } } };
    const windLegacy = applyLocks(out, [windOld]).heroPicks[0];
    expect(windLegacy.why).toBe('15 mph wind was forecast when this pick was locked, and unders have won 57% of the time in wind that strong since 2003. DraftKings’s -105 on Under 40.5 was +4.7% expected value.');
  });
});
