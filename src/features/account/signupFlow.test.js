import { describe, it, expect, vi } from 'vitest';
import {
  safeNext, nextFromSearch, callbackPath, cleanCode, isCompleteCode,
  requestSignupEmail, verifySignupCode, codeErrorMessage,
} from './signupFlow.js';

describe('where sign-up returns to', () => {
  it('keeps same-site paths and drops everything else', () => {
    expect(safeNext('/nfl/insights?week=12')).toBe('/nfl/insights?week=12');
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
    expect(safeNext('')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it('reads ?next= and builds the callback address', () => {
    expect(nextFromSearch('?next=%2Fnfl%2Finsights')).toBe('/nfl/insights');
    expect(nextFromSearch('?next=https%3A%2F%2Fevil.example')).toBeNull();
    expect(nextFromSearch('')).toBeNull();
    expect(callbackPath('/nfl/insights')).toBe('/auth/callback?next=%2Fnfl%2Finsights');
    expect(callbackPath('//evil.example')).toBe('/auth/callback');
    expect(callbackPath(null)).toBe('/auth/callback');
  });
});

describe('the emailed code', () => {
  it('keeps digits only, however it was pasted', () => {
    expect(cleanCode(' 482 913 ')).toBe('482913');
    expect(cleanCode('Code: 482-913.')).toBe('482913');
    expect(cleanCode('123456789012345')).toBe('1234567890');
    expect(isCompleteCode('482913')).toBe(true);
    expect(isCompleteCode('48291')).toBe(false);
  });

  it('signs in with a good code', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } }, user: { id: 'u1' } }, error: null });
    const out = await verifySignupCode({ supabase: { auth: { verifyOtp } }, email: 'a@b.co', code: '482 913' });
    expect(out).toEqual({ ok: true, user: { id: 'u1' } });
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.co', token: '482913', type: 'email' });
  });

  it('does not call the server with a code that is too short', async () => {
    const verifyOtp = vi.fn();
    const out = await verifySignupCode({ supabase: { auth: { verifyOtp } }, email: 'a@b.co', code: '12' });
    expect(out).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('tells an expired code from a wrong one, and never throws', async () => {
    const sb = (result) => ({ auth: { verifyOtp: vi.fn().mockResolvedValue(result) } });
    expect(await verifySignupCode({ supabase: sb({ data: {}, error: { code: 'otp_expired', message: 'Token has expired or is invalid' } }), email: 'a@b.co', code: '482913' }))
      .toEqual({ ok: false, reason: 'expired' });
    expect(await verifySignupCode({ supabase: sb({ data: {}, error: { message: 'Invalid token' } }), email: 'a@b.co', code: '482913' }))
      .toEqual({ ok: false, reason: 'invalid' });
    expect(await verifySignupCode({ supabase: sb({ data: { session: null }, error: null }), email: 'a@b.co', code: '482913' }))
      .toEqual({ ok: false, reason: 'other' });
    const thrower = { auth: { verifyOtp: vi.fn().mockRejectedValue(new Error('boom')) } };
    expect(await verifySignupCode({ supabase: thrower, email: 'a@b.co', code: '482913' })).toEqual({ ok: false, reason: 'network' });
    expect(await verifySignupCode({ supabase: null, email: 'a@b.co', code: '482913' })).toEqual({ ok: false, reason: 'unavailable' });
    for (const r of ['expired', 'invalid', 'network', 'other']) expect(codeErrorMessage(r)).toMatch(/\w/);
  });
});

describe('asking for the confirmation email', () => {
  it('posts the address and a safe next', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    expect(await requestSignupEmail({ email: 'a@b.co', next: '/nfl/insights', fetchImpl })).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/auth/send-confirm-signup');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.co', next: '/nfl/insights' });
    await requestSignupEmail({ email: 'a@b.co', next: 'https://evil.example', fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).next).toBeNull();
  });

  it('reports a server error, a dropped connection and a hung request', async () => {
    expect(await requestSignupEmail({ email: 'a@b.co', fetchImpl: vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) }))
      .toEqual({ ok: false, reason: 'server' });
    expect(await requestSignupEmail({ email: 'a@b.co', fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) }))
      .toEqual({ ok: false, reason: 'network' });
    const hung = (_url, init) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    expect(await requestSignupEmail({ email: 'a@b.co', fetchImpl: hung, timeoutMs: 10 })).toEqual({ ok: false, reason: 'timeout' });
  });
});
