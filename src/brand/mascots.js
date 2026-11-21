/**
 * Canonical Maximus mascots, one per sport (asset pack: brand/asset-pack-2026-11).
 *
 *   flat   — 2D sticker art. Use inside the app (nav, cards, loaders, slides).
 *   render — 3D art. Use on the home landing pages (public and signed-in).
 *   slot   — the square in-app 2D file older components reference by path.
 *
 * Football is the brand default. Hockey and soccer are stored but not wired
 * to a workspace yet: when those sports launch, point the workspace theme at
 * MASCOTS.hockey / MASCOTS.soccer (see src/workspaces/config.js).
 */
const dir = '/brand/mascots';

export const MASCOTS = {
  football:   { flat: `${dir}/football-2d.webp`,   render: `${dir}/football-3d.webp`,   slot: '/mascot.png',            live: true },
  basketball: { flat: `${dir}/basketball-2d.webp`, render: `${dir}/basketball-3d.webp`, slot: '/mascot-basketball.png', live: true },
  baseball:   { flat: `${dir}/baseball-2d.webp`,   render: `${dir}/baseball-3d.webp`,   slot: '/mascot-mlb.png',        live: true },
  hockey:     { flat: `${dir}/hockey-2d.webp`,     render: `${dir}/hockey-3d.webp`,     slot: `${dir}/hockey-2d.webp`,  live: false },
  soccer:     { flat: `${dir}/soccer-2d.webp`,     render: `${dir}/soccer-3d.webp`,     slot: `${dir}/soccer-2d.webp`,  live: false },
};

export const DEFAULT_SPORT = 'football';

/** League / workspace id → sport. Add nhl, mls, nfl here as they launch. */
export const LEAGUE_SPORT = {
  mlb: 'baseball',
  nba: 'basketball',
  ncaam: 'basketball',
  cbb: 'basketball',
  nfl: 'football',
  ncaaf: 'football',
  nhl: 'hockey',
  mls: 'soccer',
  epl: 'soccer',
};

export function mascotFor(leagueOrSport) {
  const key = String(leagueOrSport || '').toLowerCase();
  return MASCOTS[key] || MASCOTS[LEAGUE_SPORT[key]] || MASCOTS[DEFAULT_SPORT];
}
