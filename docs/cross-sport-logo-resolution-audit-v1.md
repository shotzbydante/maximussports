# Cross-Sport Logo Resolution — Root-Cause Audit

**Status:** Resolved in this PR. Permanent sport-aware resolver in place.

## Observed bug

On `/nba`, NBA picks rendered **MLB logos**:
- Boston Celtics card → Boston Red Sox logo
- Philadelphia 76ers → Phillies logo
- (any NBA team whose slug collides with an MLB team)

Visible on the NBA Top Play hero, NBA pick cards, and the NBA home preview.

## Root cause

**Slug collision + a hard-coded MLB logo helper inside a sport-agnostic component.**

The shared picks components — `TopPlayHero.jsx`, `PickCardV2.jsx` (both in `src/components/mlb/picks/`) — are now consumed by both MLB and NBA via the unified `MlbMaximusPicksSectionV2` container. Both files imported `getMlbEspnLogoUrl` from `src/utils/espnMlbLogos.js`:

```js
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
// ...
const awayLogo = awaySlug ? getMlbEspnLogoUrl(awaySlug) : null;
```

`getMlbEspnLogoUrl(slug)` returns `/logos/mlb/{slug}.png` when the slug is in the MLB allowlist. **Slug is the only input — no sport context.**

### Slug collisions between NBA and MLB

| Slug | MLB team | NBA team |
|---|---|---|
| `bos` | Red Sox | Celtics |
| `phi` | Phillies | 76ers |
| `cle` | Guardians | Cavaliers |
| `atl` | Braves | Hawks |
| `mia` | Marlins | Heat |
| `det` | Tigers | Pistons |
| `min` | Twins | Timberwolves |
| `tor` | Blue Jays | Raptors |
| `mil` | Brewers | Bucks |
| `hou` | Astros | Rockets |

For any colliding slug, `getMlbEspnLogoUrl('bos')` happily returned `/logos/mlb/bos.png` regardless of context.

### Why the NBA builder didn't save us

`buildNbaPicksV2` stamps each pick's `matchup.awayTeam.logo` with the ESPN CDN NBA URL from `api/nba/live/_normalize.js` (`https://a.espncdn.com/i/teamlogos/nba/500/{eid}.png`). The NBA logo *was* present on the pick object. But the UI **ignored it** and derived a logo from the slug alone via the MLB helper. The backend was correct; the UI was the single point of failure.

### Other callers audited

| File | Status |
|---|---|
| `src/features/mlb/picks/normalizeMlbMatchup.js` | Safe — MLB-only pipeline. |
| `src/features/mlb/contentStudio/normalizeMlbImagePayload.js` | Safe — MLB-only pipeline. |
| `src/emails/templates/mlbPicks.js` / `mlbTeamDigest.js` / `globalBriefing.js` | Safe — all MLB-only. The global briefing is MLB picks digest with an MLB abbrev→slug map. No NBA is rendered here today. |
| `src/emails/MlbEmailShell.js` → `mlbTeamLogoImg()` | Safe — MLB-only shell. |
| `src/components/mlb/picks/TopPlayHero.jsx` | **WAS** the leak. Fixed. |
| `src/components/mlb/picks/PickCardV2.jsx` | **WAS** the leak. Fixed. |

The leak surface is bounded to the shared picks components. Every other caller is a sport-scoped path whose name (`mlb*`) pins its context.

## Permanent fix

New sport-aware resolver at `src/utils/teamLogo.js`:

```js
resolveTeamLogo({ sport, slug, team, pick, fallbackUrl })
  - sport must be resolvable from one of: sport arg, pick.sport, team.sport
  - refuses to guess: unknown/missing sport → null (NEVER cross-sport)
  - accepts team.logo fallback ONLY when it matches the sport's asset
    signature (/logos/mlb/ or teamlogos/nba/). MLB pick with team.logo
    pointing at an NBA CDN URL is rejected.
```

Plus a new `getNbaEspnLogoUrl(slug)` helper that returns the ESPN CDN NBA URL based on `NBA_ESPN_IDS` in `src/sports/nba/teams.js`.

Both shared components now pass the whole `pick` through, and the resolver reads `pick.sport` — stamped by both `buildMlbPicksV2` (sport='mlb') and `buildNbaPicksV2` (sport='nba').

## Rules now enforced

1. **Every logo lookup in a shared component must pass the sport.** The resolver's first argument is `sport` (or an object whose `pick.sport` / `team.sport` resolves it).
2. **Unknown sport → null.** No fallback to another sport's asset path, ever.
3. **`team.logo` fallback is sport-validated.** A URL is only accepted as a fallback when it matches the sport's asset signature — so even a malformed backend payload can't trick the UI into rendering the wrong sport.
4. **Sport-scoped MLB helpers (`mlbTeamLogoImg`, `getMlbEspnLogoUrl`) stay** — but are NOT imported into sport-agnostic surfaces going forward. Any future shared surface must import `resolveTeamLogo`.

## Regression coverage added

Tests in `src/utils/teamLogo.test.js` specifically assert:
- NBA `bos` → NBA Celtics URL (not MLB)
- MLB `bos` → MLB Red Sox URL (not NBA)
- NBA `phi` → 76ers URL
- MLB `phi` → Phillies URL
- Unknown sport → null (no silent cross-sport leak)
- `team.logo` fallback matching the wrong sport's signature is rejected
- Every slug collision (bos/phi/cle/atl/mia/det/min/tor/mil/hou) returns the correct sport-specific URL in both directions

## How to prevent future recurrence

- Any new shared surface that renders team logos must import `resolveTeamLogo`, not `getMlbEspnLogoUrl`.
- `getMlbEspnLogoUrl` remains exported (used by MLB-only pipelines) but its callers are now verifiable: grep for it across `src/` and each result should live under an `mlb/` directory.
- Tests in `src/utils/teamLogo.test.js` are the invariant guard.

*End of audit.*
