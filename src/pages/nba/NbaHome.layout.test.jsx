/**
 * NBA Home — layout order and SEO invariants.
 *
 * The page follows the NFL home: picks, the brief, games, headlines beside
 * title odds, your teams, videos. Source-level, so it needs no DOM or
 * fetch mocks.
 *
 *   1. Sections appear in that order, each exactly once.
 *   2. The copy is about the season in progress, not last spring's playoffs.
 *   3. SEOHead names the markets the page covers and points at /nba.
 *   4. The responsible-gaming line is there.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, 'NbaHome.jsx'), 'utf8');
const JSX = SRC.slice(SRC.indexOf('<div className={h.page}>'));

describe('NbaHome — section order', () => {
  const ORDER = ['<NbaSectionTabs', '<NbaPicks', '<NbaBrief', '<NbaGameTile', '<NbaHeadlines', '<NbaTitleRace', '<NbaPinnedTeamSection', '<NbaVideos'];

  it('renders picks, brief, games, headlines, title odds, teams, videos in that order', () => {
    const at = ORDER.map((tag) => JSX.indexOf(tag));
    at.forEach((i, n) => expect(i, `${ORDER[n]} present`).toBeGreaterThan(0));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('renders each section once', () => {
    for (const tag of ORDER) expect(JSX.split(tag).length - 1, tag).toBe(1);
  });

  it('opens with an h1 and uses the shared home layout', () => {
    expect(JSX).toMatch(/<h1 className=\{h\.title\}>NBA tonight<\/h1>/);
    expect(SRC).toMatch(/from '\.\.\/\.\.\/components\/nfl\/home\/home\.module\.css'/);
  });

  it('does not talk about the playoffs or the bracket', () => {
    expect(SRC).not.toMatch(/playoff|bracket/i);
  });

  it('includes the responsible-gaming disclaimer copy', () => {
    expect(SRC).toMatch(/For entertainment only.*bet responsibly.*21\+/i);
  });
});

describe('NbaHome — SEO metadata wiring', () => {
  it('imports SEOHead and buildOgImageUrl from the canonical helper', () => {
    expect(SRC).toMatch(/SEOHead\s*,\s*\{\s*buildOgImageUrl\s*\}\s*from\s+['"]\.\.\/\.\.\/components\/seo\/SEOHead['"]/);
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

  it('canonical path is /nba with WebPage JSON-LD and a dynamic OG image', () => {
    expect(SRC).toMatch(/canonicalPath=['"]\/nba['"]/);
    expect(SRC).toMatch(/'@type'\s*:\s*'WebPage'/);
    expect(SRC).toMatch(/url\s*:\s*['"]https:\/\/maximussports\.ai\/nba['"]/);
    expect(SRC).toMatch(/buildOgImageUrl\(\{/);
  });
});
