/**
 * GET/POST /api/admin/picks/backfill
 *
 * Reruns settle → build-scorecard → run-audit for one or more ET slate dates.
 * Used to repair historical days after a pipeline fix.
 *
 * Usage (single day):
 *   GET /api/admin/picks/backfill?sport=mlb&date=2026-04-21&key=$ADMIN_API_KEY
 *
 * Usage (inclusive range):
 *   GET /api/admin/picks/backfill?sport=mlb&from=2026-04-18&to=2026-04-21&key=$ADMIN_API_KEY
 *
 * Usage (comma-separated list):
 *   GET /api/admin/picks/backfill?sport=mlb&dates=2026-04-18,2026-04-19&key=$ADMIN_API_KEY
 *
 * Auth: `x-admin-key` header OR `?key=` query param.
 *
 * Response includes each stage's output per date so the operator can see
 * exactly how many picks were graded and what the scorecard record became.
 * Also invalidates the mlb:picks:built KV snapshot so the next request to
 * `/api/mlb/picks/built` re-embeds `scorecardSummary` with fresh data.
 */

import settleHandler from '../../cron/mlb/settle-yesterday.js';
import scorecardHandler from '../../cron/mlb/build-scorecard.js';
import auditHandler from '../../cron/mlb/run-audit.js';
import { setJson } from '../../_globalCache.js';

function requireAdminKey(req) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return 'server missing ADMIN_API_KEY';
  const provided =
    req.headers?.['x-admin-key']
    || req.headers?.['X-Admin-Key']
    || req.query?.key
    || null;
  if (!provided || provided !== expected) return 'invalid admin key';
  return null;
}

function mockRes() {
  let payload = null; let statusCode = 200;
  const headers = {};
  return {
    res: {
      setHeader(k, v) { headers[k] = v; },
      status(code) { statusCode = code; return this; },
      json(obj) { payload = obj; return this; },
    },
    get() { return { statusCode, payload, headers }; },
  };
}

async function invokeHandler(handler, query) {
  const mock = mockRes();
  await handler({ method: 'GET', query, headers: {} }, mock.res);
  return mock.get().payload;
}

function validYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** Inclusive daily range from `from` to `to` (ISO YYYY-MM-DD). Capped at 60 days. */
export function rangeDates(from, to) {
  const out = [];
  if (!validYmd(from) || !validYmd(to)) return out;
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  const d = new Date(start);
  while (d <= end) {
    if (out.length >= 60) break; // hard safety cap
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function resolveDates(q = {}) {
  if (q.dates) {
    return String(q.dates).split(',').map(s => s.trim()).filter(validYmd);
  }
  if (q.from && q.to) return rangeDates(q.from, q.to);
  if (q.date && validYmd(q.date)) return [q.date];
  return [];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const authErr = requireAdminKey(req);
  if (authErr) return res.status(401).json({ error: authErr });

  const sport = (req.query?.sport || 'mlb').toString();
  if (sport !== 'mlb') {
    return res.status(400).json({ error: `backfill currently supports sport=mlb only; got ${sport}` });
  }

  const dates = resolveDates(req.query || {});
  if (dates.length === 0) {
    return res.status(400).json({
      error: 'must supply one of: ?date=YYYY-MM-DD, ?from=YYYY-MM-DD&to=YYYY-MM-DD, or ?dates=YYYY-MM-DD,YYYY-MM-DD',
    });
  }

  const perDate = [];
  for (const date of dates) {
    const stages = {};
    try { stages.settle = await invokeHandler(settleHandler, { date }); }
    catch (e) { stages.settle = { ok: false, error: e?.message }; }

    try { stages.scorecard = await invokeHandler(scorecardHandler, { date }); }
    catch (e) { stages.scorecard = { ok: false, error: e?.message }; }

    try { stages.audit = await invokeHandler(auditHandler, { date }); }
    catch (e) { stages.audit = { ok: false, error: e?.message }; }

    const ok = stages.settle?.ok !== false
      && stages.scorecard?.ok !== false
      && stages.audit?.ok !== false;

    perDate.push({ date, ok, stages });
  }

  // Invalidate the mlb:picks:built KV snapshot so the next /built request
  // re-embeds the refreshed scorecardSummary on the client immediately.
  try {
    await setJson('mlb:picks:built:latest', null, { exSeconds: 1 });
  } catch { /* non-fatal */ }

  return res.status(200).json({
    ok: perDate.every(d => d.ok),
    sport,
    datesRequested: dates,
    datesProcessed: perDate.length,
    generatedAt: new Date().toISOString(),
    results: perDate,
  });
}
