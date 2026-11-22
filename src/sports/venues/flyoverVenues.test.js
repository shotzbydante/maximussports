/**
 * The flyover venue table: every US team has a postal address Google can
 * look up, and a game played away from the home stadium gets no flyover.
 */

import { describe, it, expect } from 'vitest';
import { FLYOVER_VENUES, getFlyoverVenue, flyoverVenueId, flyoverVenueForGame, usStateCode } from './flyoverVenues.js';
import { NFL_VENUES } from '../nfl/venues.js';
import { MLB_TEAMS } from '../mlb/teams.js';
import { NBA_TEAMS } from '../nba/teams.js';

describe('venue table', () => {
  it('covers every NFL team', () => {
    for (const abbrev of Object.keys(NFL_VENUES)) expect(getFlyoverVenue('nfl', abbrev), abbrev).toBeTruthy();
  });

  it('covers every MLB and NBA team except Toronto, which is outside the United States', () => {
    for (const t of MLB_TEAMS) expect(!!getFlyoverVenue('mlb', t.slug), `mlb ${t.slug}`).toBe(t.slug !== 'tor');
    for (const t of NBA_TEAMS) expect(!!getFlyoverVenue('nba', t.slug), `nba ${t.slug}`).toBe(t.slug !== 'tor');
  });

  it('gives every venue a street address ending in a state and ZIP code', () => {
    for (const [sport, table] of Object.entries(FLYOVER_VENUES)) {
      for (const [team, venue] of Object.entries(table)) {
        expect(venue.address, `${sport} ${team}`).toMatch(/^\d+ .+, [A-Za-z .]+, [A-Z]{2} \d{5}$/);
        expect(venue.state, `${sport} ${team}`).toMatch(/^[A-Z]{2}$/);
        expect(venue.name.length).toBeGreaterThan(3);
      }
    }
  });

  it('names the same stadium the weather table does for each NFL team', () => {
    const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [abbrev, v] of Object.entries(NFL_VENUES)) {
      const a = norm(getFlyoverVenue('nfl', abbrev).name);
      const b = norm(v.stadium);
      expect(a.includes(b) || b.includes(a), `${abbrev}: ${v.stadium}`).toBe(true);
    }
  });

  it('gives teams that share a stadium one venue id', () => {
    expect(flyoverVenueId(getFlyoverVenue('nfl', 'NYG'))).toBe(flyoverVenueId(getFlyoverVenue('nfl', 'NYJ')));
    expect(flyoverVenueId(getFlyoverVenue('nfl', 'LAC'))).toBe(flyoverVenueId(getFlyoverVenue('nfl', 'LAR')));
    expect(flyoverVenueId(getFlyoverVenue('nfl', 'BUF'))).not.toBe(flyoverVenueId(getFlyoverVenue('nfl', 'MIA')));
  });

  it('accepts either case for a team key', () => {
    expect(getFlyoverVenue('nfl', 'buf')?.name).toBe('Highmark Stadium');
    expect(getFlyoverVenue('nba', 'LAL')?.name).toBe('Crypto.com Arena');
    expect(getFlyoverVenue('nhl', 'bos')).toBeNull();
  });
});

describe('usStateCode', () => {
  it('reads codes and full names, and rejects anything else', () => {
    expect(usStateCode('NY')).toBe('NY');
    expect(usStateCode('new york')).toBe('NY');
    expect(usStateCode('District of Columbia')).toBe('DC');
    expect(usStateCode('Ontario')).toBeNull();
    expect(usStateCode('')).toBeNull();
  });
});

describe('flyoverVenueForGame', () => {
  const nfl = (abbrev, venue) => ({ teams: { home: { abbrev } }, venue });

  it('returns the home venue for a home game', () => {
    expect(flyoverVenueForGame('nfl', nfl('NYG', { name: 'MetLife Stadium', city: 'East Rutherford', state: 'NJ' })))
      .toEqual({ sport: 'nfl', team: 'NYG', name: 'MetLife Stadium', state: 'NJ' });
    expect(flyoverVenueForGame('mlb', { teams: { home: { slug: 'nyy' } }, venue: { city: 'Bronx', state: 'New York' } })?.team).toBe('nyy');
  });

  it('assumes a home game when the feed names no venue', () => {
    expect(flyoverVenueForGame('nba', { teams: { home: { slug: 'lal' } } })?.name).toBe('Crypto.com Arena');
    expect(flyoverVenueForGame('nba', { teams: { home: { slug: 'lal' } }, venue: { name: null, city: null, state: null, neutralSite: false } })?.team).toBe('lal');
  });

  it('shows nothing for a neutral site or a game outside the home state', () => {
    expect(flyoverVenueForGame('nfl', nfl('JAX', { name: 'Wembley Stadium', city: 'London', state: null, neutralSite: true }))).toBeNull();
    expect(flyoverVenueForGame('nfl', nfl('JAX', { name: 'Wembley Stadium', city: 'London', state: null }))).toBeNull();
    expect(flyoverVenueForGame('nba', { teams: { home: { slug: 'lal' } }, venue: { city: 'Las Vegas', state: 'NV' } })).toBeNull();
  });

  it('shows nothing for Toronto or an unknown team', () => {
    expect(flyoverVenueForGame('mlb', { teams: { home: { slug: 'tor' } } })).toBeNull();
    expect(flyoverVenueForGame('nfl', nfl(null))).toBeNull();
    expect(flyoverVenueForGame('nfl', null)).toBeNull();
  });
});
