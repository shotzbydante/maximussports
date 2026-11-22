import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = new Map();
vi.mock('../_globalCache.js', () => ({
  getJson: vi.fn(async (k) => store.get(k) ?? null),
  setJson: vi.fn(async (k, v) => { store.set(k, v); }),
}));

const { getInstagramCredentials, refreshInstagramToken, describeInstagramError } = await import('./instagramAuth.js');
const { internalBaseUrl } = await import('./siteUrl.js');

const ENV = { ...process.env };
beforeEach(() => {
  store.clear();
  process.env.INSTAGRAM_ACCOUNT_ID = '178';
  process.env.INSTAGRAM_ACCESS_TOKEN = '"env-token"';
});
afterEach(() => { process.env = { ...ENV }; });

const okFetch = (body) => vi.fn(async () => ({ ok: true, json: async () => body }));

describe('getInstagramCredentials', () => {
  it('uses the env token, unquoted, when nothing has been refreshed', async () => {
    expect(await getInstagramCredentials()).toMatchObject({ accountId: '178', accessToken: 'env-token', source: 'env', daysLeft: null });
  });
  it('reports no token when the env var is missing', async () => {
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    expect(await getInstagramCredentials()).toMatchObject({ accessToken: '', source: 'none' });
  });
});

describe('refreshInstagramToken', () => {
  it('stores the refreshed token and serves it afterwards', async () => {
    const fetchImpl = okFetch({ access_token: 'fresh-token', token_type: 'bearer', expires_in: 5183944 });
    const r = await refreshInstagramToken({ fetchImpl });
    expect(r).toMatchObject({ ok: true, stored: true });
    expect(r.daysLeft).toBe(59);
    expect(fetchImpl.mock.calls[0][0]).toContain('grant_type=ig_refresh_token&access_token=env-token');
    expect(await getInstagramCredentials()).toMatchObject({ accessToken: 'fresh-token', source: 'kv', daysLeft: 59 });
  });

  it('ignores the stored token once a new one is pasted into the environment', async () => {
    await refreshInstagramToken({ fetchImpl: okFetch({ access_token: 'fresh-token', expires_in: 5183944 }) });
    process.env.INSTAGRAM_ACCESS_TOKEN = 'brand-new-token';
    expect(await getInstagramCredentials()).toMatchObject({ accessToken: 'brand-new-token', source: 'env' });
  });

  it('explains an expired token and stores nothing', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({ error: { message: 'Error validating access token: Session has expired on Tuesday, 05-May-26 23:22:47 PDT.', type: 'OAuthException', code: 190 } }) }));
    const r = await refreshInstagramToken({ fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('instagram_api');
    expect(r.error.expired).toBe(true);
    expect(r.error.action).toMatch(/Generate a new long-lived token/);
    expect(store.size).toBe(0);
  });

  it('reports a network failure without throwing', async () => {
    const r = await refreshInstagramToken({ fetchImpl: vi.fn(async () => { throw new Error('ECONNRESET'); }) });
    expect(r).toMatchObject({ ok: false, stage: 'network' });
  });
});

describe('describeInstagramError', () => {
  it('separates a rejected token from an expired one', () => {
    expect(describeInstagramError({ error: { message: 'Invalid OAuth access token - Cannot parse access token', code: 190 } })).toMatchObject({ expired: false, invalid: true });
    expect(describeInstagramError({ error: { message: 'Application request limit reached', code: 4 } })).toMatchObject({ expired: false, invalid: false });
  });
  it('never echoes a token', () => {
    expect(JSON.stringify(describeInstagramError({ error: { message: 'bad', code: 190, access_token: 'SECRET' } }))).not.toContain('SECRET');
  });
});

describe('internalBaseUrl', () => {
  const req = { headers: { host: 'maximussports-abc123-team.vercel.app' } };
  it('uses the production domain in production, never the deployment hostname', () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'maximussports.ai';
    expect(internalBaseUrl(req)).toBe('https://maximussports.ai');
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(internalBaseUrl(req)).toBe('https://maximussports.ai');
  });
  it('honours SITE_URL and tolerates a missing scheme or trailing slash', () => {
    process.env.SITE_URL = 'staging.maximussports.ai/';
    expect(internalBaseUrl(req)).toBe('https://staging.maximussports.ai');
  });
  it('uses the request host on previews and http on localhost', () => {
    delete process.env.SITE_URL;
    process.env.VERCEL_ENV = 'preview';
    expect(internalBaseUrl(req)).toBe('https://maximussports-abc123-team.vercel.app');
    delete process.env.VERCEL_ENV;
    expect(internalBaseUrl({ headers: { host: 'localhost:3000' } })).toBe('http://localhost:3000');
  });
});
