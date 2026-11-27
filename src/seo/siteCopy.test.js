import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SITE, VALUE_PROPS, FAQ, ASK, KEY_PAGES, llmsTxt, siteJsonLd } from './siteCopy.js';
import { ASK_EXAMPLES } from './askExamples.js';
import { syncShell } from '../../scripts/seo-sync.mjs';
import { renderNflPicks, publicPicks } from '../../api/seo/nfl-picks.js';
import { renderAbout } from '../../api/seo/about.js';
import { renderAskMaximus } from '../../api/seo/ask-maximus.js';

const root = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const everything = () => [SITE.title, SITE.description, ...VALUE_PROPS.flatMap((v) => [v.title, v.body]), ASK.lede, ASK.limits,
  ...ASK.journeys.flatMap((j) => [j.step, j.ask, j.get]), ...FAQ.flatMap((f) => [f.q, f.a])].join('\n');

describe('site copy', () => {
  it('fits a search result: title under 60 characters, description under 240', () => {
    expect(SITE.title.length).toBeLessThanOrEqual(60);
    expect(SITE.description.length).toBeLessThanOrEqual(240);
  });

  it('names what people search for', () => {
    const text = everything().toLowerCase();
    for (const term of ['nfl picks', 'against the spread', 'over/under', 'moneyline', 'prediction market', 'sports betting', 'ask maximus', 'ai assistant']) {
      expect(text).toContain(term);
    }
  });

  it('promises nothing and gives away no method', () => {
    const text = everything();
    // "Lock" is fine as the verb for fixing a price; never as a noun for a sure thing.
    expect(text).not.toMatch(/\b(our locks?|a lock\b|lock of the|guaranteed?|free money|sure thing|can’t lose|risk-free)/i);
    expect(text).not.toMatch(/\b(wind|threshold|weights?|Madden|PFF|no-vig|devig)\b/i);
  });

  it('says plainly that it does not show prediction-market prices', () => {
    expect(FAQ.find((f) => /prediction markets/.test(f.q)).a).toMatch(/does not show prediction-market prices/);
  });

  it('index.html and llms.txt are in step with it (run node scripts/seo-sync.mjs)', () => {
    const html = read('index.html');
    expect(syncShell(html)).toBe(html);
    expect(read('public/llms.txt')).toBe(llmsTxt());
    expect(html).not.toMatch(/college basketball betting intelligence/i);
    expect(html).not.toMatch(/rel="canonical"/);
  });

  it('carries the questions in structured data only where a page shows them', () => {
    const types = (g) => g['@graph'].map((n) => n['@type']);
    expect(types(siteJsonLd())).toContain('FAQPage');
    expect(types(siteJsonLd({ faq: false }))).not.toContain('FAQPage');
  });

  it('lists every plain-HTML page it tells agents about in vercel.json', () => {
    const rewrites = JSON.parse(read('vercel.json')).rewrites.map((r) => r.source);
    for (const p of ['/nfl-picks', '/ask-maximus', '/about']) {
      expect(KEY_PAGES.map((k) => k.path)).toContain(p);
      expect(rewrites).toContain(p);
    }
  });
});

describe('plain-HTML pages', () => {
  const T = (h) => new Date(Date.UTC(2026, 10, 26, 18) + h * 3600e3).toISOString();
  const team = (shortName, name) => ({ shortName, name });
  const m = (h) => ({ startTime: T(h), awayTeam: team('KC', 'Kansas City Chiefs'), homeTeam: team('BUF', 'Buffalo Bills') });
  const hero = {
    id: 'g1-total', gameId: 'g1', market: { type: 'total', line: 47.5, priceAmerican: -109 }, conviction: { score: 71 },
    selection: { side: 'under', label: 'Under 47.5', priceLabel: '-109 at BetRivers' }, matchup: m(7),
    why: 'SECRET reason sentence', whyShort: 'SECRET short', lock: { lockedAt: T(-30) },
  };
  const lean = { id: 'g1-ml', gameId: 'g1', market: { type: 'moneyline' }, conviction: { score: 25 }, selection: { side: 'home', label: 'BUF -160', priceLabel: '-160 at FanDuel' }, matchup: m(7) };
  const board = {
    week: 12, generatedAt: T(-1), tiers: { tier2: [hero] }, fullSlatePicks: [hero, lean],
    byGame: [{ gameId: 'g1', ...m(7), market: { spreadHome: -3, total: 46.5, fairHomeWin: 0.6 } }, { gameId: 'old', ...m(-5), market: {} }],
  };
  const now = Date.parse(T(0));

  it('NFL picks: the pick, its price and book, the schedule, and no reasons', () => {
    const html = renderNflPicks(board, { now });
    expect(html).toContain('<h1>NFL picks for Week 12</h1>');
    expect(html).toContain('Under 47.5');
    expect(html).toContain('-109 at BetRivers');
    expect(html).toContain('Kansas City Chiefs at Buffalo Bills');
    expect(html).toContain('BUF -3');
    expect(html).toContain('rel="canonical" href="https://maximussports.ai/nfl-picks"');
    expect(html).not.toContain('SECRET');
    expect(html).not.toMatch(/0\.6\b/);
    expect(publicPicks(board, { now }).games).toHaveLength(1);
  });

  it('NFL picks: still a page when there is no board or no pick', () => {
    expect(renderNflPicks(null)).toContain('No price clears the bar');
    expect(renderNflPicks({ ...board, tiers: {} }, { now })).toContain('Top leans');
  });

  it('About and Ask Maximus state the same facts, with the real examples', () => {
    const about = renderAbout();
    for (const v of VALUE_PROPS) expect(about).toContain(v.title.replace(/’/g, '’'));
    expect(about).toContain('"@type":"FAQPage"');
    const ask = renderAskMaximus();
    for (const e of ASK_EXAMPLES) expect(ask).toContain(e.q);
    expect(ask).toContain('/brand/ask/ask-game.webp');
    for (const k of ['game', 'pick', 'results']) expect(fs.existsSync(path.join(root, `public/brand/ask/ask-${k}.webp`))).toBe(true);
  });
});
