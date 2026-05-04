/**
 * /api/version + /api/health — must surface git SHA and per-sport
 * model versions so post-deploy verification doesn't require inspecting
 * picks-payload internals.
 */

import { describe, it, expect } from 'vitest';
import versionHandler from './version.js';
import healthHandler from './health.js';

function mockRes() {
  const res = {
    statusCode: 200, body: null, headers: {},
    setHeader: function(k, v) { this.headers[k] = v; return this; },
    status: function(code) { this.statusCode = code; return this; },
    json: function(b) { this.body = b; return this; },
    end: function() { return this; },
  };
  return res;
}

describe('/api/version', () => {
  it('returns ok, timestamp, git, and model fields', () => {
    const res = mockRes();
    versionHandler({ method: 'GET' }, res);
    expect(res.body.ok).toBe(true);
    expect(res.body.timestamp).toBeTruthy();
    expect(res.body.git).toBeTruthy();
    expect(res.body.git).toHaveProperty('sha');
    expect(res.body.git).toHaveProperty('shortSha');
    expect(res.body.git).toHaveProperty('branch');
    expect(res.body.model).toHaveProperty('nba');
    expect(res.body.model).toHaveProperty('mlb');
  });
  it('NBA model version is the current builder version (not v2.0.0 stub)', () => {
    const res = mockRes();
    versionHandler({ method: 'GET' }, res);
    expect(res.body.model.nba.startsWith('nba-picks-')).toBe(true);
    expect(res.body.model.nba).not.toBe('nba-picks-v2.0.0');
  });
});

describe('/api/health', () => {
  it('returns the same metadata shape so monitors and audit doc both work', () => {
    const res = mockRes();
    healthHandler({ method: 'GET' }, res);
    expect(res.body.ok).toBe(true);
    expect(res.body.git).toBeTruthy();
    expect(res.body.model).toBeTruthy();
  });
});
