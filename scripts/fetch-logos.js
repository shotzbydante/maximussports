#!/usr/bin/env node
/**
 * Fetch team logos from ESPN CDN; generate fallback SVGs for teams without matches.
 * Run: npm run fetch-logos
 * Output: public/logos/<slug>.png (fetched) or public/logos/<slug>.svg (fallback)
 * Use --force to re-fetch/replace existing logos.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGOS_DIR = join(ROOT, 'public', 'logos');

const TEAMS = [
  { slug: 'michigan-wolverines', name: 'Michigan Wolverines' },
  { slug: 'purdue-boilermakers', name: 'Purdue Boilermakers' },
  { slug: 'illinois-fighting-illini', name: 'Illinois Fighting Illini' },
  { slug: 'nebraska-cornhuskers', name: 'Nebraska Cornhuskers' },
  { slug: 'michigan-state-spartans', name: 'Michigan State Spartans' },
  { slug: 'wisconsin-badgers', name: 'Wisconsin Badgers' },
  { slug: 'iowa-hawkeyes', name: 'Iowa Hawkeyes' },
  { slug: 'indiana-hoosiers', name: 'Indiana Hoosiers' },
  { slug: 'ohio-state-buckeyes', name: 'Ohio State Buckeyes' },
  { slug: 'ucla-bruins', name: 'UCLA Bruins' },
  { slug: 'usc-trojans', name: 'USC Trojans' },
  { slug: 'washington-huskies', name: 'Washington Huskies' },
  { slug: 'florida-gators', name: 'Florida Gators' },
  { slug: 'vanderbilt-commodores', name: 'Vanderbilt Commodores' },
  { slug: 'alabama-crimson-tide', name: 'Alabama Crimson Tide' },
  { slug: 'arkansas-razorbacks', name: 'Arkansas Razorbacks' },
  { slug: 'tennessee-volunteers', name: 'Tennessee Volunteers' },
  { slug: 'kentucky-wildcats', name: 'Kentucky Wildcats' },
  { slug: 'georgia-bulldogs', name: 'Georgia Bulldogs' },
  { slug: 'texas-longhorns', name: 'Texas Longhorns' },
  { slug: 'texas-am-aggies', name: 'Texas A&M Aggies' },
  { slug: 'auburn-tigers', name: 'Auburn Tigers' },
  { slug: 'missouri-tigers', name: 'Missouri Tigers' },
  { slug: 'oklahoma-sooners', name: 'Oklahoma Sooners' },
  { slug: 'lsu-tigers', name: 'LSU Tigers' },
  { slug: 'duke-blue-devils', name: 'Duke Blue Devils' },
  { slug: 'virginia-cavaliers', name: 'Virginia Cavaliers' },
  { slug: 'louisville-cardinals', name: 'Louisville Cardinals' },
  { slug: 'north-carolina-tar-heels', name: 'North Carolina Tar Heels' },
  { slug: 'nc-state-wolfpack', name: 'NC State Wolfpack' },
  { slug: 'clemson-tigers', name: 'Clemson Tigers' },
  { slug: 'miami-hurricanes', name: 'Miami Hurricanes' },
  { slug: 'smu-mustangs', name: 'SMU Mustangs' },
  { slug: 'virginia-tech-hokies', name: 'Virginia Tech Hokies' },
  { slug: 'california-golden-bears', name: 'California Golden Bears' },
  { slug: 'stanford-cardinal', name: 'Stanford Cardinal' },
  { slug: 'wake-forest-demon-deacons', name: 'Wake Forest Demon Deacons' },
  { slug: 'syracuse-orange', name: 'Syracuse Orange' },
  { slug: 'arizona-wildcats', name: 'Arizona Wildcats' },
  { slug: 'houston-cougars', name: 'Houston Cougars' },
  { slug: 'iowa-state-cyclones', name: 'Iowa State Cyclones' },
  { slug: 'kansas-jayhawks', name: 'Kansas Jayhawks' },
  { slug: 'texas-tech-red-raiders', name: 'Texas Tech Red Raiders' },
  { slug: 'byu-cougars', name: 'BYU Cougars' },
  { slug: 'ucf-knights', name: 'UCF Knights' },
  { slug: 'tcu-horned-frogs', name: 'TCU Horned Frogs' },
  { slug: 'west-virginia-mountaineers', name: 'West Virginia Mountaineers' },
  { slug: 'arizona-state-sun-devils', name: 'Arizona State Sun Devils' },
  { slug: 'cincinnati-bearcats', name: 'Cincinnati Bearcats' },
  { slug: 'oklahoma-state-cowboys', name: 'Oklahoma State Cowboys' },
  { slug: 'baylor-bears', name: 'Baylor Bears' },
  { slug: 'uconn-huskies', name: 'UConn Huskies' },
  { slug: 'st-johns-red-storm', name: "St. John's Red Storm" },
  { slug: 'villanova-wildcats', name: 'Villanova Wildcats' },
  { slug: 'seton-hall-pirates', name: "Seton Hall Pirates" },
  { slug: 'creighton-bluejays', name: 'Creighton Bluejays' },
  { slug: 'gonzaga-bulldogs', name: 'Gonzaga Bulldogs' },
  { slug: 'utah-state-aggies', name: 'Utah State Aggies' },
  { slug: 'saint-louis-billikens', name: "Saint Louis Billikens" },
  { slug: 'saint-marys-gaels', name: "Saint Mary's Gaels" },
  { slug: 'miami-ohio-redhawks', name: 'Miami (Ohio) RedHawks' },
  { slug: 'santa-clara-broncos', name: 'Santa Clara Broncos' },
  { slug: 'new-mexico-lobos', name: 'New Mexico Lobos' },
  { slug: 'san-diego-state-aztecs', name: 'San Diego State Aztecs' },
  { slug: 'vcu-rams', name: 'VCU Rams' },
  { slug: 'belmont-bruins', name: 'Belmont Bruins' },
  { slug: 'south-florida-bulls', name: 'South Florida Bulls' },
  { slug: 'boise-state-broncos', name: 'Boise State Broncos' },
  { slug: 'grand-canyon-lopes', name: 'Grand Canyon Lopes' },
  { slug: 'nevada-wolf-pack', name: 'Nevada Wolf Pack' },
  { slug: 'tulsa-golden-hurricane', name: 'Tulsa Golden Hurricane' },
  { slug: 'liberty-flames', name: 'Liberty Flames' },
  { slug: 'dayton-flyers', name: 'Dayton Flyers' },
  { slug: 'mcneese-cowboys', name: 'McNeese Cowboys' },
];

function toEspnSlug(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s*\([^)]+\)\s*/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Our slug -> ESPN API slug (when different) */
const SLUG_OVERRIDES = {
  'uconn-huskies': 'connecticut-huskies',
  'miami-ohio-redhawks': 'miami-oh-redhawks',
  'st-johns-red-storm': 'st-johns-red-storm',
  'saint-marys-gaels': 'saint-marys-gaels',
  'saint-louis-billikens': 'saint-louis-billikens',
  'grand-canyon-lopes': 'grand-canyon-antelopes',
  'mcneese-cowboys': 'mcneese-state-cowboys',
};

function getInitials(name) {
  const n = (name || '').trim();
  if (!n) return '?';
  const words = n.split(/\s+/);
  if (words.length === 1) return n.slice(0, 2).toUpperCase();
  if (n.startsWith('St.') || n.startsWith('Saint')) return (words[0].slice(0, 1) + (words[1]?.[0] || '')).toUpperCase();
  const first = words[0], last = words[words.length - 1];
  if (['UCLA','USC','BYU','UCF','VCU','LSU','SMU'].includes(first)) return first.slice(0, 2);
  if (first === 'NC' && words[1] === 'State') return 'NC';
  if (first === 'Texas' && words[1] === 'A&M') return 'TA';
  if (first === 'Miami' && words[1]?.startsWith('(Ohio)')) return 'MO';
  return (first[0] + (last?.[0] || first[1] || '')).toUpperCase();
}

const PALETTE = ['#3C79B4', '#C9ECF5', '#B7986C', '#1a2d3d'];

function getColor(index) {
  return PALETTE[index % PALETTE.length];
}

function generateFallbackSvg(team) {
  const initials = getInitials(team.name);
  const bg = getColor(TEAMS.findIndex((t) => t.slug === team.slug));
  const fg = bg === '#C9ECF5' ? '#1a2d3d' : '#fff';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="8" fill="${bg}"/>
  <text x="32" y="38" text-anchor="middle" font-size="24" font-weight="700" fill="${fg}" font-family="system-ui,sans-serif">${initials.slice(0, 2)}</text>
  <text x="32" y="56" text-anchor="middle" font-size="5" fill="${fg}" opacity="0.8" font-family="system-ui,sans-serif">${escapeXml(team.name.slice(0, 20))}</text>
</svg>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FORCE = process.argv.includes('--force');
const FALLBACKS_ONLY = process.argv.includes('--fallbacks-only');
mkdirSync(LOGOS_DIR, { recursive: true });

async function fetchEspnTeams() {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400');
  if (!res.ok) throw new Error(`ESPN API ${res.status}`);
  const json = await res.json();
  const league = json.sports?.[0]?.leagues?.[0];
  const teams = league?.teams?.map((t) => t.team) || [];
  return teams;
}

function findEspnMatch(ourTeam, espnTeams) {
  const ourSlug = ourTeam.slug;
  const override = SLUG_OVERRIDES[ourSlug];
  const ourNorm = toEspnSlug(ourTeam.name);
  for (const e of espnTeams) {
    const espnSlug = (e.slug || '').toLowerCase();
    const espnName = (e.displayName || e.name || '').toLowerCase();
    if (override && espnSlug === override) return e;
    if (espnSlug === ourSlug || espnSlug === ourNorm) return e;
    if (espnName === ourTeam.name.toLowerCase()) return e;
    const espnNorm = toEspnSlug(e.displayName || e.name || '');
    if (espnNorm === ourNorm || espnNorm === ourSlug) return e;
  }
  return null;
}

async function main() {
  let espnTeams = [];
  if (!FALLBACKS_ONLY) {
    console.log('Fetching ESPN team list...');
    espnTeams = await fetchEspnTeams();
    console.log(`Found ${espnTeams.length} ESPN teams`);
  } else {
    console.log('Generating fallbacks only (--fallbacks-only)');
  }

  let fetched = 0, generated = 0;

  for (const team of TEAMS) {
    const outSvg = join(LOGOS_DIR, `${team.slug}.svg`);
    const outPng = join(LOGOS_DIR, `${team.slug}.png`);
    if (!FORCE && (existsSync(outSvg) || existsSync(outPng))) {
      console.log(`  Skip ${team.slug} (exists)`);
      continue;
    }

    const match = findEspnMatch(team, espnTeams);
    let logoUrl = null;
    if (match?.logos?.length) {
      const logo = match.logos.find((l) => l.rel?.includes('default')) || match.logos[0];
      logoUrl = logo?.href;
    }

    if (logoUrl && logoUrl.includes('teamlogos')) {
      try {
        await new Promise((r) => setTimeout(r, 100));
        const res = await fetch(logoUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 500_000) {
            writeFileSync(outPng, buf);
            console.log(`  Fetched ${team.slug} -> .png`);
            fetched++;
            continue;
          }
        }
      } catch (e) {
        console.warn(`  Fetch failed ${team.slug}: ${e.message}`);
      }
    }

    const svg = generateFallbackSvg(team);
    writeFileSync(outSvg, svg, 'utf8');
    console.log(`  Generated ${team.slug} -> .svg`);
    generated++;
  }

  console.log(`\nDone. Fetched: ${fetched}, Generated: ${generated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
