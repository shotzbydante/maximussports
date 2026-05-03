/**
 * Embedded scorecard — readability invariants.
 *
 * Locks down the v3 readability fix: every leaf selector that sets a dark
 * foreground colour for the light Odds Insights surface must have a
 * matching `.sectionEmbedded` override so the text remains readable on
 * the dark NBA Home glass shell. This source-level test catches the
 * exact regression class where a future PR adds a new dark text rule
 * without an embedded counterpart.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, 'NbaScorecardReport.module.css'), 'utf8');

const REQUIRED_EMBEDDED_RULES = [
  // Grading explainer leaves
  /\.sectionEmbedded\s+\.explainerList\s+li\b/,
  /\.sectionEmbedded\s+\.explainerList\s+li::before/,
  /\.sectionEmbedded\s+\.explainerList\s+strong/,
  // Rolling perf metadata
  /\.sectionEmbedded\s+\.rollingCardEmpty/,
  /\.sectionEmbedded\s+\.rollingCardRate/,
  /\.sectionEmbedded\s+\.rollingCardSample/,
  // CTA + pending notice
  /\.sectionEmbedded\s+\.compactCta/,
  /\.sectionEmbedded\s+\.pendingNote/,
  // Takeaway kicker
  /\.sectionEmbedded\s+\.takeawayKicker/,
  // Row metadata
  /\.sectionEmbedded\s+\.gameContext\b/,
  /\.sectionEmbedded\s+\.gameContextFlag/,
];

describe('NbaScorecardReport.module.css — embedded readability', () => {
  it.each(REQUIRED_EMBEDDED_RULES.map(re => [re.source]))(
    'has an embedded override matching %s',
    (re) => {
      expect(CSS).toMatch(new RegExp(re));
    },
  );

  it('embedded scorecard uses light foreground colours', () => {
    // Body text should be a near-white on glass, not the dark token.
    expect(CSS).toMatch(/\.sectionEmbedded\s+\.row\b/);
    // The base section sets dark text; the embedded variant must invert.
    expect(CSS).toMatch(/\.sectionEmbedded\s*\{[^}]*color:\s*#e8edf6/);
  });

  it('embedded scorecard uses a glass background, not solid', () => {
    expect(CSS).toMatch(/\.sectionEmbedded\s*\{[^}]*backdrop-filter/);
    expect(CSS).toMatch(/\.sectionEmbedded\s*\{[^}]*rgba\(15,\s*30,\s*48/);
  });

  it('inner dividers above rolling-perf and explainer use translucent white', () => {
    expect(CSS).toMatch(/\.sectionEmbedded\s+\.rolling\s*\{[^}]*border-top:[^;]*rgba\(255,\s*255,\s*255/);
    expect(CSS).toMatch(/\.sectionEmbedded\s+\.explainer\s*\{[^}]*border-top:[^;]*rgba\(255,\s*255,\s*255/);
  });
});

describe('MlbMaximusPicksSectionV2.module.css — dark surface overrides', () => {
  const PICKS_CSS = readFileSync(
    resolve(here, '..', '..', 'mlb', 'picks', 'MlbMaximusPicksSectionV2.module.css'),
    'utf8',
  );

  it('has a [data-dark-surface] block that lifts headings to white', () => {
    expect(PICKS_CSS).toMatch(/data-dark-surface=['"]true['"]/);
    // Title becomes white on glass
    expect(PICKS_CSS).toMatch(/data-dark-surface=['"]true['"]\][\s\S]*\.title\s*\{[^}]*color:\s*#fff/);
  });

  it('preserves the gold accent for the eyebrow', () => {
    expect(PICKS_CSS).toMatch(/data-dark-surface=['"]true['"]\][\s\S]*\.eyebrow\s*\{[^}]*color:\s*#c9a24a/);
  });

  it('inverts the Today\'s Picks header on dark surface', () => {
    expect(PICKS_CSS).toMatch(/data-dark-surface=['"]true['"]\][\s\S]*\.todaysHeader\s*\{/);
    expect(PICKS_CSS).toMatch(/data-dark-surface=['"]true['"]\][\s\S]*\.todaysTitle\s*\{[^}]*color:\s*#fff/);
  });
});
