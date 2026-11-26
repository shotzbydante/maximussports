import { describe, it, expect } from 'vitest';
import { readGuestPass, grantGuestPass, clearGuestPass, isEmail, GUEST_PASS_DAYS } from './guestPass';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const DAY = 86400e3;

describe('guest pass', () => {
  it('is granted for the email given, lower-cased, and read back', () => {
    const storage = memory();
    grantGuestPass('  Fan@Example.com ', { storage, now: 1000 });
    expect(readGuestPass({ storage, now: 2000 })).toEqual({ email: 'fan@example.com', at: 1000 });
  });

  it('runs out after a week', () => {
    const storage = memory();
    grantGuestPass('fan@example.com', { storage, now: 0 });
    expect(readGuestPass({ storage, now: GUEST_PASS_DAYS * DAY - 1 })).not.toBeNull();
    expect(readGuestPass({ storage, now: GUEST_PASS_DAYS * DAY + 1 })).toBeNull();
  });

  it('ignores a pass dated in the future, a broken one, and none', () => {
    const storage = memory();
    expect(readGuestPass({ storage })).toBeNull();
    storage.setItem('mx_guest_pass', '{not json');
    expect(readGuestPass({ storage })).toBeNull();
    storage.setItem('mx_guest_pass', JSON.stringify({ email: 'a@b.co', at: 10 * DAY }));
    expect(readGuestPass({ storage, now: DAY })).toBeNull();
  });

  it('can be cleared, and survives storage that throws', () => {
    const storage = memory();
    grantGuestPass('fan@example.com', { storage, now: 0 });
    clearGuestPass({ storage });
    expect(readGuestPass({ storage, now: 1 })).toBeNull();
    const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    expect(() => grantGuestPass('fan@example.com', { storage: broken })).not.toThrow();
    expect(readGuestPass({ storage: broken })).toBeNull();
  });

  it('knows an email from a typo', () => {
    expect(isEmail('fan@example.com')).toBe(true);
    for (const bad of ['', 'fan', 'fan@', 'fan@example', 'fan @example.com', null]) expect(isEmail(bad)).toBe(false);
  });
});
