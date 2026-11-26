import { describe, it, expect } from 'vitest';
import { sendNewPickAlerts, wantsPickAlerts, ALERT_WINDOW_MIN } from './nflPickAlerts.js';
import { getSubject, renderHTML, renderText } from '../../src/emails/templates/nflPickAlert.js';

const NOW = new Date('2026-11-26T08:00:00Z');
const pick = {
  id: 'g1-total-under', gameId: 'g1', pickRole: 'hero', tier: 'tier2',
  market: { type: 'total', line: 47.5, priceAmerican: -109 },
  selection: { side: 'under', label: 'Under 47.5' },
  book: { title: 'BetRivers' },
  conviction: { score: 71 },
  why: 'Wind is forecast at the stadium.',
  matchup: { startTime: '2026-11-27T01:20:00Z', awayTeam: { shortName: 'KC' }, homeTeam: { shortName: 'BUF' } },
};
const pro = (id, extra = {}) => ({ id, display_name: id, plan_tier: 'pro', subscription_status: 'active', preferences: {}, ...extra });

/** A stand-in for the Supabase client: records the claim's filters and the log rows. */
function fakeDb({ claimed = [{ id: 'row1', payload: pick }], profiles = [], claimError = null } = {}) {
  const calls = { filters: [], logs: [], update: null };
  const picksQuery = {
    update(v) { calls.update = v; return this; },
    eq(c, v) { calls.filters.push(['eq', c, v]); return this; },
    is(c, v) { calls.filters.push(['is', c, v]); return this; },
    not(c, op, v) { calls.filters.push(['not', c, op, v]); return this; },
    neq(c, v) { calls.filters.push(['neq', c, v]); return this; },
    gte(c, v) { calls.filters.push(['gte', c, v]); return this; },
    gt(c, v) { calls.filters.push(['gt', c, v]); return this; },
    select() { return Promise.resolve({ data: claimError ? null : claimed, error: claimError }); },
  };
  return {
    calls,
    from(table) {
      if (table === 'picks') return picksQuery;
      if (table === 'profiles') return { select: () => ({ eq: () => Promise.resolve({ data: profiles, error: null }) }) };
      return { insert: (row) => { calls.logs.push(row); return Promise.resolve({ error: null }); } };
    },
    auth: { admin: { getUserById: (id) => Promise.resolve({ data: { user: { email: `${id}@example.com` } } }) } },
  };
}

describe('wantsPickAlerts', () => {
  it('is Pro with an active subscription and alerts not switched off', () => {
    expect(wantsPickAlerts(pro('a'))).toBe(true);
    expect(wantsPickAlerts(pro('a', { preferences: { nfl_pick_alerts: false } }))).toBe(false);
    expect(wantsPickAlerts(pro('a', { subscription_status: 'canceled' }))).toBe(false);
    expect(wantsPickAlerts({ id: 'f', plan_tier: 'free', preferences: {} })).toBe(false);
  });
});

describe('sendNewPickAlerts', () => {
  it('claims un-alerted recommended picks locked in the window and emails each Pro account once', async () => {
    const sb = fakeDb({ profiles: [pro('ann'), pro('bob', { preferences: { nfl_pick_alerts: false } }), pro('cat', { subscription_status: 'past_due' })] });
    const sent = [];
    const out = await sendNewPickAlerts({ now: NOW, sb, send: async (m) => { sent.push(m); } });
    expect(out).toMatchObject({ ok: true, picks: 1, sent: 1, failed: 0 });
    expect(sent.map((m) => m.to)).toEqual(['ann@example.com']);
    expect(sent[0].subject).toBe('New pick: Under 47.5 -109 at BetRivers (KC at BUF)');
    expect(sb.calls.update).toEqual({ alerted_at: NOW.toISOString() });
    expect(sb.calls.filters).toContainEqual(['is', 'alerted_at', null]);
    expect(sb.calls.filters).toContainEqual(['gte', 'locked_at', new Date(NOW.getTime() - ALERT_WINDOW_MIN * 60_000).toISOString()]);
    expect(sb.calls.filters).toContainEqual(['gt', 'start_time', NOW.toISOString()]);
    expect(sb.calls.logs).toHaveLength(1);
    expect(sb.calls.logs[0]).toMatchObject({ digest_type: 'nfl_pick_alert', user_id: 'ann', metadata: { picks: ['row1'] } });
  });

  it('sends nothing when no pick was claimed', async () => {
    const sb = fakeDb({ claimed: [], profiles: [pro('ann')] });
    const sent = [];
    expect(await sendNewPickAlerts({ now: NOW, sb, send: async (m) => { sent.push(m); } })).toMatchObject({ ok: true, picks: 0, sent: 0 });
    expect(sent).toHaveLength(0);
  });

  it('reports a missing column instead of throwing, and counts a failed send', async () => {
    const missing = fakeDb({ claimError: { code: '42703', message: 'column picks.alerted_at does not exist' } });
    expect(await sendNewPickAlerts({ now: NOW, sb: missing })).toMatchObject({ ok: false, reason: 'migration_missing' });
    const sb = fakeDb({ profiles: [pro('ann'), pro('dan')] });
    const out = await sendNewPickAlerts({ now: NOW, sb, send: async (m) => { if (m.to.startsWith('ann')) throw new Error('bounce'); } });
    expect(out).toMatchObject({ sent: 1, failed: 1 });
  });
});

describe('pick alert email', () => {
  const args = { picks: [pick], displayName: 'Ann', now: NOW.getTime() };
  it('leads with the pick, price and book, and carries the legal line', () => {
    const html = renderHTML(args);
    expect(html).toContain('A pick just locked.');
    expect(html).toContain('Under 47.5');
    expect(html).toContain('BetRivers');
    expect(html).toContain('1-800-GAMBLER');
    expect(renderText(args)).toContain('Under 47.5 -109 at BetRivers');
  });
  it('counts several picks in the subject', () => {
    const two = [pick, { ...pick, id: 'g2', gameId: 'g2', conviction: { score: 60 }, selection: { side: 'home', label: 'DET +1' }, market: { type: 'runline', line: 1, priceAmerican: -108 } }];
    expect(getSubject({ picks: two, now: NOW.getTime() })).toBe('2 new picks: Under 47.5 -109 at BetRivers and 1 more');
  });
});
