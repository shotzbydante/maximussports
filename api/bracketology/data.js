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

let _bypassCache = true;

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

/**
 * Infer a TBD team's seed from their opponent's seed using standard matchup order.
 * E.g., opponent seed 1 → TBD is seed 16; opponent seed 6 → TBD is seed 11.
 */
function inferMissingSeed(opponentSeed) {
  for (const [high, low] of SEED_MATCHUP_ORDER) {
    if (high === opponentSeed) return low;
    if (low === opponentSeed) return high;
  }
  return 0;
}

async function fetchESPNTournamentData() {
  const cacheKey = 'bracket-data';

  if (!_bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log('[bracketology/data] Returning cached bracket data');
      return cached;
    }
  } else {
    console.log('[bracketology/data] Cache bypass active — fetching fresh ESPN data');
  }

  const result = await coalesce(cacheKey, async () => {
    try {
      const res = await fetch(ESPN_TOURNAMENT_URL);
      if (!res.ok) {
        console.error(`[bracketology/data] ESPN returned HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      const events = data?.events || [];

      // ── PART 1: Log raw ESPN response diagnostics ──
      console.log(`[bracketology/data] ESPN RAW RESPONSE DIAGNOSTICS:`);
      console.log(`  Total events returned: ${events.length}`);
      if (events.length > 0) {
        const sample = events[0];
        const sampleComp = sample?.competitions?.[0];
        console.log(`  Sample event name: ${sample?.name || 'N/A'}`);
        console.log(`  Sample event shortName: ${sample?.shortName || 'N/A'}`);
        console.log(`  Sample has competitions: ${!!sampleComp}`);
        console.log(`  Sample competitors count: ${sampleComp?.competitors?.length || 0}`);
        console.log(`  Sample notes headline: ${sampleComp?.notes?.[0]?.headline || 'NONE'}`);
        const sampleCompetitor = sampleComp?.competitors?.[0];
        if (sampleCompetitor) {
          console.log(`  Sample team name: ${sampleCompetitor?.team?.displayName || 'N/A'}`);
          console.log(`  Sample team seed field: ${sampleCompetitor?.seed ?? 'N/A'}`);
          console.log(`  Sample team curatedRank: ${sampleCompetitor?.curatedRank?.current ?? 'N/A'}`);
        }

        const allNotes = events.map(ev => ev?.competitions?.[0]?.notes?.[0]?.headline || '').filter(Boolean);
        const uniqueNotes = [...new Set(allNotes)];
        console.log(`  Unique note headlines (${uniqueNotes.length}):`);
        for (const n of uniqueNotes.slice(0, 20)) {
          console.log(`    → "${n}"`);
        }

        const withSeeds = events.filter(ev => {
          const comps = ev?.competitions?.[0]?.competitors || [];
          return comps.some(c => extractSeed(c) > 0);
        });
        console.log(`  Events with at least one seeded team: ${withSeeds.length}`);

        const regionMentions = { East: 0, West: 0, South: 0, Midwest: 0 };
        for (const n of allNotes) {
          const nl = n.toLowerCase();
          for (const r of REGIONS) {
            if (nl.includes(r.toLowerCase())) regionMentions[r]++;
          }
        }
        console.log(`  Region mentions in notes: ${JSON.stringify(regionMentions)}`);
      }

      if (events.length === 0) {
        console.log('[bracketology/data] ESPN returned 0 events — tournament data not yet available');
        return null;
      }

      const tournamentGames = events.filter(ev => {
        const comp = ev?.competitions?.[0];
        const notes = comp?.notes;
        const headline = notes?.[0]?.headline || '';
        const hl = headline.toLowerCase();

        const hasSeededTeams = (comp?.competitors || []).some(c => extractSeed(c) > 0);

        return hl.includes('ncaa tournament') ||
               hl.includes('march madness') ||
               hl.includes('first round') ||
               hl.includes('1st round') ||
               hl.includes('second round') ||
               hl.includes('2nd round') ||
               hl.includes('round of 64') ||
               hl.includes('round of 32') ||
               hl.includes('sweet 16') ||
               hl.includes('sweet sixteen') ||
               hl.includes('elite eight') ||
               hl.includes('elite 8') ||
               hl.includes('final four') ||
               hl.includes('championship') ||
               hl.includes('first four') ||
               hl.includes("men's basketball championship") ||
               (hasSeededTeams && hl.includes('basketball'));
      });

      if (tournamentGames.length === 0) {
        console.log(`[bracketology/data] ESPN returned ${events.length} events but none matched tournament filters`);
        console.log(`[bracketology/data] Attempting broad seed-based detection...`);

        const seededGames = events.filter(ev => {
          const comps = ev?.competitions?.[0]?.competitors || [];
          const seeds = comps.map(c => extractSeed(c)).filter(s => s > 0);
          return seeds.length === 2;
        });

        if (seededGames.length > 0) {
          console.log(`[bracketology/data] Found ${seededGames.length} games with two seeded teams — using as tournament games`);
          const bracket = parseTournamentGames(seededGames);
          const validation = validateBracket(bracket);
          logValidationResult(validation);
          return bracket;
        }

        return null;
      }

      console.log(`[bracketology/data] ESPN tournament: ${tournamentGames.length} games matched out of ${events.length} total events`);
      const bracket = parseTournamentGames(tournamentGames);

      const validation = validateBracket(bracket);
      logValidationResult(validation);

      return bracket;
    } catch (err) {
      console.error('[bracketology/data] ESPN fetch error:', err.message);
      return null;
    }
  });

  if (result && !_bypassCache) cache.set(cacheKey, result);
  return result;
}

function logValidationResult(validation) {
  if (!validation.valid) {
    const warnings = validation.warnings || [];
    const criticalErrors = validation.errors || [];
    if (warnings.length > 0) {
      console.warn(`[bracketology/data] Bracket validation warnings: ${warnings.join('; ')}`);
    }
    if (criticalErrors.length > 0) {
      console.error(`[bracketology/data] Bracket validation errors: ${criticalErrors.join('; ')}`);
    }
    if (validation.critical) {
      console.error('[bracketology/data] Critical validation failure — bracket data may be unreliable');
    }
  } else {
    console.log(`[bracketology/data] Bracket validation passed — ${validation.teamCount} teams`);
  }
}

function parseTournamentGames(events) {
  const bracket = generateBlankBracket();
  bracket.status = 'field_set';

  let parsedCount = 0;
  let skippedCount = 0;
  let noRegionCount = 0;
  let noRoundCount = 0;
  const seenTeams = new Set();
  const unassignedGames = [];

  console.log(`[bracketology/data] parseTournamentGames: processing ${events.length} events`);

  for (const event of events) {
    const comp = event?.competitions?.[0];
    if (!comp) { skippedCount++; continue; }
    const competitors = comp?.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) { skippedCount++; continue; }

    const notes = comp?.notes?.[0]?.headline || '';
    let roundInfo = parseRoundFromNotes(notes);
    let regionInfo = parseRegionFromNotes(notes);

    let homeSeed = extractSeed(home);
    let awaySeed = extractSeed(away);

    // Infer missing seed for TBD/First Four winner slots
    if (homeSeed === 0 && awaySeed > 0) {
      homeSeed = inferMissingSeed(awaySeed);
    } else if (awaySeed === 0 && homeSeed > 0) {
      awaySeed = inferMissingSeed(homeSeed);
    }

    // PART 4: Fallback region detection — try competition-level fields
    if (!regionInfo) {
      regionInfo = extractRegionFromCompetition(comp, event);
    }

    // Fallback round detection for seeded first-round matchups
    if (roundInfo == null && homeSeed > 0 && awaySeed > 0) {
      const seedSum = homeSeed + awaySeed;
      if (seedSum === 17) roundInfo = 1;
      else if ([9, 13, 15, 17, 19, 21, 23, 25].includes(seedSum)) roundInfo = 1;
    }

    const homeTeam = buildTeamFromESPN(home, homeSeed, regionInfo);
    const awayTeam = buildTeamFromESPN(away, awaySeed, regionInfo);

    if (homeTeam.slug) seenTeams.add(homeTeam.slug);
    if (awayTeam.slug) seenTeams.add(awayTeam.slug);

    if (roundInfo === 1 && regionInfo) {
      const placed = placeMatchup(bracket, regionInfo, homeSeed, awaySeed, homeTeam, awayTeam, comp);
      if (placed) {
        parsedCount++;
      } else {
        console.warn(`[bracketology/data] Could not place seeds ${homeSeed}v${awaySeed} in ${regionInfo}`);
        skippedCount++;
      }
    } else if (roundInfo === 1 && !regionInfo) {
      noRegionCount++;
      unassignedGames.push({ homeSeed, awaySeed, homeTeam, awayTeam, comp, notes });
    } else if (roundInfo == null && homeSeed > 0 && awaySeed > 0 && homeSeed + awaySeed === 17) {
      noRoundCount++;
      unassignedGames.push({ homeSeed, awaySeed, homeTeam, awayTeam, comp, notes });
    } else {
      skippedCount++;
    }
  }

  // PART 4: Assign unassigned games to regions via fallback bucket strategy
  if (unassignedGames.length > 0) {
    console.log(`[bracketology/data] Attempting fallback region assignment for ${unassignedGames.length} unassigned games`);
    const assignedFromFallback = assignUnassignedGamesToRegions(bracket, unassignedGames);
    parsedCount += assignedFromFallback;
    console.log(`[bracketology/data] Fallback assignment placed ${assignedFromFallback} additional matchups`);
  }

  console.log(`[bracketology/data] Parse summary: ${parsedCount} placed, ${skippedCount} skipped, ${noRegionCount} had no region, ${noRoundCount} had no round, ${seenTeams.size} unique teams`);

  bracket.teamCount = seenTeams.size;
  bracket.lastUpdated = new Date().toISOString();

  return bracket;
}

function placeMatchup(bracket, regionInfo, homeSeed, awaySeed, homeTeam, awayTeam, comp) {
  const region = bracket.regions.find(r => r.name === regionInfo);
  if (!region) {
    console.warn(`[bracketology/data] Unknown region: "${regionInfo}"`);
    return false;
  }
  const matchup = region.matchups.find(m => {
    const [topSeed, bottomSeed] = SEED_MATCHUP_ORDER[m.position];
    return (topSeed === homeSeed && bottomSeed === awaySeed) ||
           (topSeed === awaySeed && bottomSeed === homeSeed);
  });
  if (!matchup) return false;

  if (matchup.topTeam.seed === homeSeed) {
    matchup.topTeam = homeTeam;
    matchup.bottomTeam = awayTeam;
  } else {
    matchup.topTeam = awayTeam;
    matchup.bottomTeam = homeTeam;
  }

  const status = comp?.status?.type?.name;
  if (status === 'STATUS_FINAL') {
    const homeScore = parseInt(comp?.competitors?.find(c => c.homeAway === 'home')?.score || '0', 10);
    const awayScore = parseInt(comp?.competitors?.find(c => c.homeAway === 'away')?.score || '0', 10);
    matchup.winner = homeScore > awayScore ? homeTeam.slug : awayTeam.slug;
    matchup.status = 'final';
  } else if (status === 'STATUS_IN_PROGRESS') {
    matchup.status = 'live';
  } else {
    matchup.status = 'ready';
  }

  return true;
}

/**
 * Fallback region extraction from competition data beyond just notes.
 * Priority: explicit bracket/region fields → venue → group data.
 */
function extractRegionFromCompetition(comp, event) {
  // Try competition-level bracket region fields
  if (comp?.bracketRegion) {
    const normalized = normalizeRegionName(comp.bracketRegion);
    if (normalized) return normalized;
  }
  if (comp?.region) {
    const normalized = normalizeRegionName(comp.region);
    if (normalized) return normalized;
  }

  // Try event-level fields
  if (event?.bracketRegion) {
    const normalized = normalizeRegionName(event.bracketRegion);
    if (normalized) return normalized;
  }
  if (event?.region) {
    const normalized = normalizeRegionName(event.region);
    if (normalized) return normalized;
  }

  // Try groups or bracket structure
  const groups = comp?.groups || event?.groups;
  if (Array.isArray(groups)) {
    for (const g of groups) {
      const name = g?.name || g?.shortName || '';
      const normalized = normalizeRegionName(name);
      if (normalized) return normalized;
    }
  }

  // Try event name for region hints
  const eventName = (event?.name || '').toLowerCase();
  for (const region of REGIONS) {
    if (eventName.includes(region.toLowerCase())) return region;
  }

  return null;
}

function normalizeRegionName(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower.includes('midwest')) return 'Midwest';
  if (lower.includes('west')) return 'West';
  if (lower.includes('east')) return 'East';
  if (lower.includes('south')) return 'South';
  return null;
}

/**
 * Assign games without region info to available region slots.
 * Groups by seed pairing, then fills empty slots across regions.
 */
function assignUnassignedGamesToRegions(bracket, unassignedGames) {
  let placed = 0;

  const bySeedPair = {};
  for (const game of unassignedGames) {
    const highSeed = Math.min(game.homeSeed, game.awaySeed);
    const lowSeed = Math.max(game.homeSeed, game.awaySeed);
    const key = `${highSeed}-${lowSeed}`;
    if (!bySeedPair[key]) bySeedPair[key] = [];
    bySeedPair[key].push(game);
  }

  for (const [seedKey, games] of Object.entries(bySeedPair)) {
    const [highSeed, lowSeed] = seedKey.split('-').map(Number);

    for (const game of games) {
      let targetRegion = null;
      for (const region of bracket.regions) {
        const matchup = region.matchups.find(m => {
          const [topSeed, bottomSeed] = SEED_MATCHUP_ORDER[m.position];
          return topSeed === highSeed && bottomSeed === lowSeed &&
                 m.topTeam?.isPlaceholder && m.bottomTeam?.isPlaceholder;
        });
        if (matchup) {
          targetRegion = region;
          break;
        }
      }

      if (targetRegion) {
        game.homeTeam.region = targetRegion.name;
        game.awayTeam.region = targetRegion.name;
        const didPlace = placeMatchup(bracket, targetRegion.name, game.homeSeed, game.awaySeed, game.homeTeam, game.awayTeam, game.comp);
        if (didPlace) {
          placed++;
          console.log(`[bracketology/data] Fallback: placed ${game.homeTeam.name} vs ${game.awayTeam.name} in ${targetRegion.name}`);
        }
      }
    }
  }

  return placed;
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
  if (n.includes('first round') || n.includes('1st round') || n.includes('round of 64')) return 1;
  if (n.includes('second round') || n.includes('2nd round') || n.includes('round of 32')) return 2;
  if (n.includes('sweet 16') || n.includes('sweet sixteen')) return 3;
  if (n.includes('elite eight') || n.includes('elite 8')) return 4;
  if (n.includes('final four') && !n.includes('championship')) return 5;
  if (n.includes('championship') || n.includes('national championship')) return 6;
  return null;
}

function parseRegionFromNotes(notes) {
  const n = (notes || '').toLowerCase();
  // Check "midwest" BEFORE "west" since "midwest" contains "west"
  if (n.includes('midwest')) return 'Midwest';
  if (n.includes('west')) return 'West';
  if (n.includes('east')) return 'East';
  if (n.includes('south')) return 'South';
  return null;
}

// ── PART 3: Bracket Validation — relaxed, warn-don't-fail ──────────
function validateBracket(bracket) {
  const errors = [];
  const warnings = [];
  let critical = false;

  if (!bracket || !bracket.regions) {
    return { valid: false, critical: true, errors: ['Missing bracket or regions'], warnings: [], teamCount: 0 };
  }

  if (bracket.regions.length !== 4) {
    errors.push(`Expected 4 regions, got ${bracket.regions.length}`);
    critical = true;
  }

  const allTeamSlugs = [];
  const regionNames = new Set();
  let totalMatchupsWithTeams = 0;

  for (const region of bracket.regions) {
    if (!region.name) {
      warnings.push('Region missing name');
      continue;
    }

    if (regionNames.has(region.name)) {
      warnings.push(`Duplicate region name: ${region.name}`);
    }
    regionNames.add(region.name);

    if (!region.matchups || region.matchups.length !== 8) {
      warnings.push(`Region ${region.name}: expected 8 matchups, got ${region.matchups?.length ?? 0}`);
    }

    const regionSeeds = new Set();
    for (const m of (region.matchups || [])) {
      let hasRealTeam = false;
      for (const team of [m.topTeam, m.bottomTeam]) {
        if (!team || team.isPlaceholder) continue;
        hasRealTeam = true;
        if (team.slug) {
          if (allTeamSlugs.includes(team.slug)) {
            errors.push(`Duplicate team: ${team.slug} (${team.name})`);
          }
          allTeamSlugs.push(team.slug);
        }
        if (team.seed != null) {
          if (regionSeeds.has(team.seed)) {
            warnings.push(`Region ${region.name}: duplicate seed ${team.seed}`);
          }
          regionSeeds.add(team.seed);
        }
      }
      if (hasRealTeam) totalMatchupsWithTeams++;
    }
  }

  const realTeamCount = allTeamSlugs.length;

  // CRITICAL failures only for truly broken data
  if (totalMatchupsWithTeams < 16) {
    errors.push(`Only ${totalMatchupsWithTeams} matchups with real teams (need at least 16)`);
    critical = true;
  }
  if (realTeamCount === 0) {
    errors.push('No real teams found at all');
    critical = true;
  }

  // Non-critical — just warn
  if (realTeamCount > 0 && realTeamCount < 64) {
    warnings.push(`${realTeamCount} of 64 teams populated`);
  }

  const hasDuplicateTeams = errors.some(e => e.startsWith('Duplicate team'));
  if (hasDuplicateTeams) {
    critical = true;
  }

  console.log(`[bracketology/data] Validation: ${realTeamCount} teams, ${totalMatchupsWithTeams} matchups with teams, ${errors.length} errors, ${warnings.length} warnings`);

  return {
    valid: errors.length === 0,
    critical,
    errors,
    warnings,
    teamCount: realTeamCount,
    matchupsWithTeams: totalMatchupsWithTeams,
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

      // PART 5: Accept ANY valid tournament games — no aggressive gating
      if (realTeamCount >= 1) {
        const source = realTeamCount >= 32 ? 'espn' : 'espn_partial';
        return res.status(200).json({
          bracket,
          _meta: {
            source,
            realTeamCount,
            totalExpected: 32,
            lastUpdated: bracket.lastUpdated,
            cacheBypass: _bypassCache,
          },
        });
      }

      console.warn(`[bracketology/data] ESPN data had ${realTeamCount} real teams — returning blank`);
    }

    return res.status(200).json({
      bracket: generateBlankBracket(),
      _meta: { source: 'blank', reason: bracket ? 'no_real_teams' : 'espn_unavailable' },
    });
  } catch (err) {
    console.error('[bracketology/data] Error:', err.message);
    return res.status(200).json({
      bracket: generateBlankBracket(),
      _meta: { source: 'blank', reason: 'error', error: err.message },
    });
  }
}
