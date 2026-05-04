/**
 * Unit tests for assembleNbaEmailData.
 *
 * Focuses on the picks + scorecard adapter — when buildNbaPicksBoard()
 * returns a populated board with a graded scorecardSummary, the assembler
 * MUST surface real picks AND a real W/L/P record. When the canonical
 * source has no graded slate yet, scorecard MUST stay null (the template
 * renders the compact placeholder, not a fabricated record).
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mock external IO so the test stays hermetic.
vi.mock('../_globalCache.js', () => ({
  getJson: vi.fn(async () => null),
  setJson: vi.fn(async () => true),
}));
vi.mock('./nbaPicksBuilder.js', () => ({
  buildNbaPicksBoard: vi.fn(),
}));
vi.mock('./emailDateContext.js', async () => {
  const actual = await vi.importActual('./emailDateContext.js');
  return {
    ...actual,
    resolveEmailDateContext: vi.fn(() => ({
      sendDate: '2026-05-03',
      yesterdayDate: '2026-05-02',
      sportsDataDate: '20260502',
      timezone: 'America/Los_Angeles',
      briefingDateLabel: 'Sunday, May 3',
    })),
  };
});

// Stub global fetch so the assembler's HTTP fallbacks return empty without
// hitting the network.
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ headlines: [], board: [] }),
  }));
});

import { buildNbaPicksBoard } from './nbaPicksBuilder.js';
import { assembleNbaEmailData } from './nbaEmailData.js';

const SAMPLE_BOARD = {
  sport: 'nba',
  date: '2026-05-03',
  categories: {
    pickEms: [{ id: 'p1', matchup: { awayTeam: { slug: 'bos' }, homeTeam: { slug: 'nyk' } }, pick: { label: 'BOS -135' }, confidenceScore: 0.86 }],
    ats: [{ id: 'a1', matchup: { awayTeam: { slug: 'okc' }, homeTeam: { slug: 'min' } }, pick: { label: 'OKC -3.5' }, confidenceScore: 0.81 }],
    leans: [],
    totals: [],
  },
  scorecardSummary: {
    date: '2026-05-02',
    overall: { won: 2, lost: 1, push: 0, pending: 0 },
    byMarket: {
      moneyline: { won: 1, lost: 0, push: 0, pending: 0 },
      spread: { won: 1, lost: 0, push: 0, pending: 0 },
      total: { won: 0, lost: 1, push: 0, pending: 0 },
    },
    topPlayResult: { status: 'won', pickLabel: 'BOS -135' },
    streak: 'W2',
    note: null,
    isFallback: false,
  },
};

describe('assembleNbaEmailData: canonical picks + scorecard', () => {
  it('returns picksBoard, picksScorecard, and source diagnostics when includePicks=true', async () => {
    buildNbaPicksBoard.mockResolvedValueOnce({
      board: SAMPLE_BOARD,
      source: 'fresh',
      counts: { pickEms: 1, ats: 1, leans: 0, totals: 0, total: 2 },
    });

    const data = await assembleNbaEmailData('https://maximussports.ai', { includePicks: true, includeSummary: false });

    expect(data.picksBoard).toBeTruthy();
    expect(data.picksBoard.categories.pickEms).toHaveLength(1);
    expect(data.picksBoard.categories.ats).toHaveLength(1);
    expect(data.picksSource).toBe('picks:fresh');
    expect(data.picksCounts.total).toBe(2);

    // Scorecard adapted from the canonical scorecardSummary
    expect(data.picksScorecard).toBeTruthy();
    expect(data.picksScorecard.wins).toBe(2);
    expect(data.picksScorecard.losses).toBe(1);
    expect(data.picksScorecard.pushes).toBe(0);
    expect(data.picksScorecard.summary).toBe('Top Play cashed');
    expect(data.picksScorecard.topPickResult.status).toBe('won');
    expect(data.scorecardSource).toBe('picks_history:yesterday');
  });

  it('marks scorecard as fallback_slate when board has scorecard for an older slate', async () => {
    buildNbaPicksBoard.mockResolvedValueOnce({
      board: {
        ...SAMPLE_BOARD,
        scorecardSummary: { ...SAMPLE_BOARD.scorecardSummary, isFallback: true },
      },
      source: 'fresh',
      counts: { pickEms: 1, ats: 1, leans: 0, totals: 0, total: 2 },
    });

    const data = await assembleNbaEmailData('https://maximussports.ai', { includePicks: true, includeSummary: false });
    expect(data.picksScorecard.isFallback).toBe(true);
    expect(data.scorecardSource).toBe('picks_history:fallback_slate');
  });

  it('returns null scorecard when no graded history exists yet (no fake record)', async () => {
    buildNbaPicksBoard.mockResolvedValueOnce({
      board: { ...SAMPLE_BOARD, scorecardSummary: null },
      source: 'fresh',
      counts: { pickEms: 1, ats: 1, leans: 0, totals: 0, total: 2 },
    });

    const data = await assembleNbaEmailData('https://maximussports.ai', { includePicks: true, includeSummary: false });
    expect(data.picksScorecard).toBeNull();
    expect(data.scorecardSource).toBe('no_graded_history');
  });

  it('does not call buildNbaPicksBoard when includePicks=false', async () => {
    buildNbaPicksBoard.mockClear();
    const data = await assembleNbaEmailData('https://maximussports.ai', { includePicks: false, includeSummary: false });
    expect(buildNbaPicksBoard).not.toHaveBeenCalled();
    expect(data.picksBoard).toBeNull();
    expect(data.picksScorecard).toBeNull();
    expect(data.picksSource).toBe('not_requested');
    expect(data.scorecardSource).toBe('missing');
  });

  it('handles builder failure gracefully — picks null, source=picks:error, no fake scorecard', async () => {
    buildNbaPicksBoard.mockRejectedValueOnce(new Error('builder boom'));
    const data = await assembleNbaEmailData('https://maximussports.ai', { includePicks: true, includeSummary: false });
    expect(data.picksBoard).toBeNull();
    expect(data.picksSource).toBe('picks:error');
    expect(data.picksScorecard).toBeNull();
  });

  it('passes through KV-fallback source labels (kv_latest, kv_lastknown, empty)', async () => {
    buildNbaPicksBoard.mockResolvedValueOnce({
      board: SAMPLE_BOARD,
      source: 'kv_latest',
      counts: { pickEms: 1, ats: 1, leans: 0, totals: 0, total: 2 },
    });
    const data = await assembleNbaEmailData('https://maximussports.ai', { includePicks: true, includeSummary: false });
    expect(data.picksSource).toBe('picks:kv_latest');
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
