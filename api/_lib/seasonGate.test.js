/**
 * Email season gating — sport emails follow the workspace season state.
 *
 * Uses injected workspace fixtures for the rules, then pins what the current
 * config means for today's sends so a seasonal flip is a conscious change.
 */

import { describe, it, expect } from 'vitest';
import { getSeasonGate, isSportSeasonCompleted, VALID_EMAIL_TYPES, EMAIL_REGISTRY } from './emailPipeline.js';
import { renderHTML, renderText } from '../../src/emails/templates/globalBriefing.js';
import { isTournamentOver } from '../../src/utils/tournamentHelpers.js';
import { isTournamentWindowClosed } from '../bracketology/data.js';

const ws = (overrides = {}) => ({
  mlb: { shortLabel: 'MLB', seasonState: 'active' },
  cbb: { shortLabel: 'NCAAM', seasonState: 'active' },
  nba: { shortLabel: 'NBA', seasonState: 'active' },
  ...overrides,
});

describe('getSeasonGate', () => {
  it('lets every email run when all sports are in season', () => {
    for (const type of VALID_EMAIL_TYPES) {
      expect(getSeasonGate(type, ws()), type).toBeNull();
    }
  });

  it('skips a sport\'s own emails once its season is completed', () => {
    const offseason = ws({ mlb: { shortLabel: 'MLB', seasonState: 'completed' } });
    for (const type of ['mlb_briefing', 'mlb_team_digest', 'mlb_picks']) {
      expect(getSeasonGate(type, offseason)).toMatchObject({ reason: 'mlb_season_completed' });
    }
    // Other sports are unaffected.
    expect(getSeasonGate('ncaam_briefing', offseason)).toBeNull();
  });

  it('skips a sport\'s emails while the workspace has emails.paused', () => {
    const paused = ws({ cbb: { shortLabel: 'NCAAM', seasonState: 'active', emails: { paused: true } } });
    expect(getSeasonGate('ncaam_picks', paused)).toMatchObject({ reason: 'ncaam_emails_paused' });
  });

  it('never gates the cross-sport global briefing', () => {
    const allOff = ws({
      mlb: { seasonState: 'completed' }, cbb: { seasonState: 'completed' }, nba: { seasonState: 'completed' },
    });
    expect(getSeasonGate('global_briefing', allOff)).toBeNull();
    expect(EMAIL_REGISTRY.global_briefing.seasonGated).toBeUndefined();
  });

  it('reports season completion per sport', () => {
    const offseason = ws({ mlb: { seasonState: 'completed' } });
    expect(isSportSeasonCompleted('mlb', offseason)).toBe(true);
    expect(isSportSeasonCompleted('ncaam', offseason)).toBe(false);
    expect(isSportSeasonCompleted('unknown', offseason)).toBe(false);
  });
});

describe('current config (November 2026)', () => {
  it('holds MLB emails for the offseason', () => {
    expect(getSeasonGate('mlb_briefing')?.reason).toBe('mlb_season_completed');
    expect(getSeasonGate('mlb_picks')?.reason).toBe('mlb_season_completed');
  });

  it('keeps NCAAM emails paused until they are switched back on', () => {
    expect(getSeasonGate('ncaam_briefing')?.reason).toBe('ncaam_emails_paused');
  });

  it('still sends the global briefing', () => {
    expect(getSeasonGate('global_briefing')).toBeNull();
  });
});

describe('global briefing without an MLB block', () => {
  const data = {
    displayName: 'Sam Example',
    mlbData: null,
    champOdds: {},
    nbaData: { narrativeParagraph: 'The Spurs stayed unbeaten at home with a wire-to-wire win. The Knicks host Portland tonight in a coin-flip game.' },
    nbaChampOdds: { sas: { bestChanceAmerican: 260 }, okc: { bestChanceAmerican: 500 } },
  };

  it('omits the MLB section and does not promise MLB in the lead line', () => {
    const html = renderHTML(data);
    expect(html).toContain('The NBA leads today’s board.');
    expect(html).not.toContain('with MLB right behind');
    expect(html).not.toContain('MLB DAILY INTELLIGENCE');
    expect(html).not.toContain('MLB PICKS SCORECARD');
  });

  it('omits the MLB section from the plain-text version', () => {
    const text = renderText(data);
    expect(text).toContain('The NBA leads today.');
    expect(text).not.toContain('⚾ MLB');
  });

  it('keeps the MLB section and original lead line when MLB has content', () => {
    const withMlb = {
      ...data,
      mlbData: { narrativeParagraph: 'The Brewers extended their division lead with a late rally. The Rays took the series opener behind seven strong innings.' },
      champOdds: { mil: { bestChanceAmerican: 450 } },
    };
    const html = renderHTML(withMlb);
    expect(html).toContain('with MLB right behind');
    expect(html).toContain('MLB DAILY INTELLIGENCE');
    expect(renderText(withMlb)).toContain('⚾ MLB');
  });
});

describe('bracket surfaces after the tournament', () => {
  it('treats the tournament as over only after its final day', () => {
    expect(isTournamentOver(new Date('2026-04-06T20:00:00Z'))).toBe(false);
    expect(isTournamentOver(new Date('2026-11-21T20:00:00Z'))).toBe(true);
  });

  it('closes the ESPN bracket window after a grace period', () => {
    expect(isTournamentWindowClosed(new Date('2026-04-20T00:00:00Z'))).toBe(false);
    expect(isTournamentWindowClosed(new Date('2026-11-21T00:00:00Z'))).toBe(true);
  });
});
