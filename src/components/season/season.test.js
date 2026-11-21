/**
 * Season recap + countdown — pure-logic and config invariants.
 *
 * The countdown math is tested directly; the config checks make sure every
 * workspace in offseason mode carries what the recap surfaces need, so a
 * half-finished seasonal update fails here instead of rendering a blank card.
 */

import { describe, it, expect } from 'vitest';
import { getCountdownParts, parseTarget, describeCountdown, pad2 } from './countdown';
import { formatSeasonDate, shortTeamName } from './seasonFormat';
import { WORKSPACES, WORKSPACE_LIST, SeasonState, WorkspaceId, isSeasonCompleted } from '../../workspaces/config';
import { getMLBTeamBySlug } from '../../sports/mlb/teams';
import { getTeamBySlug } from '../../data/teams';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('getCountdownParts', () => {
  const target = Date.parse('2027-03-24T20:00:00-04:00');

  it('splits the remaining time into days, hours, minutes and seconds', () => {
    const now = target - (122 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND);
    expect(getCountdownParts(target, now)).toMatchObject({
      valid: true, done: false, days: 122, hours: 3, minutes: 4, seconds: 5,
    });
  });

  it('counts the last second and then reports done', () => {
    expect(getCountdownParts(target, target - 1)).toMatchObject({ done: false, days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(getCountdownParts(target, target)).toMatchObject({ done: true, totalMs: 0 });
  });

  it('never goes negative after the target has passed', () => {
    expect(getCountdownParts(target, target + 5 * DAY)).toMatchObject({
      valid: true, done: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0,
    });
  });

  it('is invalid without a usable target', () => {
    expect(getCountdownParts(null, Date.now()).valid).toBe(false);
    expect(getCountdownParts(NaN, Date.now()).valid).toBe(false);
  });
});

describe('countdown helpers', () => {
  it('parses ISO strings and Dates, and rejects junk', () => {
    expect(parseTarget('2027-03-24T20:00:00-04:00')).toBe(Date.UTC(2027, 2, 25, 0, 0, 0));
    expect(parseTarget(new Date(1000))).toBe(1000);
    expect(parseTarget('not a date')).toBeNull();
    expect(parseTarget(undefined)).toBeNull();
  });

  it('pads clock units to two digits', () => {
    expect(pad2(7)).toBe('07');
    expect(pad2(12)).toBe('12');
  });

  it('describes the remaining time for screen readers', () => {
    expect(describeCountdown({ valid: true, done: false, days: 1, hours: 2, minutes: 1 })).toBe('1 day, 2 hours, 1 minute');
    expect(describeCountdown({ valid: true, done: true })).toBe('under way');
    expect(describeCountdown({ valid: false })).toBe('');
  });
});

describe('season formatting', () => {
  it('formats calendar dates without time-zone drift', () => {
    expect(formatSeasonDate('2026-10-28')).toBe('October 28, 2026');
    expect(formatSeasonDate('2026-04-06')).toBe('April 6, 2026');
    expect(formatSeasonDate('')).toBe('');
    expect(formatSeasonDate('2026-13-01')).toBe('');
  });

  it('shortens team names for status lines', () => {
    expect(shortTeamName('Milwaukee Brewers')).toBe('Brewers');
    expect(shortTeamName('Boston Red Sox')).toBe('Red Sox');
    expect(shortTeamName('')).toBe('');
  });
});

describe('workspace season config', () => {
  it('uses a known season state for every workspace', () => {
    for (const ws of WORKSPACE_LIST) {
      expect(Object.values(SeasonState), ws.id).toContain(ws.seasonState);
    }
  });

  it('gives every completed workspace a champion, recap and countdown target', () => {
    const completed = WORKSPACE_LIST.filter((ws) => ws.seasonState === SeasonState.COMPLETED);
    for (const ws of completed) {
      expect(ws.championship?.champion, `${ws.id} champion`).toBeTruthy();
      expect(ws.championship?.runnerUp, `${ws.id} runner-up`).toBeTruthy();
      expect(ws.championship?.score, `${ws.id} score`).toBeTruthy();
      expect(ws.recap?.paragraphs?.length, `${ws.id} recap`).toBeGreaterThan(0);
      expect(parseTarget(ws.nextSeason?.firstGameAt), `${ws.id} next season`).not.toBeNull();
      expect(ws.nextSeason?.label, `${ws.id} next season label`).toBeTruthy();
    }
  });

  it('keeps recap facts and honors labelled uniquely (they are React keys)', () => {
    for (const ws of WORKSPACE_LIST) {
      for (const list of [ws.recap?.facts, ws.recap?.honors]) {
        if (!list) continue;
        const labels = list.map((i) => i.label);
        expect(new Set(labels).size, ws.id).toBe(labels.length);
      }
    }
  });

  it('MLB is in offseason mode with the 2026 champion and a 2027 opener', () => {
    const mlb = WORKSPACES[WorkspaceId.MLB];
    expect(isSeasonCompleted(WorkspaceId.MLB)).toBe(true);
    expect(mlb.championship.year).toBe(2026);
    expect(getMLBTeamBySlug(mlb.championship.championSlug)?.name).toBe(mlb.championship.champion);
    expect(getMLBTeamBySlug(mlb.championship.runnerUpSlug)?.name).toBe(mlb.championship.runnerUp);
    // The opener falls after the season that just ended.
    expect(parseTarget(mlb.nextSeason.firstGameAt)).toBeGreaterThan(Date.parse(`${mlb.championship.decidedOn}T00:00:00Z`));
    expect(new Date(mlb.nextSeason.firstGameAt).getUTCFullYear()).toBe(mlb.nextSeason.year);
  });

  it('NCAAM is in season and still names last season\'s champion', () => {
    const cbb = WORKSPACES[WorkspaceId.CBB];
    expect(cbb.seasonState).toBe(SeasonState.ACTIVE);
    expect(getTeamBySlug(cbb.championship.championSlug)?.name).toBe(cbb.championship.champion);
    expect(getTeamBySlug(cbb.championship.runnerUpSlug)?.name).toBe(cbb.championship.runnerUp);
    expect(cbb.recap.paragraphs.length).toBeGreaterThan(0);
  });
});
