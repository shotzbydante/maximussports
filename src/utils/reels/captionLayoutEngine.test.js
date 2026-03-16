import { describe, it, expect } from 'vitest';
import {
  CaptionLayoutState,
  rectsOverlap,
  findSafeZone,
  enforceMinGap,
  enforceMaxActiveCaptions,
  scaleDuration,
  planCaptionSequence,
  buildExclusions,
  getCaptionAlpha,
  getCaptionSlideOffset,
  ZONES,
  MIN_CAPTION_GAP,
  PREFERRED_CAPTION_GAP,
  MAX_ACTIVE_CAPTIONS,
  CAPTION_FADE_IN_MS,
  CAPTION_FADE_OUT_MS,
} from './captionLayoutEngine';

// ─── Collision Detection ─────────────────────────────────────────

describe('rectsOverlap', () => {
  it('detects overlapping rectangles', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 50, y: 50, w: 100, h: 100 };
    expect(rectsOverlap(a, b)).toBe(true);
  });

  it('returns false for non-overlapping rectangles', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 200, y: 200, w: 100, h: 100 };
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it('returns false for adjacent rectangles', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 100, y: 0, w: 100, h: 100 };
    expect(rectsOverlap(a, b)).toBe(false);
  });
});

// ─── CaptionLayoutState ──────────────────────────────────────────

describe('CaptionLayoutState', () => {
  it('tracks active captions at a given time', () => {
    const state = new CaptionLayoutState();
    state.addCaption({ startTime: 0, endTime: 2, x: 0, y: 0, width: 100, height: 50 });
    state.addCaption({ startTime: 1, endTime: 3, x: 0, y: 60, width: 100, height: 50 });
    state.addCaption({ startTime: 4, endTime: 6, x: 0, y: 0, width: 100, height: 50 });

    expect(state.getActiveCount(0.5)).toBe(1);
    expect(state.getActiveCount(1.5)).toBe(2);
    expect(state.getActiveCount(2.5)).toBe(1);
    expect(state.getActiveCount(3.5)).toBe(0);
    expect(state.getActiveCount(5)).toBe(1);
  });

  it('removes expired captions', () => {
    const state = new CaptionLayoutState();
    state.addCaption({ startTime: 0, endTime: 2 });
    state.addCaption({ startTime: 1, endTime: 5 });

    state.removeExpired(3);
    expect(state.activeCaptions.length).toBe(1);
    expect(state.activeCaptions[0].endTime).toBe(5);
  });

  it('resets all captions', () => {
    const state = new CaptionLayoutState();
    state.addCaption({ startTime: 0, endTime: 2 });
    state.reset();
    expect(state.activeCaptions.length).toBe(0);
  });
});

// ─── Max Active Captions ─────────────────────────────────────────

describe('enforceMaxActiveCaptions', () => {
  it('delays a caption when max is reached', () => {
    const state = new CaptionLayoutState();
    state.addCaption({ startTime: 0, endTime: 2, x: 0, y: 0, width: 100, height: 50 });
    state.addCaption({ startTime: 0.5, endTime: 2.5, x: 0, y: 60, width: 100, height: 50 });

    const delayed = enforceMaxActiveCaptions(1.0, state, 2);
    expect(delayed).toBeGreaterThanOrEqual(2);
  });

  it('does not delay when under max', () => {
    const state = new CaptionLayoutState();
    state.addCaption({ startTime: 0, endTime: 2, x: 0, y: 0, width: 100, height: 50 });

    const delayed = enforceMaxActiveCaptions(1.0, state, 2);
    expect(delayed).toBe(1.0);
  });
});

// ─── Caption Gap Enforcement ─────────────────────────────────────

describe('enforceMinGap', () => {
  it('enforces minimum gap after a caption', () => {
    const state = new CaptionLayoutState();
    state.addCaption({ startTime: 0, endTime: 2, x: 0, y: 0, width: 100, height: 50 });

    const delayed = enforceMinGap(2.2, state, PREFERRED_CAPTION_GAP);
    expect(delayed).toBeGreaterThanOrEqual(2 + PREFERRED_CAPTION_GAP);
  });

  it('does not delay when gap is sufficient', () => {
    const state = new CaptionLayoutState();
    state.addCaption({ startTime: 0, endTime: 2, x: 0, y: 0, width: 100, height: 50 });

    const delayed = enforceMinGap(5.0, state, PREFERRED_CAPTION_GAP);
    expect(delayed).toBe(5.0);
  });
});

// ─── Zone Selection ──────────────────────────────────────────────

describe('findSafeZone', () => {
  it('returns preferred zone when no conflicts', () => {
    const zone = findSafeZone(['TOP_CENTER'], [], []);
    expect(zone.id).toBe('TOP_CENTER');
  });

  it('falls back when preferred zone is occupied', () => {
    const occupied = [{ ...ZONES.TOP_CENTER, startTime: 0, endTime: 5 }];
    const zone = findSafeZone(['TOP_CENTER'], occupied, [], 2);
    expect(zone.id).not.toBe('TOP_CENTER');
  });

  it('avoids exclusion zones', () => {
    const exclusions = [{ x: ZONES.TOP_CENTER.x, y: ZONES.TOP_CENTER.y, w: ZONES.TOP_CENTER.w, h: ZONES.TOP_CENTER.h }];
    const zone = findSafeZone(['TOP_CENTER'], [], exclusions);
    expect(zone.id).not.toBe('TOP_CENTER');
  });
});

// ─── Caption Duration Scaling ────────────────────────────────────

describe('scaleDuration', () => {
  it('scales short text to minimum duration', () => {
    const dur = scaleDuration('Hi', 'hook');
    expect(dur).toBeGreaterThanOrEqual(0.8);
    expect(dur).toBeLessThanOrEqual(1.4);
  });

  it('scales long text to longer duration', () => {
    const longText = 'This is a much longer caption that requires more reading time on screen.';
    const dur = scaleDuration(longText, 'insight');
    expect(dur).toBeGreaterThan(1.5);
    expect(dur).toBeLessThanOrEqual(3.0);
  });
});

// ─── Full Sequence Planner ───────────────────────────────────────

describe('planCaptionSequence', () => {
  it('produces non-overlapping captions', () => {
    const captions = [
      { text: 'Hook line', role: 'hook' },
      { text: 'Insight detail text', role: 'insight' },
      { text: '85% ATS record', role: 'data' },
      { text: 'What bettors missed', role: 'curiosity' },
    ];

    const planned = planCaptionSequence(captions, 15);

    for (let i = 1; i < planned.length; i++) {
      const gap = planned[i].startTime - planned[i - 1].endTime;
      expect(gap).toBeGreaterThanOrEqual(MIN_CAPTION_GAP - 0.01);
    }
  });

  it('inserts hook at the beginning', () => {
    const captions = [
      { text: 'Stop betting blind', role: 'hook' },
      { text: 'Details here', role: 'insight' },
    ];

    const planned = planCaptionSequence(captions, 10);
    expect(planned[0].role).toBe('hook');
    expect(planned[0].startTime).toBeLessThan(1);
  });

  it('never exceeds max active captions simultaneously', () => {
    const captions = Array.from({ length: 6 }, (_, i) => ({
      text: `Caption ${i}`,
      role: 'insight',
      proposedStart: i * 0.5,
    }));

    const planned = planCaptionSequence(captions, 20);

    for (let t = 0; t < 20; t += 0.1) {
      const active = planned.filter(c => c.startTime <= t && c.endTime > t);
      expect(active.length).toBeLessThanOrEqual(MAX_ACTIVE_CAPTIONS);
    }
  });
});

// ─── Safe Zone Exclusions ────────────────────────────────────────

describe('buildExclusions', () => {
  it('builds CTA footer exclusion', () => {
    const ex = buildExclusions({ ctaActive: true });
    expect(ex.length).toBe(1);
    expect(ex[0].label).toBe('cta-footer');
    expect(ex[0].y).toBeGreaterThan(1600);
  });

  it('builds mascot exclusion', () => {
    const ex = buildExclusions({ mascotActive: true });
    expect(ex.length).toBe(1);
    expect(ex[0].label).toBe('mascot-hero');
  });

  it('builds multiple exclusions', () => {
    const ex = buildExclusions({ ctaActive: true, mascotActive: true, scoreBug: true });
    expect(ex.length).toBe(3);
  });
});

// ─── Animation Helpers ───────────────────────────────────────────

describe('getCaptionAlpha', () => {
  it('returns 0 at the start', () => {
    const alpha = getCaptionAlpha(0, 0, 3);
    expect(alpha).toBe(0);
  });

  it('returns 1 in the middle', () => {
    const alpha = getCaptionAlpha(1, 0, 3);
    expect(alpha).toBe(1);
  });

  it('fades out near the end', () => {
    const alpha = getCaptionAlpha(2.92, 0, 3);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeGreaterThan(0);
  });
});

describe('getCaptionSlideOffset', () => {
  it('returns positive offset at caption start', () => {
    const offset = getCaptionSlideOffset(0, 0);
    expect(offset).toBeGreaterThan(0);
  });

  it('returns 0 after fade-in completes', () => {
    const offset = getCaptionSlideOffset(1, 0);
    expect(offset).toBe(0);
  });
});
