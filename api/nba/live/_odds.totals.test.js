/**
 * Truthful enricher — NBA `model.fairTotal` is NEVER mirrored from the
 * bookmaker total. Locks down the v4 honesty fix so a future PR can't
 * silently re-enable a 0-edge totals candidate.
 *
 * The check is source-level: we verify that the enricher does not write
 * `total` or any market-derived value into `model.fairTotal`. (A real
 * pace/efficiency model would write a model prediction here and the
 * totals gate would start clearing — that's the desired future state.)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, '_odds.js'), 'utf8');

describe('NBA odds enricher — fairTotal honesty', () => {
  it('does NOT mirror the market total into model.fairTotal', () => {
    // The pre-v4 line read:  fairTotal: total ?? game.model?.fairTotal
    expect(SRC).not.toMatch(/fairTotal:\s*total\s*\?\?/);
  });

  it('preserves any existing game.model.fairTotal fed in (future hook)', () => {
    expect(SRC).toMatch(/fairTotal:\s*game\.model\?\.fairTotal\s*\?\?\s*null/);
  });
});
