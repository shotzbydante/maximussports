/**
 * GET /api/nfl/picks/scorecard?days=9
 *
 * NFL scorecard. Football is graded by the week, so instead of a single
 * "yesterday" slate this returns every persisted pick in a trailing window
 * (default nine days: last week's full slate plus the week in progress),
 * grouped by kickoff date, plus the season-to-date record.
 *
 * Picks whose game is final but which the nightly settlement cron has not
 * reached yet are graded here at read time, using the same settlePick()
 * the cron uses. That result is for display only and is never written.
 *
 * Response:
 *   {
 *     sport: 'nfl',
 *     window: { from, to, days },
 *     record, byMarket, byPickRole,          // window totals
 *     performance: { hero, tracking },       // record, units, ROI, closing-line value
 *     slates: [{ date, record, picks: [...] }],
 *     season: { record, byMarket, byPickRole, performance, slates } | null,
 *     generatedAt
 *   }
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { getNflPicks } from '../../_lib/nflPicksStore.js';
import { todayET } from '../../_lib/dateWindows.js';
import { getNflSlate } from '../../_lib/nflSlate.js';
import { settlePick } from '../../../src/features/mlb/picks/v2/settle.js';
import { getNflTeamBySlug } from '../../../src/sports/nfl/teams.js';
import { unitsFor } from '../../../src/features/nfl/picks/v2/distribution.js';
import { summarizePerformance, addPerformance, presentPerformance } from '../../../src/features/nfl/picks/v2/performance.js';

const ZERO = () => ({ won: 0, lost: 0, push: 0, pending: 0 });

function shiftYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function tally(acc, status) {
  if (status === 'won' || status === 'lost' || status === 'push') acc[status] += 1;
  else if (status !== 'void') acc.pending += 1;
}

function fmtLine(v) {
  if (v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n > 0 ? `+${n}` : n === 0 ? 'PK' : `${n}`;
}

function pickLabel(p) {
  const team = getNflTeamBySlug(p.selection_side === 'home' ? p.home_team_slug : p.away_team_slug);
  if (p.market_type === 'total') return `${p.selection_side === 'over' ? 'Over' : 'Under'} ${p.line_value}`;
  if (p.market_type === 'runline') return `${team?.abbrev || ''} ${fmtLine(p.line_value)}`.trim();
  const price = p.price_american != null ? ` ${p.price_american > 0 ? '+' : ''}${p.price_american}` : '';
  return `${team?.abbrev || ''}${price}`.trim();
}

function sumScorecards(rows) {
  const record = ZERO();
  const byMarket = { moneyline: ZERO(), runline: ZERO(), total: ZERO() };
  const byPickRole = { hero: ZERO(), tracking: ZERO() };
  const add = (acc, src) => {
    if (!src) return;
    for (const k of ['won', 'lost', 'push']) acc[k] += Number(src[k] || 0);
  };
  for (const row of rows) {
    add(record, row.record);
    for (const k of Object.keys(byMarket)) add(byMarket[k], row.by_market?.[k]);
    for (const k of Object.keys(byPickRole)) add(byPickRole[k], row.by_pick_role?.[k]);
  }
  return { record, byMarket, byPickRole };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, must-revalidate');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const days = Math.max(2, Math.min(21, parseInt(req.query?.days, 10) || 9));
  const to = todayET();
  const from = shiftYmd(to, -(days - 1));
  const base = {
    sport: 'nfl',
    window: { from, to, days },
    record: ZERO(),
    byMarket: { moneyline: ZERO(), runline: ZERO(), total: ZERO() },
    byPickRole: { hero: ZERO(), tracking: ZERO() },
    performance: { hero: presentPerformance(summarizePerformance([]).hero), tracking: presentPerformance(summarizePerformance([]).tracking) },
    slates: [],
    season: null,
    generatedAt: new Date().toISOString(),
  };

  let admin;
  try { admin = getSupabaseAdmin(); }
  catch (e) { return res.status(200).json({ ...base, _error: 'supabase_unavailable', _detail: e?.message }); }

  try {
    const [stored, { data: cards }, slate] = await Promise.all([
      getNflPicks({ from, to }),
      // `select('*')` on purpose: naming a column the table does not have
      // fails the whole read, which is how the season block went missing.
      admin.from('picks_daily_scorecards')
        .select('*')
        .eq('sport', 'nfl')
        .order('slate_date', { ascending: false })
        .limit(200),
      getNflSlate().catch(() => null),
    ]);
    if (!stored.ok) return res.status(200).json({ ...base, _error: 'query_failed', _detail: stored.error });

    const finalsById = new Map();
    for (const g of slate?.games || []) {
      if (g.gameState?.isFinal || g.status === 'final') finalsById.set(String(g.gameId), g);
    }

    const bySlate = new Map();
    const graded = [];
    for (const p of stored.picks) {
      const settled = Array.isArray(p.pick_results) ? p.pick_results[0] : p.pick_results;
      let status = settled?.status || 'pending';
      let awayScore = settled?.final_away_score ?? null;
      let homeScore = settled?.final_home_score ?? null;
      let provisional = false;

      if (status === 'pending' && finalsById.has(String(p.game_id))) {
        const live = settlePick(p, finalsById.get(String(p.game_id)));
        if (live.status !== 'pending') {
          status = live.status;
          awayScore = live.final_away_score;
          homeScore = live.final_home_score;
          provisional = true;
        }
      }

      const pickRole = p.rationale?.pickRole || (p.tier === 'tracking' ? 'tracking' : 'hero');
      const price = p.price_american == null ? null : Number(p.price_american);
      const units = settled?.units != null ? Number(settled.units) : unitsFor(status, price);
      graded.push({ ...p, pick_results: { status, units } });
      const away = getNflTeamBySlug(p.away_team_slug);
      const home = getNflTeamBySlug(p.home_team_slug);

      tally(base.record, status);
      if (base.byMarket[p.market_type]) tally(base.byMarket[p.market_type], status);
      if (base.byPickRole[pickRole]) tally(base.byPickRole[pickRole], status);

      if (!bySlate.has(p.slate_date)) bySlate.set(p.slate_date, { date: p.slate_date, record: ZERO(), picks: [] });
      const group = bySlate.get(p.slate_date);
      tally(group.record, status);
      group.picks.push({
        id: p.id,
        gameId: p.game_id,
        slateDate: p.slate_date,
        startTime: p.start_time,
        awayTeam: p.away_team_slug,
        homeTeam: p.home_team_slug,
        awayAbbrev: away?.abbrev || null,
        homeAbbrev: home?.abbrev || null,
        market: p.market_type,
        why: p.rationale?.whyShort || p.rationale?.why || p.rationale?.headline || null,
        side: p.selection_side,
        line: p.line_value,
        price: p.price_american,
        book: p.book || null,
        lockedAt: p.locked_at || null,
        units: status === 'pending' ? null : units,
        expectedValue: p.expected_value == null ? null : Number(p.expected_value),
        closingLine: p.closing_line == null ? null : Number(p.closing_line),
        clvPoints: p.clv_points == null ? null : Number(p.clv_points),
        clvEv: p.clv_ev == null ? null : Number(p.clv_ev),
        label: pickLabel(p),
        tier: p.tier,
        pickRole,
        conviction: Math.round(Number(p.bet_score || 0) * 100),
        status,
        provisional,
        finalScore: awayScore != null && homeScore != null
          ? `${away?.abbrev || 'Away'} ${awayScore}, ${home?.abbrev || 'Home'} ${homeScore}`
          : null,
      });
    }

    const slates = [...bySlate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const s of slates) {
      s.picks.sort((a, b) =>
        (a.pickRole === b.pickRole ? 0 : a.pickRole === 'hero' ? -1 : 1)
        || (b.conviction - a.conviction));
    }

    const windowPerf = summarizePerformance(graded);
    const performance = { hero: presentPerformance(windowPerf.hero), tracking: presentPerformance(windowPerf.tracking) };

    let season = null;
    if ((cards || []).length > 0) {
      const seasonPerf = addPerformance(cards.map((c) => c.performance).filter(Boolean));
      const hasPerf = cards.some((c) => c.performance);
      season = {
        ...sumScorecards(cards),
        performance: hasPerf ? { hero: presentPerformance(seasonPerf.hero), tracking: presentPerformance(seasonPerf.tracking) } : null,
        slates: cards.length,
        lastGradedDate: cards[0]?.slate_date || null,
      };
    }

    return res.status(200).json({ ...base, performance, slates, season, week: slate?.week ?? null });
  } catch (e) {
    return res.status(200).json({ ...base, _error: 'exception', _detail: e?.message });
  }
}
