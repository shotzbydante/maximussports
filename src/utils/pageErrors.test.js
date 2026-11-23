import { describe, it, expect, vi } from 'vitest';
import { isHostAppNoise, isStaleBuildError, reloadOnceForNewBuild } from './pageErrors.js';

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('page errors', () => {
  it('recognises the Instagram and Facebook Android browser noise', () => {
    expect(isHostAppNoise('Uncaught Error: Error invoking postMessage: Java object is gone')).toBe(true);
    expect(isHostAppNoise("Cannot read properties of undefined (reading 'map')")).toBe(false);
    expect(isHostAppNoise(undefined)).toBe(false);
  });

  it('recognises a page asking for a replaced build', () => {
    expect(isStaleBuildError('Failed to fetch dynamically imported module: https://maximussports.ai/assets/NflPicks-abc.js')).toBe(true);
    expect(isStaleBuildError('Unable to preload CSS for /assets/NflPicks-abc.css')).toBe(true);
    expect(isStaleBuildError('Failed to fetch')).toBe(false);
  });

  it('reloads once, then not again inside a minute', () => {
    const storage = memoryStore();
    const reload = vi.fn();
    expect(reloadOnceForNewBuild({ storage, now: 1_000_000, reload })).toBe(true);
    expect(reloadOnceForNewBuild({ storage, now: 1_030_000, reload })).toBe(false);
    expect(reloadOnceForNewBuild({ storage, now: 1_070_000, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when it cannot remember having done so', () => {
    const reload = vi.fn();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(reloadOnceForNewBuild({ storage: broken, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
