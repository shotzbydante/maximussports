/**
 * Scorecard team logos — source-level invariants for the v5 fix.
 *
 * The PickRow now renders both away and home team logos via the canonical
 * `resolveTeamLogo` helper. These tests prevent a future regression that:
 *   - swaps the helper for sport-naive logo URLs,
 *   - drops the lazy-load attribute,
 *   - reintroduces inline image sources without the onError safety,
 *   - regresses the scoped dark-surface logo background.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, 'NbaScorecardReport.jsx'), 'utf8');
const CSS = readFileSync(resolve(here, 'NbaScorecardReport.module.css'), 'utf8');

describe('NbaScorecardReport — team logos', () => {
  it('imports the canonical resolveTeamLogo helper', () => {
    expect(SRC).toMatch(/resolveTeamLogo\s*}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/teamLogo/);
  });

  it('renders <img> tags for both away and home teams', () => {
    expect(SRC).toMatch(/src=\{awayLogo\}/);
    expect(SRC).toMatch(/src=\{homeLogo\}/);
  });

  it('uses lazy loading + onError fallback to keep rows safe', () => {
    expect(SRC).toMatch(/loading="lazy"/);
    expect(SRC).toMatch(/onError=\{[^}]*display\s*=\s*['"]none['"]/);
  });

  it('uses the NBA-safe sport context (not a cross-sport guess)', () => {
    expect(SRC).toMatch(/resolveTeamLogo\(\s*\{\s*sport:\s*['"]nba['"]/);
  });
});

describe('NbaScorecardReport CSS — logo styling', () => {
  it('declares a teamLogo class', () => {
    expect(CSS).toMatch(/\.teamLogo\s*\{/);
  });

  it('matchup is a flex container with logos inline', () => {
    expect(CSS).toMatch(/\.matchup\s*\{[^}]*display:\s*inline-flex/);
  });

  it('embedded variant tints the logo background for the dark hero', () => {
    expect(CSS).toMatch(/\.sectionEmbedded\s+\.teamLogo\s*\{[^}]*rgba\(255,\s*255,\s*255/);
  });
});

describe('MlbMaximusPicksSectionV2 CSS — gold pill on dark surface', () => {
  const PICKS_CSS = readFileSync(
    resolve(here, '..', '..', 'mlb', 'picks', 'MlbMaximusPicksSectionV2.module.css'),
    'utf8',
  );

  it('darkens the gold "Published N" pill background and lifts text contrast', () => {
    expect(PICKS_CSS).toMatch(/data-dark-surface=['"]true['"]\][\s\S]*\.todaysCountPill\s*\{/);
    // Stronger gold edge
    expect(PICKS_CSS).toMatch(/data-dark-surface=['"]true['"]\][\s\S]*\.todaysCountPill[\s\S]*?border:\s*1px\s+solid\s+rgba\(201,\s*162,\s*74,\s*0\.5/);
    // Light-gold text — never the dim brass on beige combo
    expect(PICKS_CSS).toMatch(/data-dark-surface=['"]true['"]\][\s\S]*\.todaysCountValue\s*\{[^}]*#f4dca0/);
  });
});
