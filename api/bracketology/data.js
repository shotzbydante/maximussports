/**
 * GET /api/bracketology/data
 *
 * Returns the 2026 NCAA tournament bracket structure.
 * Fetches from ESPN tournament API when available, falls back to blank
 * bracket shell for pre-Selection Sunday state.
 *
 * This is the CANONICAL source of official bracket truth for the entire app.
 * All downstream surfaces (Bracketology page, Content Studio, emails,
 * tournamentHelpers) must ultimately derive from this data.
 */

import { createCache, coalesce } from '../_cache.js';

const ESPN_TOURNAMENT_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&dates=20260301-20260410&limit=100';
const CACHE_MS = 5 * 60 * 1000;
const cache = createCache(CACHE_MS);

const REGIONS = ['East', 'West', 'South', 'Midwest'];
const SEED_MATCHUP_ORDER = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

function getTeamSlugFromName(name) {
  if (!name) return null;
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
}

function buildPlaceholderTeam(seed, region) {
  return {
    teamId: null, name: null, shortName: null,
    slug: null, seed, logo: null, record: null,
    region, isPlaceholder: true,
  };
}

function generateBlankBracket() {
  const regions = REGIONS.map((regionName) => {
    const matchups = SEED_MATCHUP_ORDER.map(([topSeed, bottomSeed], idx) => ({
      matchupId: `r1-${regionName.toLowerCase()}-${idx}`,
      round: 1, region: regionName, position: idx,
      topTeam: buildPlaceholderTeam(topSeed, regionName),
      bottomTeam: buildPlaceholderTeam(bottomSeed, regionName),
      winner: null, status: 'pending',
    }));
    return { name: regionName, matchups };
  });

  return {
    year: 2026, status: 'pre_selection', regions,
    finalFour: [
      { matchupId: 'ff-1', round: 5, topTeam: null, bottomTeam: null, winner: null, status: 'pending', regionMatchup: `${REGIONS[0]} vs ${REGIONS[1]}` },
      { matchupId: 'ff-2', round: 5, topTeam: null, bottomTeam: null, winner: null, status: 'pending', regionMatchup: `${REGIONS[2]} vs ${REGIONS[3]}` },
    ],
    championship: { matchupId: 'champ', round: 6, topTeam: null, bottomTeam: null, winner: null, status: 'pending' },
    lastUpdated: new Date().toISOString(),
  };
}

// ── ESPN seed extraction ──────────────────────────────────────────
// ESPN stores tournament seeds in multiple possible locations depending
// on the stage of the tournament. Try them in priority order.
function extractSeed(competitor) {
  const curatedRank = competitor?.curatedRank?.current;
  if (curatedRank != null && curatedRank >= 1 && curatedRank <= 16) {
    return curatedRank;
  }
  const seedField = competitor?.seed;
  if (seedField != null) {
    const parsed = parseInt(String(seedField), 10);
    if (parsed >= 1 && parsed <= 16) return parsed;
  }
  const linescores = competitor?.linescores;
  if (Array.isArray(linescores)) {
    for (const ls of linescores) {
      if (ls?.seed != null) {
        const parsed = parseInt(String(ls.seed), 10);
        if (parsed >= 1 && parsed <= 16) return parsed;
      }
    }
  }
  return 0;
}

async function fetchESPNTournamentData() {
  const cacheKey = 'bracket-data';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const result = await coalesce(cacheKey, async () => {
    try {
      const res = await fetch(ESPN_TOURNAMENT_URL);
      if (!res.ok) {
        console.error(`[bracketology/data] ESPN returned HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      const events = data?.events || [];

      if (events.length === 0) {
        console.log('[bracketology/data] ESPN returned 0 events — tournament data not yet available');
        return null;
      }

      const tournamentGames = events.filter(ev => {
        const notes = ev?.competitions?.[0]?.notes;
        const headline = notes?.[0]?.headline || '';
        const hl = headline.toLowerCase();
        return hl.includes('ncaa tournament') ||
               hl.includes('march madness') ||
               hl.includes('first round') ||
               hl.includes('second round') ||
               hl.includes('round of 64') ||
               hl.includes('round of 32') ||
               hl.includes('sweet 16') ||
               hl.includes('sweet sixteen') ||
               hl.includes('elite eight') ||
               hl.includes('elite 8') ||
               hl.includes('final four') ||
               hl.includes('championship') ||
               hl.includes('first four') ||
               hl.includes("men's basketball championship");
      });

      if (tournamentGames.length === 0) {
        console.log(`[bracketology/data] ESPN returned ${events.length} events but none matched tournament filters`);
        return null;
      }

      console.log(`[bracketology/data] ESPN tournament: ${tournamentGames.length} games matched out of ${events.length} total events`);
      const bracket = parseTournamentGames(tournamentGames);

      const validation = validateBracket(bracket);
      if (!validation.valid) {
        console.error(`[bracketology/data] Bracket validation failed: ${validation.errors.join('; ')}`);
        if (validation.critical) {
          console.error('[bracketology/data] Critical validation failure — bracket data is unreliable');
        }
      }

      return bracket;
    } catch (err) {
      console.error('[bracketology/data] ESPN fetch error:', err.message);
      return null;
    }
  });

  if (result) cache.set(cacheKey, result);
  return result;
}

function parseTournamentGames(events) {
  const bracket = generateBlankBracket();
  bracket.status = 'field_set';

  let parsedCount = 0;
  let skippedCount = 0;
  const seenTeams = new Set();

  for (const event of events) {
    const comp = event?.competitions?.[0];
    if (!comp) { skippedCount++; continue; }
    const competitors = comp?.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) { skippedCount++; continue; }

    // Parse notes/headline FIRST (before using regionInfo)
    const notes = comp?.notes?.[0]?.headline || '';
    const roundInfo = parseRoundFromNotes(notes);
    const regionInfo = parseRegionFromNotes(notes);

    const homeSeed = extractSeed(home);
    const awaySeed = extractSeed(away);
    const homeTeam = buildTeamFromESPN(home, homeSeed, regionInfo);
    const awayTeam = buildTeamFromESPN(away, awaySeed, regionInfo);

    if (homeTeam.slug) seenTeams.add(homeTeam.slug);
    if (awayTeam.slug) seenTeams.add(awayTeam.slug);

    if (roundInfo === 1 && regionInfo) {
      const region = bracket.regions.find(r => r.name === regionInfo);
      if (region) {
        const matchup = region.matchups.find(m => {
          const [topSeed, bottomSeed] = SEED_MATCHUP_ORDER[m.position];
          return (topSeed === homeSeed && bottomSeed === awaySeed) ||
                 (topSeed === awaySeed && bottomSeed === homeSeed);
        });
        if (matchup) {
          if (matchup.topTeam.seed === homeSeed) {
            matchup.topTeam = homeTeam;
            matchup.bottomTeam = awayTeam;
          } else {
            matchup.topTeam = awayTeam;
            matchup.bottomTeam = homeTeam;
          }

          const status = comp?.status?.type?.name;
          if (status === 'STATUS_FINAL') {
            const homeScore = parseInt(home?.score || '0', 10);
            const awayScore = parseInt(away?.score || '0', 10);
            matchup.winner = homeScore > awayScore ? homeTeam.slug : awayTeam.slug;
            matchup.status = 'final';
          } else if (status === 'STATUS_IN_PROGRESS') {
            matchup.status = 'live';
          } else {
            matchup.status = 'ready';
          }

          parsedCount++;
        } else {
          console.warn(`[bracketology/data] No matchup slot for seeds ${homeSeed}v${awaySeed} in ${regionInfo}`);
          skippedCount++;
        }
      } else {
        console.warn(`[bracketology/data] Unknown region from ESPN notes: "${regionInfo}"`);
        skippedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`[bracketology/data] Parsed ${parsedCount} matchups, skipped ${skippedCount}, unique teams: ${seenTeams.size}`);

  bracket.teamCount = seenTeams.size;
  bracket.lastUpdated = new Date().toISOString();

  return bracket;
}

function buildTeamFromESPN(competitor, seed, region) {
  const team = competitor?.team || {};
  const name = team.displayName || team.shortDisplayName || 'TBD';
  return {
    teamId: team.id ? String(team.id) : null,
    name,
    shortName: team.shortDisplayName || team.abbreviation || name,
    slug: getTeamSlugFromName(name),
    seed: seed || null,
    logo: team.logo || (team.id ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png` : null),
    record: competitor?.records?.[0]?.summary || null,
    region: region || null,
    conference: team.conferenceId ? undefined : undefined,
    isPlaceholder: false,
    isFirstFour: seed === 16 && (competitor?.notes?.[0]?.headline || '').toLowerCase().includes('first four'),
  };
}

function parseRoundFromNotes(notes) {
  const n = (notes || '').toLowerCase();
  if (n.includes('first four')) return 0;
  if (n.includes('first round') || n.includes('round of 64')) return 1;
  if (n.includes('second round') || n.includes('round of 32')) return 2;
  if (n.includes('sweet 16') || n.includes('sweet sixteen')) return 3;
  if (n.includes('elite eight') || n.includes('elite 8')) return 4;
  if (n.includes('final four') && !n.includes('championship')) return 5;
  if (n.includes('championship') || n.includes('national championship')) return 6;
  return null;
}

function parseRegionFromNotes(notes) {
  const n = (notes || '').toLowerCase();
  for (const region of REGIONS) {
    if (n.includes(region.toLowerCase())) return region;
  }
  return null;
}

// ── Bracket Validation ──────────────────────────────────────────────
function validateBracket(bracket) {
  const errors = [];
  let critical = false;

  if (!bracket || !bracket.regions) {
    return { valid: false, critical: true, errors: ['Missing bracket or regions'] };
  }

  if (bracket.regions.length !== 4) {
    errors.push(`Expected 4 regions, got ${bracket.regions.length}`);
    critical = true;
  }

  const allTeamSlugs = [];
  const regionNames = new Set();

  for (const region of bracket.regions) {
    if (!region.name) {
      errors.push('Region missing name');
      critical = true;
      continue;
    }

    if (regionNames.has(region.name)) {
      errors.push(`Duplicate region name: ${region.name}`);
      critical = true;
    }
    regionNames.add(region.name);

    if (!region.matchups || region.matchups.length !== 8) {
      errors.push(`Region ${region.name}: expected 8 matchups, got ${region.matchups?.length ?? 0}`);
    }

    const regionSeeds = new Set();
    for (const m of (region.matchups || [])) {
      for (const team of [m.topTeam, m.bottomTeam]) {
        if (!team || team.isPlaceholder) continue;
        if (team.slug) {
          if (allTeamSlugs.includes(team.slug)) {
            errors.push(`Duplicate team: ${team.slug} (${team.name})`);
          }
          allTeamSlugs.push(team.slug);
        }
        if (team.seed != null) {
          if (regionSeeds.has(team.seed)) {
            errors.push(`Region ${region.name}: duplicate seed ${team.seed}`);
          }
          regionSeeds.add(team.seed);
        }
      }
    }
  }

  const realTeamCount = allTeamSlugs.length;
  if (realTeamCount > 0 && realTeamCount < 32) {
    errors.push(`Only ${realTeamCount} real teams found (expected 64 for full bracket)`);
  }

  return {
    valid: errors.length === 0,
    critical,
    errors,
    teamCount: realTeamCount,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bracket = await fetchESPNTournamentData();
    if (bracket) {
      const realTeamCount = bracket.regions.reduce((sum, r) =>
        sum + r.matchups.filter(m => !m.topTeam?.isPlaceholder && m.topTeam?.slug).length, 0);

      if (realTeamCount >= 16) {
        return res.status(200).json({
          bracket,
          _meta: {
            source: 'espn',
            realTeamCount,
            lastUpdated: bracket.lastUpdated,
          },
        });
      }

      console.warn(`[bracketology/data] ESPN data had only ${realTeamCount} real teams — below threshold`);
    }

    return res.status(200).json({
      bracket: generateBlankBracket(),
      _meta: { source: 'blank', reason: bracket ? 'insufficient_teams' : 'espn_unavailable' },
    });
  } catch (err) {
    console.error('[bracketology/data] Error:', err.message);
    return res.status(200).json({
      bracket: generateBlankBracket(),
      _meta: { source: 'blank', reason: 'error', error: err.message },
    });
  }
}
