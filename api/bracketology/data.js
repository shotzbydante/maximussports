/**
 * GET /api/bracketology/data
 *
 * Returns the 2026 NCAA tournament bracket structure.
 * Fetches from ESPN tournament API when available, falls back to blank
 * bracket shell for pre-Selection Sunday state.
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

async function fetchESPNTournamentData() {
  const cacheKey = 'bracket-data';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const result = await coalesce(cacheKey, async () => {
    try {
      const res = await fetch(ESPN_TOURNAMENT_URL);
      if (!res.ok) return null;
      const data = await res.json();
      const events = data?.events || [];

      if (events.length === 0) return null;

      const tournamentGames = events.filter(ev => {
        const notes = ev?.competitions?.[0]?.notes;
        const headline = notes?.[0]?.headline || '';
        return headline.toLowerCase().includes('ncaa tournament') ||
               headline.toLowerCase().includes('march madness') ||
               headline.toLowerCase().includes('first round') ||
               headline.toLowerCase().includes('second round') ||
               headline.toLowerCase().includes('sweet 16') ||
               headline.toLowerCase().includes('elite eight') ||
               headline.toLowerCase().includes('final four') ||
               headline.toLowerCase().includes('championship');
      });

      if (tournamentGames.length === 0) return null;

      return parseTournamentGames(tournamentGames);
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

  for (const event of events) {
    const comp = event?.competitions?.[0];
    if (!comp) continue;
    const competitors = comp?.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) continue;

    const homeSeed = parseInt(home?.curatedRank?.current || home?.seed || '0', 10);
    const awaySeed = parseInt(away?.curatedRank?.current || away?.seed || '0', 10);
    const homeTeam = buildTeamFromESPN(home, homeSeed);
    const awayTeam = buildTeamFromESPN(away, awaySeed);

    const notes = comp?.notes?.[0]?.headline || '';
    const roundInfo = parseRoundFromNotes(notes);
    const regionInfo = parseRegionFromNotes(notes);

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
        }
      }
    }
  }

  return bracket;
}

function buildTeamFromESPN(competitor, seed) {
  const team = competitor?.team || {};
  const name = team.displayName || team.shortDisplayName || 'TBD';
  return {
    teamId: team.id ? String(team.id) : null,
    name,
    shortName: team.shortDisplayName || team.abbreviation || name,
    slug: getTeamSlugFromName(name),
    seed: seed || null,
    logo: team.logo || `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png`,
    record: competitor?.records?.[0]?.summary || null,
    region: null,
    isPlaceholder: false,
  };
}

function parseRoundFromNotes(notes) {
  const n = (notes || '').toLowerCase();
  if (n.includes('first round') || n.includes('round of 64')) return 1;
  if (n.includes('second round') || n.includes('round of 32')) return 2;
  if (n.includes('sweet 16') || n.includes('sweet sixteen')) return 3;
  if (n.includes('elite eight') || n.includes('elite 8')) return 4;
  if (n.includes('final four')) return 5;
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bracket = await fetchESPNTournamentData();
    if (bracket) {
      return res.status(200).json({ bracket });
    }
    return res.status(200).json({ bracket: generateBlankBracket() });
  } catch (err) {
    console.error('[bracketology/data] Error:', err.message);
    return res.status(200).json({ bracket: generateBlankBracket() });
  }
}
