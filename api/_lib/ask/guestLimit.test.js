import { describe, it, expect } from 'vitest';
import { takeGuestTurn, refundGuestTurn, guestUsed, cleanDeviceId, clientIp, easternDay } from './guestLimit.js';

/** A stand-in for KV: counters in a Map. */
function store() {
  const m = new Map();
  return {
    m,
    incr: async (key) => { m.set(key, (m.get(key) || 0) + 1); return m.get(key); },
    decr: async (key) => { m.set(key, Math.max(0, (m.get(key) || 0) - 1)); },
    read: async (key) => m.get(key) ?? null,
  };
}

const NOW = new Date('2026-11-29T18:00:00Z');
const base = { ip: '203.0.113.9', device: 'device-aaaaaaaaaaaaaaaa', cap: 3, perIp: 5, all: 100, now: NOW };

describe('takeGuestTurn', () => {
  it('counts a device up to its cap and then refuses', async () => {
    const kv = store();
    for (const n of [1, 2, 3]) expect(await takeGuestTurn({ ...base, incr: kv.incr })).toEqual({ ok: true, used: n });
    expect(await takeGuestTurn({ ...base, incr: kv.incr })).toEqual({ ok: false, code: 'capped', used: 3 });
  });

  it('does not let a cleared browser reset the count for its network address', async () => {
    const kv = store();
    let refused = null;
    for (let i = 0; i < 6 && !refused; i += 1) {
      const out = await takeGuestTurn({ ...base, device: `device-${String(i).padStart(16, '0')}`, incr: kv.incr });
      if (!out.ok) refused = out;
    }
    expect(refused).toMatchObject({ ok: false, code: 'capped' });
  });

  it('stops all guests at the daily budget, and says busy rather than capped', async () => {
    const kv = store();
    const first = await takeGuestTurn({ ...base, all: 1, incr: kv.incr });
    const second = await takeGuestTurn({ ...base, ip: '203.0.113.10', device: 'device-bbbbbbbbbbbbbbbb', all: 1, incr: kv.incr });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: 'busy' });
  });

  it('fails closed when the counter cannot be reached', async () => {
    expect(await takeGuestTurn({ ...base, incr: async () => null })).toEqual({ ok: false, code: 'unavailable' });
  });

  it('counts a visitor with no device id by address', async () => {
    const kv = store();
    await takeGuestTurn({ ...base, device: null, incr: kv.incr });
    expect(await guestUsed({ ip: base.ip, device: null, now: NOW, read: kv.read })).toBe(1);
    expect(await guestUsed({ ip: '198.51.100.1', device: null, now: NOW, read: kv.read })).toBe(0);
  });

  it('starts again the next Eastern day', async () => {
    const kv = store();
    await takeGuestTurn({ ...base, cap: 1, incr: kv.incr });
    expect((await takeGuestTurn({ ...base, cap: 1, incr: kv.incr })).ok).toBe(false);
    expect((await takeGuestTurn({ ...base, cap: 1, now: new Date('2026-11-30T18:00:00Z'), incr: kv.incr })).ok).toBe(true);
    expect(easternDay(new Date('2026-11-30T04:30:00Z'))).toBe('2026-11-29');
  });

  it('gives a question back when its turn failed', async () => {
    const kv = store();
    await takeGuestTurn({ ...base, incr: kv.incr });
    await refundGuestTurn({ ...base, decr: kv.decr });
    expect(await guestUsed({ ...base, read: kv.read })).toBe(0);
    expect([...kv.m.values()]).toEqual([0, 0, 0]);
  });

  it('never stores the address or the device id itself', async () => {
    const kv = store();
    await takeGuestTurn({ ...base, incr: kv.incr });
    const keys = [...kv.m.keys()].join(' ');
    expect(keys).not.toContain(base.ip);
    expect(keys).not.toContain(base.device);
  });
});

describe('request helpers', () => {
  it('accepts only a token-shaped device id', () => {
    expect(cleanDeviceId('0b9c2f6e-1a2b-4c3d-9e8f-001122334455')).toBe('0b9c2f6e-1a2b-4c3d-9e8f-001122334455');
    for (const bad of ['short', 'has spaces in it right here', 'x'.repeat(65), '<script>alert(1)</script>', null]) expect(cleanDeviceId(bad)).toBeNull();
  });

  it('takes the first forwarded address', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })).toBe('203.0.113.9');
    expect(clientIp({ headers: { 'x-real-ip': '203.0.113.7' } })).toBe('203.0.113.7');
    expect(clientIp({ headers: {} })).toBeNull();
  });
});
