/**
 * POST /api/admin/picks/backfill?sport=mlb&date=YYYY-MM-DD
 *
 * Reruns settle-yesterday + build-scorecard + run-audit for a specific ET
 * slate date. Used to backfill historical days after a pipeline fix.
 *
 * Ordering: settle → build-scorecard → run-audit. Each stage's output is
 * returned so the caller can see exactly how many picks were graded, how
 * many matched finals, and what the scorecard record ended up being.
 *
 * Requires `x-admin-key: ${ADMIN_API_KEY}`. Also accepts the key via
 * `?key=<key>` for easy one-off curl testing.
 *
 * ALSO ACCEPTS GET for convenience (same semantics), since Vercel cron
 * endpoints fire GETs and some curl flows are easier without -X POST.
 */

import settleHandler from '../../cron/mlb/settle-yesterday.js';
import scorecardHandler from '../../cron/mlb/build-scorecard.js';
import auditHandler from '../../cron/mlb/run-audit.js';

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

/** Simple in-memory res-collector so we can invoke cron handlers and read
 *  their JSON without an HTTP round-trip. */
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const authErr = requireAdminKey(req);
  if (authErr) return res.status(401).json({ error: authErr });

  const sport = (req.query?.sport || 'mlb').toString();
  const date = (req.query?.date || '').toString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD (ET)' });
  }
  if (sport !== 'mlb') {
    return res.status(400).json({ error: `backfill currently supports sport=mlb only; got ${sport}` });
  }

  const stages = {};
  try {
    stages.settle = await invokeHandler(settleHandler, { date });
  } catch (e) {
    stages.settle = { ok: false, error: e?.message };
  }

  try {
    stages.scorecard = await invokeHandler(scorecardHandler, { date });
  } catch (e) {
    stages.scorecard = { ok: false, error: e?.message };
  }

  try {
    stages.audit = await invokeHandler(auditHandler, { date });
  } catch (e) {
    stages.audit = { ok: false, error: e?.message };
  }

  const allOk = stages.settle?.ok !== false
    && stages.scorecard?.ok !== false
    && stages.audit?.ok !== false;

  return res.status(200).json({
    ok: allOk,
    sport,
    date,
    stages,
    generatedAt: new Date().toISOString(),
  });
}
