/**
 * NBA Home — layout order + SEO invariants (v6).
 *
 *   1. The Maximus's Picks board renders BEFORE the scorecard inside the
 *      dark hero shell. (Pre-v6 the order was reversed; the picks board
 *      is the more engaging entry surface.)
 *   2. There is exactly one Maximus's Picks block on the page (no
 *      duplicate copy of `MlbMaximusPicksSectionV2`).
 *   3. SEOHead is wired with the NBA-playoff-betting-picks title +
 *      canonical /nba + a description that names the markets the page
 *      covers (moneyline, spread, totals).
 *   4. The page exposes an <h1> for "NBA Playoff Intelligence" — was
 *      previously an <h2>, missing from the SEO checklist.
 *   5. The responsible-gaming disclaimer is rendered.
 *
 * Source-level test so we don't need jsdom + fetch mocks. The
 * MlbMaximusPicksSectionV2 component fetches its picks payload on mount,
 * which static markup can't exercise; instead we assert the structural
 * contract on the page source.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, 'NbaHome.jsx'), 'utf8');

describe('NbaHome — picks above scorecard', () => {
  it('renders MlbMaximusPicksSectionV2 BEFORE NbaScorecardReport', () => {
    const picksIdx = SRC.indexOf('<MlbMaximusPicksSectionV2');
    const scoreIdx = SRC.indexOf('<NbaScorecardReport');
    expect(picksIdx, 'picks block present').toBeGreaterThan(0);
    expect(scoreIdx, 'scorecard block present').toBeGreaterThan(0);
    expect(picksIdx).toBeLessThan(scoreIdx);
  });

  it('renders the picks block exactly once (no duplicate)', () => {
    const occurrences = SRC.match(/<MlbMaximusPicksSectionV2/g) || [];
    expect(occurrences).toHaveLength(1);
  });

  it('renders the scorecard block exactly once', () => {
    const occurrences = SRC.match(/<NbaScorecardReport/g) || [];
    expect(occurrences).toHaveLength(1);
  });

  it('preserves the canonical NBA Home picks props', () => {
    expect(SRC).toMatch(/sport="nba"/);
    expect(SRC).toMatch(/endpoint="\/api\/nba\/picks\/built"/);
    expect(SRC).toMatch(/homeShowAll/);
    expect(SRC).toMatch(/darkSurface/);
    expect(SRC).toMatch(/suppressPerformanceBlocks/);
  });

  it('includes an h1 for NBA Playoff Intelligence', () => {
    expect(SRC).toMatch(/<h1[^>]*className=\{[^}]*picksHeroTitle[^}]*\}\s*>\s*NBA Playoff Intelligence/);
  });

  it('includes the responsible-gaming disclaimer copy', () => {
    expect(SRC).toMatch(/For entertainment only.*bet responsibly.*21\+/i);
  });
});

describe('NbaHome — SEO metadata wiring', () => {
  it('imports SEOHead and buildOgImageUrl from the canonical helper', () => {
    expect(SRC).toMatch(/from\s+['"]\.\.\/\.\.\/components\/seo\/SEOHead['"]/);
    expect(SRC).toMatch(/SEOHead\s*,?\s*\{?\s*buildOgImageUrl/);
  });

  it('renders <SEOHead> with NBA-playoff-betting-picks title', () => {
    expect(SRC).toMatch(/title=\{seoTitle\}/);
    expect(SRC).toMatch(/seoTitle\s*=\s*['"]NBA Playoff Betting Picks/);
  });

  it('description names moneyline + spread + totals + model-graded', () => {
    const block = SRC.match(/seoDescription\s*=\s*\n?\s*['"]([\s\S]*?)['"]\s*;/);
    expect(block, 'seoDescription literal exists').toBeTruthy();
    const desc = block[1];
    expect(desc).toMatch(/moneyline/i);
    expect(desc).toMatch(/spread/i);
    expect(desc).toMatch(/over\/under|totals/i);
    expect(desc).toMatch(/model-graded/i);
  });

  it('canonical path is /nba (not workspace-prefixed)', () => {
    expect(SRC).toMatch(/canonicalPath=['"]\/nba['"]/);
  });

  it('passes WebPage JSON-LD with the canonical URL', () => {
    expect(SRC).toMatch(/'@type'\s*:\s*'WebPage'/);
    expect(SRC).toMatch(/url\s*:\s*['"]https:\/\/maximussports\.ai\/nba['"]/);
  });

  it('builds a dynamic OG image — never hard-codes a static asset', () => {
    expect(SRC).toMatch(/buildOgImageUrl\(\{/);
    expect(SRC).not.toMatch(/ogImage=\{['"]\/og\.png['"]/);
  });
});
