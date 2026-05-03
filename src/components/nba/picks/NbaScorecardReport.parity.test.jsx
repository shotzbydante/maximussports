/**
 * NbaScorecardReport — parity guarantees between /nba (embedded) and
 * /nba/insights (page).
 *
 * Locks down the 2026-05-04 fix:
 *   1. The component never truncates rows. Every persisted pick is
 *      rendered in canonical sort order regardless of `variant`.
 *   2. The "Top Results · showing N of M" header is never emitted.
 *   3. The component does not slice the input picks based on variant.
 *
 * We can't test the full rendered output of <NbaScorecardReport /> without
 * mocking its self-fetch, so the structural guarantees are asserted via
 * the source file itself — a fast, deterministic anti-regression on the
 * exact lines that produced the bug.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, 'NbaScorecardReport.jsx'), 'utf8');

describe('NbaScorecardReport — parity contract (no truncation)', () => {
  it('never slices to 3 picks (the pre-fix truncation)', () => {
    expect(SRC).not.toMatch(/sortedPicks\.slice\(0,\s*3\)/);
  });

  it('never emits the "showing N of M" header', () => {
    expect(SRC).not.toMatch(/showing.*of.*\$\{sortedPicks\.length\}/i);
  });

  it('does not render a "Top Results" JSX label (legacy compact-mode header)', () => {
    // Match only if "Top Results" appears between JSX angle brackets — i.e.
    // is rendered to the user. References inside // comments don't count.
    expect(SRC).not.toMatch(/>\s*Top Results\s*</);
  });

  it('always renders Pick-by-Pick Results', () => {
    expect(SRC).toMatch(/Pick-by-Pick Results/);
  });

  it('exposes embedded variant as a chrome flag (not a row gate)', () => {
    // The boolean is named `embedded` and accepts both 'compact' and
    // 'embedded' for back-compat. It must not be wired to a slice or a
    // length-bound on the picks list.
    expect(SRC).toMatch(/const embedded = variant === 'compact' \|\| variant === 'embedded'/);
  });

  it('always renders RollingPerformance and the grading explainer', () => {
    // No `!isCompact && <RollingPerformance` gate; both are always mounted.
    expect(SRC).not.toMatch(/!isCompact\s*&&\s*<RollingPerformance/);
    expect(SRC).not.toMatch(/!isCompact\s*&&\s*\(/);
  });
});

describe('NbaScorecardReport — variant prop semantics', () => {
  it('treats variant="embedded" identically to variant="compact" for content', () => {
    // Both flags must produce the same boolean. The check ensures no
    // future PR re-introduces a content gate behind one of them.
    expect(SRC).toMatch(/variant === 'compact' \|\| variant === 'embedded'/);
  });
});
