/**
 * Locks the GAME 7 fallback story-card contract:
 *   - Tied 3-3 series → score field renders "GAME 7" (state label, not
 *     a fake score-shaped "3-3")
 *   - Subtext stays "Series tied 3-3"
 *   - Title is bracket-neutral ("X and Y go to Game 7"), not the
 *     misleading "X try to close out Y"
 *   - Standard closeout (e.g. 3-1 or 3-2) keeps the original
 *     "try to close out" language and series score
 */

import { describe, it, expect } from 'vitest';
import { buildFallbackStoryCard } from './NbaDailySlide1.jsx';

function mkSeries({ topAbbr, topName, botAbbr, botName, top, bottom, isGameSeven = false, eliminationFor = 'bottom' }) {
  return {
    topTeam:    { slug: topAbbr.toLowerCase(), abbrev: topAbbr, name: topName },
    bottomTeam: { slug: botAbbr.toLowerCase(), abbrev: botAbbr, name: botName },
    seriesScore: { top, bottom, summary: top === bottom ? `Series tied ${top}-${bottom}` : `Lead ${Math.max(top,bottom)}-${Math.min(top,bottom)}` },
    isGameSeven,
    eliminationFor,
  };
}

describe('buildFallbackStoryCard — GAME 7 label for tied 3-3 series', () => {
  it('renders score="GAME 7" when series is tied 3-3', () => {
    const pc = {
      eliminationGames: [mkSeries({
        topAbbr: 'DET', topName: 'Detroit Pistons',
        botAbbr: 'ORL', botName: 'Orlando Magic',
        top: 3, bottom: 3, isGameSeven: true,
      })],
    };
    const card = buildFallbackStoryCard(pc);
    expect(card.score).toBe('GAME 7');
    expect(card.scoreIsLabel).toBe(true);
    // Title should be bracket-neutral, not "DET try to close out ORL"
    expect(card.title.toLowerCase()).not.toContain('try to close out');
    expect(card.title).toContain('Game 7');
    // Subtext keeps the actual series score for context
    expect(card.sub).toBe('Series tied 3-3');
  });

  it('renders score="GAME 7" via isGameSeven flag even when series score lookup is partial', () => {
    const pc = {
      eliminationGames: [mkSeries({
        topAbbr: 'BOS', topName: 'Boston Celtics',
        botAbbr: 'PHI', botName: 'Philadelphia 76ers',
        top: 3, bottom: 3, isGameSeven: true,
      })],
    };
    const card = buildFallbackStoryCard(pc);
    expect(card.score).toBe('GAME 7');
    expect(card.scoreIsLabel).toBe(true);
  });

  it('keeps "X try to close out Y" + score when leader has 3, trailer has fewer', () => {
    // LAL up 3-2 over HOU — standard closeout, no Game 7 yet.
    const pc = {
      eliminationGames: [mkSeries({
        topAbbr: 'LAL', topName: 'Los Angeles Lakers',
        botAbbr: 'HOU', botName: 'Houston Rockets',
        top: 3, bottom: 2, isGameSeven: false,
        eliminationFor: 'bottom', // HOU faces elim
      })],
    };
    const card = buildFallbackStoryCard(pc);
    // Standard closeout — score stays as the series number, not GAME 7.
    expect(card.score).toBe('3-2');
    expect(card.scoreIsLabel).toBeFalsy();
    expect(card.title.toLowerCase()).toContain('try to close out');
  });

  it('falls through to upset/round language when no eliminationGames exist', () => {
    const card = buildFallbackStoryCard({ eliminationGames: [], round: 'Round 1' });
    // No GAME 7 label here.
    expect(card.scoreIsLabel).toBeFalsy();
    expect(card.score).not.toBe('GAME 7');
  });
});
