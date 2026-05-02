/**
 * GET /api/admin/picks/heal-aggregate-only?sport=nba&key=$ADMIN_API_KEY
 *
 * Finds slates where picks_daily_scorecards has graded data (won+lost+push>0)
 * but the picks ⨝ pick_results join shows zero graded rows. These are the
 * slates that render as "graded_aggregate_only" in the UI — they should be
 * rare, but they happen when settle wrote nothing into pick_results yet
 * the aggregate was computed from a different code path or a manual import.
 *
 * Modes:
 *   • Default (no `apply`)         — read-only. Returns every slate that
 *                                     needs healing plus its diagnostics.
 *   • `apply=1`                    — re-runs settle → build-scorecard for
 *                                     each broken slate (capped at 30/day).
 *   • `lookbackDays=N` (default 30) — how far back to scan.
 *
 * Auth: `x-admin-key` header OR `?key=` query param.
 */
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import nbaSettle from '../../cron/nba/settle-yesterday.js';
import nbaScorecard from '../../cron/nba/build-scorecard.js';
import mlbSettle from '../../cron/mlb/settle-yesterday.js';
import mlbScorecard from '../../cron/mlb/build-scorecard.js';

const PIPELINES = {
  nba: { settle: nbaSettle, scorecard: nbaScorecard },
  mlb: { settle: mlbSettle, scorecard: mlbScorecard },
};

function requireAdminKey(req) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return 'server missing ADMIN_API_KEY';
  const provided =
    req.headers?.['x-admin-key'] || req.headers?.['X-Admin-Key'] || req.query?.key || null;
  if (!provided || provided !== expected) return 'invalid admin key';
  return null;
}

function mockRes() {
  let payload = null; let statusCode = 200;
  return {
    res: {
      setHeader() {},
      status(code) { statusCode = code; return this; },
      json(obj) { payload = obj; return this; },
    },
    get() { return { statusCode, payload }; },
  };
}

async function run(handler, query) {
  const m = mockRes();
  await handler({ method: 'GET', query, headers: {} }, m.res);
  return m.get().payload;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const authErr = requireAdminKey(req);
  if (authErr) return res.status(401).json({ error: authErr });

  const sport = (req.query?.sport || 'nba').toString();
  const pipe = PIPELINES[sport];
  if (!pipe) return res.status(400).json({ error: `sport must be nba|mlb; got ${sport}` });

  const lookbackDays = Math.max(1, Math.min(180, parseInt(req.query?.lookbackDays, 10) || 30));
  const apply = req.query?.apply === '1';

  const sb = (() => {
    try { return getSupabaseAdmin?.() || null; } catch { return null; }
  })();
  if (!sb) return res.status(500).json({ error: 'supabase admin client unavailable' });

  // 1) Pull recent aggregate scorecard rows with any graded data.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffYmd = cutoff.toISOString().slice(0, 10);

  const { data: cards, error: cardsErr } = await sb
    .from('picks_daily_scorecards')
    .select('slate_date, record')
    .eq('sport', sport)
    .gte('slate_date', cutoffYmd)
    .order('slate_date', { ascending: false });
  if (cardsErr) return res.status(500).json({ error: 'scorecard read failed', detail: cardsErr.message });

  const broken = [];
  for (const card of (cards || [])) {
    const r = card?.record || {};
    const aggGraded = (r.won ?? 0) + (r.lost ?? 0) + (r.push ?? 0);
    if (aggGraded === 0) continue;

    // 2) Check row-level graded count for this slate.
    const { data: picks, error: pickErr } = await sb
      .from('picks')
      .select('id, pick_results(status)')
      .eq('sport', sport)
      .eq('slate_date', card.slate_date);
    if (pickErr) continue;

    let rowGraded = 0;
    let totalPicks = 0;
    let missingResults = 0;
    for (const p of picks || []) {
      totalPicks += 1;
      const s = Array.isArray(p.pick_results) ? p.pick_results[0]?.status : p.pick_results?.status;
      if (s === 'won' || s === 'lost' || s === 'push') rowGraded += 1;
      else if (!s) missingResults += 1;
    }

    if (rowGraded === 0) {
      broken.push({
        slateDate: card.slate_date,
        aggregateGraded: aggGraded,
        rowGradedFound: rowGraded,
        picksOnSlate: totalPicks,
        picksMissingResults: missingResults,
      });
    }
  }

  // 3) If apply=1, run settle + build-scorecard for each broken slate.
  let healed = [];
  if (apply && broken.length > 0) {
    const limit = Math.min(broken.length, 30);
    for (let i = 0; i < limit; i++) {
      const { slateDate } = broken[i];
      const stages = {};
      try { stages.settle = await run(pipe.settle, { date: slateDate, force: '1' }); }
      catch (e) { stages.settle = { ok: false, error: e?.message }; }
      try { stages.scorecard = await run(pipe.scorecard, { date: slateDate }); }
      catch (e) { stages.scorecard = { ok: false, error: e?.message }; }
      healed.push({ slateDate, stages });
    }
  }

  return res.status(200).json({
    ok: true,
    sport,
    lookbackDays,
    scannedAggregateSlates: cards?.length || 0,
    brokenCount: broken.length,
    broken,
    applied: apply,
    healed,
    note: apply
      ? `Re-ran settle + build-scorecard for ${healed.length} slate(s). Verify /api/nba/picks/scorecard?includePicks=1 returns dataMode=graded_with_rows.`
      : 'Read-only scan. Pass &apply=1 to re-run settle + build-scorecard for each broken slate.',
  });
}
